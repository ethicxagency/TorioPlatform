import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { buildCapiEvent, MAX_EVENT_AGE_MS, sendCapi, type CapiEvent } from './meta-capi';

export interface PixelTarget {
  /** "platform", or a workspace id. Rows and idempotency are kept per owner. */
  ownerKey: string;
  pixelId: string;
  token: string;
}
const MAX_ATTEMPTS = 5;
/** Waits before attempts 2..5 (exponential), in milliseconds. */
const BACKOFF_MS = [2_000, 10_000, 60_000, 300_000];

/**
 * Records every Conversions API event and delivers it. Delivery never blocks the caller: `track` returns once the event is stored, a
 * failure is kept with its reason and retried with backoff, and an event that is too old, refused, or out of attempts becomes DEAD
 * (visible, with a manual retry for the ones that failed for a reason that has since been fixed). (owner, eventId) is unique, so a repeated
 * action or webhook can never produce a second event.
 */
@Injectable()
export class MetaEventsService {
  private readonly log = new Logger(MetaEventsService.name);
  fetch: typeof fetch = (...a) => fetch(...a);
  /** Pending in-process retry timers, so a deployment restart simply leaves the rows for the manual retry. */
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Stores the event and starts delivering it. Resolves to `false` when this event id was already recorded. */
  async track(target: PixelTarget, e: CapiEvent, opts: { wait?: boolean } = {}): Promise<boolean> {
    const payload = buildCapiEvent(e);
    let id: string;
    try {
      const row = await this.prisma.client.metaTrackingEvent.create({
        data: {
          ownerKey: target.ownerKey,
          eventName: e.eventName,
          eventId: e.eventId,
          payload: payload as Prisma.InputJsonValue,
          eventTime: e.eventTime,
        },
        select: { id: true },
      });
      id = row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      this.log.warn('Could not record a tracking event');
      return false;
    }
    const run = this.deliver(id, target);
    if (opts.wait) await run;
    else void run.catch(() => undefined);
    return true;
  }

  /** One delivery attempt for a stored event, and the scheduling of the next one if it can be retried. */
  async deliver(id: string, target: PixelTarget): Promise<void> {
    const db = this.prisma.client;
    const row = await db.metaTrackingEvent.findUnique({ where: { id } });
    if (!row || row.status === 'SENT' || row.status === 'DEAD' || row.ownerKey !== target.ownerKey)
      return;
    if (Date.now() - row.eventTime.getTime() > MAX_EVENT_AGE_MS) {
      await db.metaTrackingEvent.update({
        where: { id },
        data: { status: 'DEAD', lastError: 'Older than seven days, which Meta no longer accepts' },
      });
      return;
    }
    const attempts = row.attempts + 1;
    const r = await sendCapi(
      this.fetch,
      this.config.META_GRAPH_VERSION,
      target.pixelId,
      target.token,
      row.payload as Record<string, unknown>,
    );
    const exhausted = r.outcome === 'retry' && attempts >= MAX_ATTEMPTS;
    await db.metaTrackingEvent.update({
      where: { id },
      data: {
        attempts,
        status:
          r.outcome === 'sent' ? 'SENT' : r.outcome === 'dead' || exhausted ? 'DEAD' : 'FAILED',
        lastError: r.outcome === 'sent' ? null : r.message,
        sentAt: r.outcome === 'sent' ? new Date() : null,
        nextTryAt:
          r.outcome === 'retry' && !exhausted
            ? new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? 300_000))
            : null,
      },
    });
    if (r.outcome === 'retry' && !exhausted) {
      const t = setTimeout(
        () => {
          this.timers.delete(t);
          void this.deliver(id, target).catch(() => undefined);
        },
        BACKOFF_MS[attempts - 1] ?? 300_000,
      );
      t.unref();
      this.timers.add(t);
    }
  }

  /** Sends every FAILED or DEAD-but-recent event of one owner again. DEAD events older than seven days stay dead. */
  async retry(target: PixelTarget): Promise<{ retried: number }> {
    const db = this.prisma.client;
    const rows = await db.metaTrackingEvent.findMany({
      where: {
        ownerKey: target.ownerKey,
        status: { in: ['FAILED', 'DEAD'] },
        eventTime: { gt: new Date(Date.now() - MAX_EVENT_AGE_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const r of rows) {
      await db.metaTrackingEvent.update({
        where: { id: r.id },
        data: { status: 'FAILED', attempts: 0, nextTryAt: null },
      });
      await this.deliver(r.id, target);
    }
    return { retried: rows.length };
  }

  async list(ownerKey: string, page: number, pageSize: number, status?: string) {
    const db = this.prisma.client;
    const where = { ownerKey, ...(status ? { status } : {}) };
    const [rows, total, counts, last] = await Promise.all([
      db.metaTrackingEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.metaTrackingEvent.count({ where }),
      db.metaTrackingEvent.groupBy({ by: ['status'], where: { ownerKey }, _count: { _all: true } }),
      db.metaTrackingEvent.findFirst({
        where: { ownerKey, status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        eventName: r.eventName,
        eventId: r.eventId,
        reference:
          ((r.payload as { custom_data?: { order_id?: unknown } } | null)?.custom_data?.order_id as
            string | undefined) ?? null,
        status: r.status,
        attempts: r.attempts,
        lastError: r.lastError,
        eventTime: r.eventTime.toISOString(),
        sentAt: r.sentAt?.toISOString() ?? null,
        nextTryAt: r.nextTryAt?.toISOString() ?? null,
      })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      summary: {
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        lastSentAt: last?.sentAt?.toISOString() ?? null,
      },
    };
  }
}
