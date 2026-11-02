import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import type { UpdateChannelInput } from '@torio/contracts';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';

type Provider = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER';

/**
 * Honest provider catalog. No messaging provider integration (OAuth, webhooks, sending) exists in this build, so
 * nothing is "available"; flip `state` per provider only when its real connection flow ships.
 */
const CATALOG: Record<Provider, { label: string; requirements: string[] }> = {
  WHATSAPP: {
    label: 'WhatsApp Business',
    requirements: [
      'A WhatsApp Business account',
      'A phone number that is not registered on the consumer WhatsApp app',
      'A Meta business portfolio',
    ],
  },
  INSTAGRAM: {
    label: 'Instagram Messaging',
    requirements: [
      'An Instagram professional (business or creator) account',
      'A linked Facebook Page',
      'Permission to manage that Page',
    ],
  },
  MESSENGER: {
    label: 'Facebook Messenger',
    requirements: ['A Facebook Page you administer', 'Messaging enabled on the Page'],
  },
};
const REASON =
  'Torio’s connection for this provider isn’t built yet, so it can’t be connected from here.';
const DAY = 86_400_000;

/** Every query is scoped by workspaceId. Credentials are never selected or returned. */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get whatsappReady() {
    return !!(
      this.config.META_APP_SECRET &&
      this.config.META_WEBHOOK_VERIFY_TOKEN &&
      this.config.CHANNEL_ENCRYPTION_KEY
    );
  }

  private include = {
    defaultAssignee: { select: { id: true, name: true } },
    defaultTeam: { select: { id: true, name: true } },
  } satisfies Prisma.ChannelInclude;

  private async stats(ws: string, ids: string[]) {
    const db = this.prisma.client;
    if (!ids.length)
      return {
        total: new Map<string, number>(),
        open: new Map<string, number>(),
        unread: new Map<string, number>(),
        last: new Map<string, Date>(),
      };
    const [total, open, unread, last] = await Promise.all([
      db.conversation.groupBy({
        by: ['channelId'],
        where: { workspaceId: ws, channelId: { in: ids } },
        _count: { _all: true },
      }),
      db.conversation.groupBy({
        by: ['channelId'],
        where: { workspaceId: ws, channelId: { in: ids }, status: 'OPEN' },
        _count: { _all: true },
      }),
      db.conversation.groupBy({
        by: ['channelId'],
        where: { workspaceId: ws, channelId: { in: ids }, unreadCount: { gt: 0 } },
        _count: { _all: true },
      }),
      db.conversation.groupBy({
        by: ['channelId'],
        where: { workspaceId: ws, channelId: { in: ids } },
        _max: { lastMessageAt: true },
      }),
    ]);
    const m = (rows: { channelId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.channelId, r._count._all]));
    return {
      total: m(total),
      open: m(open),
      unread: m(unread),
      last: new Map(
        last.flatMap((r) =>
          r._max.lastMessageAt ? [[r.channelId, r._max.lastMessageAt] as const] : [],
        ),
      ),
    };
  }

  private dto(
    c: Prisma.ChannelGetPayload<{ include: ChannelsService['include'] }>,
    st: Awaited<ReturnType<ChannelsService['stats']>>,
  ) {
    return {
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      status: c.status,
      accountName: c.accountName,
      accountMask: c.accountMask,
      connectedAt: c.connectedAt?.toISOString() ?? null,
      disconnectedAt: c.disconnectedAt?.toISOString() ?? null,
      lastHealthCheckAt: c.lastHealthCheckAt?.toISOString() ?? null,
      lastError: c.lastError,
      isSample: c.isSample,
      defaultAssignee: c.defaultAssignee,
      defaultTeam: c.defaultTeam,
      conversationCount: st.total.get(c.id) ?? 0,
      openConversations: st.open.get(c.id) ?? 0,
      unreadConversations: st.unread.get(c.id) ?? 0,
      lastConversationAt: st.last.get(c.id)?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async list(
    ws: string,
    q: { q?: string; provider?: Provider; status?: string; sort: 'name' | 'activity' },
  ) {
    const where: Prisma.ChannelWhereInput = {
      workspaceId: ws,
      ...(q.provider && { provider: q.provider }),
      ...(q.status && { status: q.status as never }),
      ...(q.q && {
        OR: [
          { displayName: { contains: q.q, mode: 'insensitive' } },
          { accountName: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const rows = await this.prisma.client.channel.findMany({
      where,
      include: this.include,
      orderBy: { displayName: 'asc' },
    });
    const st = await this.stats(
      ws,
      rows.map((r) => r.id),
    );
    const data = rows.map((r) => this.dto(r, st));
    if (q.sort === 'activity')
      data.sort((a, b) => (b.lastConversationAt ?? '').localeCompare(a.lastConversationAt ?? ''));
    return { data };
  }

  async get(ws: string, id: string) {
    const row = await this.prisma.client.channel.findFirst({
      where: { id, workspaceId: ws },
      include: this.include,
    });
    if (!row) throw new NotFoundException('Channel not found');
    return this.dto(row, await this.stats(ws, [id]));
  }

  async summary(ws: string) {
    const db = this.prisma.client;
    const [byStatus, sample, convs] = await Promise.all([
      db.channel.groupBy({ by: ['status'], where: { workspaceId: ws }, _count: { _all: true } }),
      db.channel.count({ where: { workspaceId: ws, isSample: true } }),
      db.conversation.count({
        where: { workspaceId: ws, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      }),
    ]);
    const n = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    return {
      total: byStatus.reduce((a, x) => a + x._count._all, 0),
      connected: n('CONNECTED'),
      needsAttention: n('NEEDS_ATTENTION') + n('EXPIRED'),
      disconnected: n('DISCONNECTED'),
      sample,
      conversationsLast30Days: convs,
    };
  }

  async providers(ws: string) {
    const counts = await this.prisma.client.channel.groupBy({
      by: ['provider'],
      where: { workspaceId: ws, status: { not: 'DISCONNECTED' } },
      _count: { _all: true },
    });
    return {
      data: (Object.keys(CATALOG) as Provider[]).map((p) => ({
        provider: p,
        label: CATALOG[p].label,
        ...(p === 'WHATSAPP' && this.whatsappReady
          ? {
              state: 'available' as const,
              reason:
                'Connect a WhatsApp Cloud API number with its phone number ID and access token. Meta Embedded Signup isn’t built yet.',
            }
          : {
              state: 'unavailable' as const,
              reason:
                p === 'WHATSAPP'
                  ? 'WhatsApp isn’t configured on this server (Meta app secret, webhook verify token and encryption key are missing).'
                  : REASON,
            }),
        requirements: CATALOG[p].requirements,
        connectedCount: counts.find((c) => c.provider === p)?._count._all ?? 0,
      })),
    };
  }

  async update(ws: string, actorId: string, id: string, input: UpdateChannelInput) {
    const db = this.prisma.client;
    const cur = await db.channel.findFirst({ where: { id, workspaceId: ws } });
    if (!cur) throw new NotFoundException('Channel not found');
    if (input.defaultAssigneeId) {
      const m = await db.workspaceMembership.findFirst({
        where: { workspaceId: ws, userId: input.defaultAssigneeId, status: 'ACTIVE' },
      });
      if (!m)
        throw new BadRequestException(
          'The default assignee must be an active member of this workspace',
        );
    }
    if (
      input.defaultTeamId &&
      !(await db.team.findFirst({ where: { id: input.defaultTeamId, workspaceId: ws } }))
    )
      throw new BadRequestException('Team not found in this workspace');
    const changes: string[] = [];
    if (input.displayName && input.displayName !== cur.displayName)
      changes.push(`Renamed to “${input.displayName}”`);
    if (input.defaultAssigneeId !== undefined && input.defaultAssigneeId !== cur.defaultAssigneeId)
      changes.push('Default assignee changed');
    if (input.defaultTeamId !== undefined && input.defaultTeamId !== cur.defaultTeamId)
      changes.push('Default team changed');
    await db.$transaction(async (tx) => {
      await tx.channel.update({
        where: { id },
        data: {
          ...(input.displayName && { displayName: input.displayName }),
          ...(input.defaultAssigneeId !== undefined && {
            defaultAssigneeId: input.defaultAssigneeId,
          }),
          ...(input.defaultTeamId !== undefined && { defaultTeamId: input.defaultTeamId }),
        },
      });
      for (const description of changes)
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId,
            action: 'channel.update',
            entityType: 'channel',
            entityId: id,
            metadata: { description },
          },
        });
    });
    return this.get(ws, id);
  }

  /** Marks the channel disconnected locally. Conversations and messages are kept. (No provider token exists to revoke yet.) */
  async disconnect(ws: string, actorId: string, id: string) {
    const cur = await this.prisma.client.channel.findFirst({ where: { id, workspaceId: ws } });
    if (!cur) throw new NotFoundException('Channel not found');
    if (cur.status === 'DISCONNECTED')
      throw new ConflictException('This channel is already disconnected');
    await this.prisma.client.$transaction([
      this.prisma.client.channel.update({
        where: { id },
        data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
      }),
      this.prisma.client.auditLog.create({
        data: {
          workspaceId: ws,
          actorId,
          action: 'channel.disconnect',
          entityType: 'channel',
          entityId: id,
          metadata: { description: 'Channel disconnected. Conversation history was kept.' },
        },
      }),
    ]);
    return this.get(ws, id);
  }

  async activity(ws: string, id: string) {
    await this.get(ws, id);
    const rows = await this.prisma.client.auditLog.findMany({
      where: { workspaceId: ws, entityType: 'channel', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, name: true } } },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        description: (r.metadata as { description?: string } | null)?.description ?? r.action,
        actor: r.actor,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
