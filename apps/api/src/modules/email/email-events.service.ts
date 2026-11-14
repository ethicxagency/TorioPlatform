import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { type EmailDeliveryQuery } from './types';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../auth/mail.service';
import { renderMail, SAMPLE_VARS, TEMPLATE_KEYS, type TemplateKey } from '../auth/mail-templates';

/** How far a delivery state can only move forward: an old event arriving late never undoes a newer one. */
const RANK: Record<string, number> = {
  QUEUED: 0,
  ACCEPTED: 1,
  TEMP_FAILED: 2,
  DELIVERED: 3,
  OPENED: 4,
  CLICKED: 5,
  FAILED: 6,
  COMPLAINED: 6,
  UNSUBSCRIBED: 6,
};
const MAX_SKEW_S = 15 * 60;

const payloadSchema = z.object({
  signature: z.object({ timestamp: z.string(), token: z.string(), signature: z.string() }),
  'event-data': z
    .object({
      id: z.string().min(1).max(200),
      event: z.string(),
      severity: z.string().optional(),
      reason: z.string().optional(),
      timestamp: z.number().optional(),
      message: z
        .object({ headers: z.record(z.string(), z.unknown()).optional() })
        .partial()
        .optional(),
      'user-variables': z.record(z.string(), z.unknown()).optional(),
      'delivery-status': z
        .object({ message: z.string().optional(), description: z.string().optional() })
        .partial()
        .optional(),
    })
    .passthrough(),
});

const STATUS_OF = (event: string, severity?: string): string | null => {
  switch (event) {
    case 'accepted':
      return 'ACCEPTED';
    case 'delivered':
      return 'DELIVERED';
    case 'failed':
      return severity === 'temporary' ? 'TEMP_FAILED' : 'FAILED';
    case 'opened':
      return 'OPENED';
    case 'clicked':
      return 'CLICKED';
    case 'complained':
      return 'COMPLAINED';
    case 'unsubscribed':
      return 'UNSUBSCRIBED';
    default:
      return null;
  }
};

/** Mailgun's delivery events, and the Super Admin view of them. */
@Injectable()
export class EmailEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Processes one Mailgun webhook. The signature (HMAC-SHA256 over timestamp + token with the webhook signing key) and the
   * timestamp are checked before anything else, and an event id already seen is acknowledged without being applied again.
   */
  async handleMailgun(raw: unknown): Promise<{ ok: true; duplicate?: true; ignored?: true }> {
    const key = await this.mail.webhookSigningKey();
    if (!key)
      throw new ServiceUnavailableException(
        'Delivery tracking is not set up: no webhook signing key is saved.',
      );
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Unrecognised webhook payload');
    const { signature: sig, 'event-data': ev } = parsed.data;
    const want = createHmac('sha256', key)
      .update(sig.timestamp + sig.token)
      .digest();
    const got = Buffer.from(sig.signature, 'hex');
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new UnauthorizedException('Invalid signature');
    const age = Math.abs(Date.now() / 1000 - Number(sig.timestamp));
    if (!Number.isFinite(age) || age > MAX_SKEW_S) throw new UnauthorizedException('Stale webhook');

    const db = this.prisma.client;
    const fresh = await db.integrationWebhookEvent.createMany({
      data: [{ provider: 'mailgun', eventId: ev.id, type: ev.event }],
      skipDuplicates: true,
    });
    if (fresh.count === 0) return { ok: true, duplicate: true };

    const status = STATUS_OF(ev.event, ev.severity);
    if (!status) return { ok: true, ignored: true };
    const logId = String(ev['user-variables']?.log_id ?? '');
    const msgId = String(ev.message?.headers?.['message-id'] ?? '').replace(/^<|>$/g, '');
    const row =
      logId && /^[0-9a-f-]{36}$/i.test(logId)
        ? await db.emailDeliveryLog.findUnique({ where: { id: logId } })
        : msgId
          ? await db.emailDeliveryLog.findFirst({ where: { providerMessageId: msgId } })
          : null;
    if (!row) return { ok: true, ignored: true };
    const at = ev.timestamp ? new Date(ev.timestamp * 1000) : new Date();
    const advance = (RANK[status] ?? 0) >= (RANK[row.status] ?? 0);
    const why = [ev.reason, ev['delivery-status']?.description ?? ev['delivery-status']?.message]
      .filter(Boolean)
      .join(': ')
      .slice(0, 300);
    await db.emailDeliveryLog.update({
      where: { id: row.id },
      data: {
        lastEvent: ev.event,
        lastEventAt: at,
        ...(advance ? { status } : {}),
        ...(status === 'DELIVERED' && !row.deliveredAt ? { deliveredAt: at } : {}),
        ...(status === 'FAILED' || status === 'TEMP_FAILED' ? { error: why || null } : {}),
      },
    });
    return { ok: true };
  }

  async deliveries(q: EmailDeliveryQuery) {
    const db = this.prisma.client;
    const where = q.status ? { status: q.status } : {};
    const since = new Date(Date.now() - 86_400_000);
    const [rows, total, grouped, delivered, failure] = await Promise.all([
      db.emailDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.emailDeliveryLog.count({ where }),
      db.emailDeliveryLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.emailDeliveryLog.findFirst({
        where: { deliveredAt: { not: null } },
        orderBy: { deliveredAt: 'desc' },
        select: { deliveredAt: true },
      }),
      db.emailDeliveryLog.findFirst({
        where: { status: { in: ['FAILED', 'TEMP_FAILED', 'COMPLAINED'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        kind: r.kind,
        to: r.toAddress,
        subject: r.subject,
        status: r.status as never,
        error: r.error,
        attempts: r.attempts,
        createdAt: r.createdAt.toISOString(),
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        lastEvent: r.lastEvent,
        lastEventAt: r.lastEventAt?.toISOString() ?? null,
      })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
      summary: {
        activeProvider: this.mail.provider,
        last24h: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
        lastDeliveredAt: delivered?.deliveredAt?.toISOString() ?? null,
        lastFailure: failure
          ? { at: failure.createdAt.toISOString(), to: failure.toAddress, error: failure.error }
          : null,
        webhookReady: !!(await this.mail.webhookSigningKey()),
      },
    };
  }

  templates() {
    return {
      data: TEMPLATE_KEYS.map((k) => ({
        key: k,
        subject: renderMail(k, SAMPLE_VARS[k], this.mail.brand()).subject,
      })),
    };
  }

  preview(key: string) {
    if (!TEMPLATE_KEYS.includes(key as TemplateKey))
      throw new BadRequestException('Unknown template');
    const k = key as TemplateKey;
    // The sample workspace email shows a workspace brand; every other template keeps Torio's.
    const brand =
      k === 'workspace_notice' ? this.mail.brand('Sample Store', null) : this.mail.brand();
    return { key, ...renderMail(k, SAMPLE_VARS[k], brand) };
  }
}
