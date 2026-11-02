import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { SOCKET_EVENTS } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const STOP = new Set(['stop', 'unsubscribe', 'cancel', 'optout', 'opt out']);
const START = new Set(['start', 'unstop', 'subscribe', 'optin', 'opt in']);
const RANK = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 } as const;
const digits = (v: string) => v.replace(/\D/g, '');

interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
}
interface WaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errors?: { code?: number; title?: string; message?: string }[];
}
interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}
export interface WaPayload {
  entry?: { changes?: { value?: WaValue }[] }[];
}

/**
 * Turns WhatsApp webhook payloads into Inbox data. Every event is first written to ProviderWebhookEvent under a
 * unique (provider, eventKey); a redelivery hits the unique key and is skipped, so processing is idempotent. Failures
 * keep the stored event as FAILED so they can be retried; nothing is lost when processing throws.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly log = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async process(payload: WaPayload) {
    const out = { processed: 0, duplicates: 0, failed: 0, ignored: 0 };
    for (const entry of payload.entry ?? [])
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        const pnid = v.metadata?.phone_number_id;
        const channel = pnid
          ? await this.prisma.client.channel.findFirst({
              where: { provider: 'WHATSAPP', externalAccountId: pnid },
              select: { id: true, workspaceId: true },
            })
          : null;
        const events: { key: string; run: () => Promise<void>; raw: object }[] = [
          ...(v.messages ?? []).map((m) => ({
            key: `msg:${m.id}`,
            raw: m,
            run: () => this.inbound(channel!, v, m),
          })),
          ...(v.statuses ?? []).map((s) => ({
            key: `status:${s.id}:${s.status}`,
            raw: s,
            run: () => this.status(channel!, s),
          })),
        ];
        for (const e of events) {
          const r = await this.record(e.key, e.raw, channel);
          if (r === 'duplicate') {
            out.duplicates++;
            continue;
          }
          if (!channel) {
            await this.finish(r, 'IGNORED', 'No channel is connected for this phone number');
            out.ignored++;
            continue;
          }
          try {
            await e.run();
            await this.finish(r, 'PROCESSED');
            out.processed++;
          } catch (err) {
            this.log.error(`WhatsApp event ${e.key} failed: ${String(err)}`);
            await this.finish(r, 'FAILED', err instanceof Error ? err.message : String(err));
            out.failed++;
          }
        }
      }
    return out;
  }

  /** Re-run events that failed earlier (called by an operator endpoint or a future worker). */
  async retryFailed(limit = 50) {
    const rows = await this.prisma.client.providerWebhookEvent.findMany({
      where: { provider: 'WHATSAPP', status: 'FAILED', attempts: { lt: 5 } },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    let ok = 0;
    for (const row of rows) {
      const raw = row.payload as unknown as WaMessage & WaStatus;
      const channel = row.channelId
        ? await this.prisma.client.channel.findUnique({
            where: { id: row.channelId },
            select: { id: true, workspaceId: true },
          })
        : null;
      if (!channel) continue;
      try {
        if (row.eventKey.startsWith('msg:')) await this.inbound(channel, {}, raw);
        else await this.status(channel, raw);
        await this.finish(row.id, 'PROCESSED');
        ok++;
      } catch (err) {
        await this.finish(row.id, 'FAILED', err instanceof Error ? err.message : String(err));
      }
    }
    return { retried: rows.length, processed: ok };
  }

  /** Returns the new event id, or 'duplicate' when this exact event was already received. */
  private async record(
    key: string,
    raw: object,
    channel: { id: string; workspaceId: string } | null,
  ) {
    try {
      const row = await this.prisma.client.providerWebhookEvent.create({
        data: {
          provider: 'WHATSAPP',
          eventKey: key,
          channelId: channel?.id,
          workspaceId: channel?.workspaceId,
          payload: raw as Prisma.InputJsonValue,
        },
      });
      return row.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return 'duplicate' as const;
      throw e;
    }
  }

  private finish(id: string, status: 'PROCESSED' | 'FAILED' | 'IGNORED', error?: string) {
    return this.prisma.client.providerWebhookEvent.update({
      where: { id },
      data: {
        status,
        error: error?.slice(0, 500) ?? null,
        processedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  private async inbound(ch: { id: string; workspaceId: string }, v: WaValue, m: WaMessage) {
    const db = this.prisma.client;
    const ws = ch.workspaceId;
    const key = digits(m.from);
    const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
    const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
    const text =
      m.type === 'text' && m.text?.body
        ? m.text.body
        : `[${m.type} message — media isn’t supported in Torio yet]`;

    const { conversationId, messageId } = await db.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({
        where: { workspaceId_phoneKey: { workspaceId: ws, phoneKey: key } },
      });
      customer ??= await tx.customer.create({
        data: {
          workspaceId: ws,
          name: name?.trim() || `+${key}`,
          phone: `+${key}`,
          phoneKey: key,
          source: 'WHATSAPP',
        },
      });
      let conv = await tx.conversation.findFirst({
        where: {
          workspaceId: ws,
          channelId: ch.id,
          customerId: customer.id,
          status: { not: 'RESOLVED' },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      conv ??= await tx.conversation.create({
        data: { workspaceId: ws, channelId: ch.id, customerId: customer.id },
      });
      const msg = await tx.message.create({
        data: {
          workspaceId: ws,
          conversationId: conv.id,
          kind: 'INBOUND',
          body: text,
          externalId: m.id,
          createdAt: at,
        },
      });
      await tx.conversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: at,
          lastInboundAt: at,
          lastMessagePreview: text.slice(0, 120),
          unreadCount: { increment: 1 },
          waitingSince: conv.waitingSince ?? at,
          ...(conv.status === 'SNOOZED' && { status: 'OPEN', snoozedUntil: null }),
        },
      });
      const word = text.trim().toLowerCase();
      if (STOP.has(word))
        await tx.customer.update({
          where: { id: customer.id },
          data: { messagingOptOutAt: new Date() },
        });
      else if (START.has(word) && customer.messagingOptOutAt)
        await tx.customer.update({ where: { id: customer.id }, data: { messagingOptOutAt: null } });
      return { conversationId: conv.id, messageId: msg.id };
    });
    this.emit(ws, conversationId, SOCKET_EVENTS.messageCreated, { conversationId, messageId });
  }

  private async status(ch: { id: string; workspaceId: string }, s: WaStatus) {
    const db = this.prisma.client;
    const msg = await db.message.findFirst({
      where: { workspaceId: ch.workspaceId, externalId: s.id, kind: 'OUTBOUND' },
    });
    if (!msg) return; // status for a message Torio didn't send, or one not stored yet
    let data: Prisma.MessageUpdateInput | null = null;
    if (s.status === 'failed') {
      const e = s.errors?.[0];
      data = {
        deliveryStatus: 'FAILED',
        errorMessage: (e?.message ?? e?.title ?? 'WhatsApp could not deliver this message').slice(
          0,
          300,
        ),
      };
    } else {
      const next = s.status.toUpperCase() as keyof typeof RANK;
      const cur = (msg.deliveryStatus ?? 'PENDING') as keyof typeof RANK | 'FAILED';
      // Statuses can arrive out of order; never move a message backwards.
      if (cur === 'FAILED' || RANK[next] > RANK[cur])
        data = { deliveryStatus: next, errorMessage: null };
    }
    if (!data) return;
    await db.message.update({ where: { id: msg.id }, data });
    this.emit(ch.workspaceId, msg.conversationId, SOCKET_EVENTS.conversationUpdated, {
      conversationId: msg.conversationId,
    });
  }

  private emit(ws: string, conversationId: string, event: string, payload: object) {
    try {
      this.realtime.emitToWorkspace(ws, event, payload);
      this.realtime.emitToConversation(ws, conversationId, event, payload);
    } catch {
      /* realtime is best-effort */
    }
  }
}
