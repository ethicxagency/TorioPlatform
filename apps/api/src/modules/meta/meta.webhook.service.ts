import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { SOCKET_EVENTS } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { MetaGraphProvider } from './meta.graph-provider';
import { unpackCredential } from './meta.credentials';

const RANK = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 } as const;

interface Messaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string }[];
  };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number; mid?: string };
}
export interface MetaPayload {
  object?: string;
  entry?: { id?: string; messaging?: Messaging[] }[];
}
type Ch = { id: string; workspaceId: string; provider: 'MESSENGER' | 'INSTAGRAM'; status: string };
export interface Job {
  eventId: string;
  channel: Ch;
  run: () => Promise<void>;
}

/**
 * Messenger and Instagram webhooks. `ingest` stores every event under a unique (provider, eventKey) so a redelivery is
 * skipped; the caller acknowledges Meta straight away and runs the returned jobs afterwards. A failed job stays FAILED
 * with its error and can be retried; nothing is lost when processing throws.
 */
@Injectable()
export class MetaWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MetaWebhookService.name);
  private sweeper?: NodeJS.Timeout;

  /**
   * Events are stored before Meta is acknowledged, so a crash can only leave them RECEIVED or FAILED, never lost.
   * This sweep picks those up again (a minute apart) so processing survives restarts.
   */
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.sweeper = setInterval(
      () => void this.retryFailed().catch((e) => this.log.error(String(e))),
      60_000,
    );
    this.sweeper.unref();
  }
  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly crypto: ChannelCryptoService,
    private readonly graph: MetaGraphProvider,
    private readonly mc: MetaConfigService,
  ) {}

  /** Records new events and returns the work to do. Fast: no Meta calls, no message writes. */
  async ingest(payload: MetaPayload) {
    const out = { received: 0, duplicates: 0, ignored: 0 };
    const jobs: Job[] = [];
    const provider =
      payload.object === 'instagram' ? 'INSTAGRAM' : payload.object === 'page' ? 'MESSENGER' : null;
    if (!provider) return { ...out, jobs };
    const cfg = await this.mc.load();
    if (
      (provider === 'MESSENGER' && !cfg.messengerEnabled) ||
      (provider === 'INSTAGRAM' && !cfg.instagramEnabled)
    )
      return { ...out, ignored: 1, jobs }; // switched off by Super Admin
    for (const entry of payload.entry ?? []) {
      if (!entry.id) continue;
      const channel = (await this.prisma.client.channel.findFirst({
        where: { provider, externalAccountId: entry.id },
        select: { id: true, workspaceId: true, provider: true, status: true },
      })) as Ch | null;
      for (const ev of entry.messaging ?? []) {
        const built = this.build(provider, channel, ev);
        if (!built) continue;
        const id = await this.record(provider, built.key, ev, channel);
        if (id === 'duplicate') {
          out.duplicates++;
          continue;
        }
        if (!channel || channel.status === 'DISCONNECTED') {
          await this.finish(id, 'IGNORED', 'No connected channel for this account');
          out.ignored++;
          continue;
        }
        out.received++;
        jobs.push({ eventId: id, channel, run: built.run(channel) });
      }
    }
    return { ...out, jobs };
  }

  /** Runs recorded jobs one by one, marking each PROCESSED or FAILED. */
  async run(jobs: Job[]) {
    for (const j of jobs) {
      try {
        await j.run();
        await this.finish(j.eventId, 'PROCESSED');
        await this.prisma.client.channel.update({
          where: { id: j.channel.id },
          data: { lastEventAt: new Date() },
        });
      } catch (err) {
        this.log.error(`Meta event ${j.eventId} failed: ${String(err)}`);
        await this.finish(j.eventId, 'FAILED', err instanceof Error ? err.message : String(err));
      }
    }
  }

  /** Normalizes one messaging event into a stable idempotency key and a handler. */
  private build(provider: 'MESSENGER' | 'INSTAGRAM', channel: Ch | null, ev: Messaging) {
    if (ev.message?.is_echo) return null; // our own outgoing message echoed back
    if (ev.message?.mid && ev.sender?.id)
      return {
        key: `msg:${ev.message.mid}`,
        run: (c: Ch) => () => this.inbound(c, provider, ev),
      };
    // Delivery receipts list the delivered message ids, but `mids` can be absent: then only the watermark is known.
    if (ev.delivery?.mids?.length)
      return {
        key: `delivery:${ev.delivery.mids.join(',')}`,
        run: (c: Ch) => () => this.delivered(c, ev.delivery!.mids!),
      };
    if (ev.delivery?.watermark && ev.sender?.id)
      return {
        key: `delivery-wm:${ev.sender.id}:${ev.delivery.watermark}`,
        run: (c: Ch) => () => this.deliveredUpTo(c, ev.sender!.id!, ev.delivery!.watermark!),
      };
    if (ev.read && (ev.read.mid || ev.read.watermark) && ev.sender?.id)
      return {
        key: `read:${ev.sender.id}:${ev.read.mid ?? ev.read.watermark}`,
        run: (c: Ch) => () => this.read(c, ev.sender!.id!, ev.read!),
      };
    void channel;
    return null;
  }

  private async record(
    provider: 'MESSENGER' | 'INSTAGRAM',
    key: string,
    raw: object,
    channel: Ch | null,
  ) {
    try {
      const row = await this.prisma.client.providerWebhookEvent.create({
        data: {
          provider,
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

  /** Display name for a new contact, best effort: a profile lookup failure must never lose the message. */
  private async profileName(ch: Ch, provider: 'MESSENGER' | 'INSTAGRAM', userId: string) {
    try {
      const row = await this.prisma.client.channelCredential.findUnique({
        where: { channelId: ch.id },
      });
      const cred = row ? unpackCredential(this.crypto.decrypt(row.ciphertext)) : null;
      if (!cred) return {};
      const p = await this.graph
        .get()
        .profile(
          userId,
          cred.token,
          provider === 'INSTAGRAM' ? 'name,username' : 'name,first_name,last_name',
        );
      const name = (p.name ?? [p.first_name, p.last_name].filter(Boolean).join(' ')).trim();
      return { name: name || undefined, username: p.username };
    } catch {
      return {};
    }
  }

  private async inbound(ch: Ch, provider: 'MESSENGER' | 'INSTAGRAM', ev: Messaging) {
    const db = this.prisma.client;
    const ws = ch.workspaceId;
    const psid = ev.sender!.id!;
    const m = ev.message!;
    const at = ev.timestamp ? new Date(ev.timestamp) : new Date();
    const text = m.text?.trim()
      ? m.text
      : `[${m.attachments?.[0]?.type ?? 'unsupported'} message — media isn’t supported in Torio yet]`;
    const known = await db.channelContact.findUnique({
      where: { channelId_externalId: { channelId: ch.id, externalId: psid } },
    });
    const profile = known ? {} : await this.profileName(ch, provider, psid);
    const label = provider === 'INSTAGRAM' ? 'Instagram user' : 'Messenger user';

    const { conversationId, messageId } = await db.$transaction(async (tx) => {
      let customerId = known?.customerId;
      if (!customerId) {
        const customer = await tx.customer.create({
          data: {
            workspaceId: ws,
            name:
              profile.name ||
              (profile.username ? `@${profile.username}` : `${label} ${psid.slice(-4)}`),
            handle: profile.username ? `@${profile.username}` : null,
            source: provider,
          },
        });
        customerId = customer.id;
        await tx.channelContact.create({
          data: { workspaceId: ws, channelId: ch.id, externalId: psid, customerId },
        });
      }
      let conv = await tx.conversation.findFirst({
        where: { workspaceId: ws, channelId: ch.id, customerId, status: { not: 'RESOLVED' } },
        orderBy: { lastMessageAt: 'desc' },
      });
      conv ??= await tx.conversation.create({
        data: { workspaceId: ws, channelId: ch.id, customerId },
      });
      const msg = await tx.message.create({
        data: {
          workspaceId: ws,
          conversationId: conv.id,
          kind: 'INBOUND',
          body: text,
          externalId: m.mid,
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
      return { conversationId: conv.id, messageId: msg.id };
    });
    this.emit(ws, conversationId, SOCKET_EVENTS.messageCreated, { conversationId, messageId });
  }

  private async advance(
    ch: Ch,
    messages: { id: string; conversationId: string; deliveryStatus: string | null }[],
    next: 'DELIVERED' | 'READ',
  ) {
    const db = this.prisma.client;
    for (const msg of messages) {
      const cur = (msg.deliveryStatus ?? 'PENDING') as keyof typeof RANK | 'FAILED';
      // Receipts can arrive out of order; never move a message backwards or revive a failed one.
      if (cur === 'FAILED' || RANK[next] <= RANK[cur]) continue;
      await db.message.update({
        where: { id: msg.id },
        data: { deliveryStatus: next, errorMessage: null },
      });
      this.emit(ch.workspaceId, msg.conversationId, SOCKET_EVENTS.conversationUpdated, {
        conversationId: msg.conversationId,
      });
    }
  }

  private async delivered(ch: Ch, mids: string[]) {
    const rows = await this.prisma.client.message.findMany({
      where: { workspaceId: ch.workspaceId, kind: 'OUTBOUND', externalId: { in: mids } },
      select: { id: true, conversationId: true, deliveryStatus: true },
    });
    await this.advance(ch, rows, 'DELIVERED');
  }

  private async deliveredUpTo(ch: Ch, psid: string, watermark: number) {
    const db = this.prisma.client;
    const contact = await db.channelContact.findUnique({
      where: { channelId_externalId: { channelId: ch.id, externalId: psid } },
    });
    if (!contact) return;
    const rows = await db.message.findMany({
      where: {
        workspaceId: ch.workspaceId,
        kind: 'OUTBOUND',
        externalId: { not: null },
        createdAt: { lte: new Date(watermark) },
        conversation: { channelId: ch.id, customerId: contact.customerId },
      },
      select: { id: true, conversationId: true, deliveryStatus: true },
    });
    await this.advance(ch, rows, 'DELIVERED');
  }

  private async read(ch: Ch, psid: string, r: { watermark?: number; mid?: string }) {
    const db = this.prisma.client;
    const contact = await db.channelContact.findUnique({
      where: { channelId_externalId: { channelId: ch.id, externalId: psid } },
    });
    if (!contact) return;
    const rows = await db.message.findMany({
      where: {
        workspaceId: ch.workspaceId,
        kind: 'OUTBOUND',
        conversation: { channelId: ch.id, customerId: contact.customerId },
        ...(r.mid
          ? { externalId: r.mid }
          : { externalId: { not: null }, createdAt: { lte: new Date(r.watermark!) } }),
      },
      select: { id: true, conversationId: true, deliveryStatus: true },
    });
    await this.advance(ch, rows, 'READ');
  }

  /** Re-run events that failed or were left unfinished. */
  async retryFailed(limit = 50) {
    const rows = await this.prisma.client.providerWebhookEvent.findMany({
      where: {
        provider: { in: ['MESSENGER', 'INSTAGRAM'] },
        attempts: { lt: 5 },
        OR: [
          { status: 'FAILED' },
          // stored but never finished (e.g. the process stopped right after acknowledging Meta)
          { status: 'RECEIVED', receivedAt: { lt: new Date(Date.now() - 30_000) } },
        ],
      },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    const jobs: Job[] = [];
    for (const row of rows) {
      if (!row.channelId) continue;
      const channel = (await this.prisma.client.channel.findUnique({
        where: { id: row.channelId },
        select: { id: true, workspaceId: true, provider: true, status: true },
      })) as Ch | null;
      if (!channel) continue;
      const built = this.build(channel.provider, channel, row.payload as unknown as Messaging);
      if (built) jobs.push({ eventId: row.id, channel, run: built.run(channel) });
    }
    await this.run(jobs);
    return { retried: jobs.length };
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
