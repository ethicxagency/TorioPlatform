import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@torio/database';
import type {
  BulkConversationInput,
  ConversationQuery,
  SendMessageInput,
  UpdateConversationInput,
} from '@torio/contracts';
import { SOCKET_EVENTS } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import { AutomationEngine } from '../automation/automation.engine';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetaDeliveryService } from '../meta/meta.delivery.service';
import { WhatsAppDeliveryService } from '../whatsapp/whatsapp.delivery.service';
import {
  conversationInclude,
  messageInclude,
  preview,
  toConversationDto,
  toMessageDto,
} from './inbox.mappers';

/**
 * Every query in this service is scoped by `workspaceId` (already authorized by
 * WorkspaceAccessGuard). Never look a conversation up by id alone.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly automation: AutomationEngine,
    private readonly whatsapp: WhatsAppDeliveryService,
    private readonly meta: MetaDeliveryService,
  ) {}

  async list(workspaceId: string, userId: string, q: ConversationQuery) {
    const db = this.prisma.client;
    // Lazily wake snoozed conversations whose time has passed.
    await db.conversation.updateMany({
      where: { workspaceId, status: 'SNOOZED', snoozedUntil: { lte: new Date() } },
      data: { status: 'OPEN', snoozedUntil: null },
    });

    const where: Prisma.ConversationWhereInput = { workspaceId, status: q.status };
    if (q.view === 'mine') where.assigneeId = userId;
    if (q.view === 'unassigned') where.assigneeId = null;
    if (q.view === 'unread') where.unreadCount = { gt: 0 };
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.priority) where.priority = q.priority;
    if (q.channel) where.channel = { provider: q.channel };
    const customer: Prisma.CustomerWhereInput = {};
    if (q.tag) customer.tags = { has: q.tag };
    if (Object.keys(customer).length) where.customer = customer;
    if (q.q) {
      const contains = { contains: q.q, mode: 'insensitive' as const };
      where.OR = [
        { customer: { name: contains } },
        { customer: { phone: contains } },
        { customer: { handle: contains } },
        { messages: { some: { kind: { in: ['INBOUND', 'OUTBOUND'] }, body: contains } } },
      ];
    }

    const orderBy: Prisma.ConversationOrderByWithRelationInput[] =
      q.order === 'newest'
        ? [{ lastMessageAt: 'desc' }]
        : q.order === 'priority'
          ? [
              { priority: 'desc' },
              { waitingSince: { sort: 'asc', nulls: 'last' } },
              { lastMessageAt: 'desc' },
            ]
          : [{ waitingSince: { sort: 'asc', nulls: 'last' } }, { lastMessageAt: 'desc' }];

    const [total, rows, grouped, byChannel] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.findMany({
        where,
        orderBy,
        include: conversationInclude,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      // Status counts follow the channel tab (so "4 open" matches the list) but no other filter.
      db.conversation.groupBy({
        by: ['status'],
        where: { workspaceId, ...(q.channel && { channel: { provider: q.channel } }) },
        _count: { _all: true },
      }),
      // Channel badges follow the status tab but no other filter (see conversationChannelCountsSchema).
      db.conversation.groupBy({
        by: ['channelId'],
        where: { workspaceId, status: q.status },
        _count: { _all: true },
      }),
    ]);
    const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    const providers = await db.channel.findMany({
      where: { id: { in: byChannel.map((g) => g.channelId) } },
      select: { id: true, provider: true },
    });
    const channelCounts = { all: 0, WHATSAPP: 0, INSTAGRAM: 0, MESSENGER: 0 };
    for (const g of byChannel) {
      const provider = providers.find((c) => c.id === g.channelId)?.provider;
      if (!provider) continue;
      channelCounts[provider] += g._count._all;
      channelCounts.all += g._count._all;
    }
    return {
      data: rows.map(toConversationDto),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
      counts: { open: count('OPEN'), snoozed: count('SNOOZED'), resolved: count('RESOLVED') },
      channelCounts,
    };
  }

  async get(workspaceId: string, id: string) {
    const row = await this.prisma.client.conversation.findFirst({
      where: { id, workspaceId },
      include: conversationInclude,
    });
    if (!row) throw new NotFoundException('Conversation not found');
    return toConversationDto(row);
  }

  async messages(workspaceId: string, id: string, page: number, pageSize: number) {
    await this.assertExists(workspaceId, id);
    const db = this.prisma.client;
    const where = { conversationId: id, workspaceId };
    const [total, rows] = await Promise.all([
      db.message.count({ where }),
      // Page 1 is the newest page; each page is returned oldest-first.
      db.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: messageInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.reverse().map(toMessageDto),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async send(workspaceId: string, id: string, userId: string, input: SendMessageInput) {
    const db = this.prisma.client;
    const conv = await this.assertExists(workspaceId, id);
    if (input.replyToId) {
      const target = await db.message.findFirst({
        where: { id: input.replyToId, conversationId: id, workspaceId },
      });
      if (!target) throw new BadRequestException('replyToId does not belong to this conversation');
    }
    const isNote = input.kind === 'NOTE';
    const message = await db.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          workspaceId,
          conversationId: id,
          kind: isNote ? 'NOTE' : 'OUTBOUND',
          body: input.body,
          authorId: userId,
          replyToId: input.replyToId,
          // Provider delivery is not implemented yet; replies stay PENDING until a channel worker sends them.
          deliveryStatus: isNote ? null : 'PENDING',
        },
        include: messageInclude,
      });
      if (!isNote) {
        await tx.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: m.createdAt,
            lastMessagePreview: preview(input.body),
            waitingSince: null,
            ...(conv.status === 'SNOOZED' && { status: 'OPEN', snoozedUntil: null }),
          },
        });
      }
      return m;
    });
    this.emit(workspaceId, id, SOCKET_EVENTS.messageCreated, {
      conversationId: id,
      messageId: message.id,
    });
    if (!isNote) {
      // Hands the reply to the provider (WhatsApp, Messenger and Instagram; other channels stay PENDING). Failures are recorded on the
      // message (FAILED + reason) and can be retried, so they never fail the agent's request.
      await this.whatsapp.deliver(workspaceId, message.id).catch(() => undefined);
      await this.meta.deliver(workspaceId, message.id).catch(() => undefined);
      const fresh = await this.prisma.client.message.findUnique({
        where: { id: message.id },
        include: messageInclude,
      });
      if (fresh) return toMessageDto(fresh);
    }
    return toMessageDto(message);
  }

  async update(workspaceId: string, id: string, userId: string, input: UpdateConversationInput) {
    const db = this.prisma.client;
    const conv = await this.assertExists(workspaceId, id);
    const actor = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    const data: Prisma.ConversationUncheckedUpdateInput = {};
    const events: string[] = [];

    if (input.assigneeId !== undefined) {
      if (input.assigneeId === null) {
        data.assigneeId = null;
        events.push(`${actor.name} unassigned this conversation`);
      } else {
        const m = await db.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: input.assigneeId } },
          select: { user: { select: { name: true } } },
        });
        if (!m) throw new BadRequestException('Assignee is not a member of this workspace');
        data.assigneeId = input.assigneeId;
        events.push(
          input.assigneeId === userId
            ? `${actor.name} assigned this to themself`
            : `${actor.name} assigned this to ${m.user.name}`,
        );
      }
    }
    if (input.priority && input.priority !== conv.priority) {
      data.priority = input.priority;
      if (input.priority === 'HIGH') events.push(`${actor.name} marked this as urgent`);
    }
    if (input.status && input.status !== conv.status) {
      data.status = input.status;
      if (input.status === 'RESOLVED') {
        data.unreadCount = 0;
        data.waitingSince = null;
        data.snoozedUntil = null;
        data.resolvedAt = new Date();
        events.push(`${actor.name} resolved this conversation`);
      } else if (input.status === 'SNOOZED') {
        const until = new Date(input.snoozedUntil!);
        if (until.getTime() <= Date.now())
          throw new BadRequestException('snoozedUntil must be in the future');
        data.snoozedUntil = until;
        events.push(`${actor.name} snoozed this until ${until.toISOString()}`);
      } else {
        data.snoozedUntil = null;
        data.resolvedAt = null;
        events.push(
          `${actor.name} ${conv.status === 'RESOLVED' ? 'reopened' : 'unsnoozed'} this conversation`,
        );
      }
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.conversation.update({ where: { id }, data });
      if (events.length) {
        await tx.message.createMany({
          data: events.map((body) => ({
            workspaceId,
            conversationId: id,
            kind: 'EVENT' as const,
            body,
            authorId: userId,
          })),
        });
      }
    });
    this.emit(workspaceId, id, SOCKET_EVENTS.conversationUpdated, { conversationId: id });
    const stamp = Date.now();
    if (data.assigneeId !== undefined && data.assigneeId !== conv.assigneeId)
      await this.automation.emitEvent(
        'conversation.assigned',
        workspaceId,
        'conversation',
        id,
        `${String(data.assigneeId)}@${stamp}`,
      );
    if (data.status && data.status !== conv.status)
      await this.automation.emitEvent(
        'conversation.status_changed',
        workspaceId,
        'conversation',
        id,
        `${String(data.status)}@${stamp}`,
      );
    return this.get(workspaceId, id);
  }

  async setUnread(workspaceId: string, id: string, unread: boolean) {
    const conv = await this.assertExists(workspaceId, id);
    await this.prisma.client.conversation.update({
      where: { id },
      data: { unreadCount: unread ? Math.max(1, conv.unreadCount) : 0 },
    });
    this.emit(workspaceId, id, SOCKET_EVENTS.conversationRead, { conversationId: id });
    return this.get(workspaceId, id);
  }

  async bulk(workspaceId: string, userId: string, input: BulkConversationInput) {
    const where: Prisma.ConversationWhereInput = { id: { in: input.ids }, workspaceId };
    let data: Prisma.ConversationUncheckedUpdateManyInput;
    switch (input.action) {
      case 'ASSIGN_ME':
        data = { assigneeId: userId };
        break;
      case 'ASSIGN': {
        const assigneeId = input.assigneeId ?? null;
        if (assigneeId) {
          const m = await this.prisma.client.workspaceMembership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
            select: { userId: true },
          });
          if (!m) throw new BadRequestException('Assignee is not a member of this workspace');
        }
        data = { assigneeId };
        break;
      }
      case 'MARK_READ':
        data = { unreadCount: 0 };
        break;
      case 'MARK_UNREAD': {
        // Same rule as a single conversation: already-unread ones keep their count, the rest show 1.
        const found = await this.prisma.client.conversation.count({ where });
        await this.prisma.client.conversation.updateMany({
          where: { ...where, unreadCount: 0 },
          data: { unreadCount: 1 },
        });
        input.ids.forEach((id) =>
          this.emit(workspaceId, id, SOCKET_EVENTS.conversationUpdated, { conversationId: id }),
        );
        return { updated: found };
      }
      case 'SET_PRIORITY':
        data = { priority: input.priority! };
        break;
      case 'RESOLVE':
        data = {
          status: 'RESOLVED',
          unreadCount: 0,
          waitingSince: null,
          snoozedUntil: null,
          resolvedAt: new Date(),
        };
        break;
      case 'SNOOZE': {
        const until = input.snoozedUntil ? new Date(input.snoozedUntil) : null;
        if (!until || until.getTime() <= Date.now())
          throw new BadRequestException('snoozedUntil must be a future time');
        data = { status: 'SNOOZED', snoozedUntil: until };
        break;
      }
    }
    const res = await this.prisma.client.conversation.updateMany({ where, data });
    input.ids.forEach((id) =>
      this.emit(workspaceId, id, SOCKET_EVENTS.conversationUpdated, { conversationId: id }),
    );
    return { updated: res.count };
  }

  private async assertExists(workspaceId: string, id: string) {
    const conv = await this.prisma.client.conversation.findFirst({ where: { id, workspaceId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  /** Events carry ids only; clients refetch through REST, so no private content travels over sockets. */
  private emit(workspaceId: string, conversationId: string, event: string, payload: object) {
    try {
      this.realtime.emitToWorkspace(workspaceId, event, payload);
      this.realtime.emitToConversation(workspaceId, conversationId, event, payload);
    } catch {
      /* realtime is best-effort; REST remains the source of truth */
    }
  }
}
