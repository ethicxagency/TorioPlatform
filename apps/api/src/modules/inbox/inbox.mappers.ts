import type { Prisma } from '@torio/database';

export const conversationInclude = {
  channel: { select: { id: true, provider: true, displayName: true } },
  assignee: { select: { id: true, name: true } },
  customer: true,
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

export function toCustomerDto(c: ConversationRow['customer']) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    handle: c.handle,
    location: c.location,
    leadStatus: c.leadStatus,
    tags: c.tags,
    notes: c.notes,
    isSample: c.isSample,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toConversationDto(c: ConversationRow) {
  return {
    id: c.id,
    status: c.status,
    priority: c.priority,
    snoozedUntil: c.snoozedUntil?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.lastMessagePreview,
    waitingSince: c.waitingSince?.toISOString() ?? null,
    channel: c.channel,
    assignee: c.assignee,
    customer: toCustomerDto(c.customer),
  };
}

export const messageInclude = {
  author: { select: { id: true, name: true } },
  replyTo: { select: { id: true, body: true, kind: true } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function toMessageDto(m: MessageRow) {
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    author: m.author,
    replyTo: m.replyTo,
    deliveryStatus: m.deliveryStatus,
    createdAt: m.createdAt.toISOString(),
  };
}

export const preview = (body: string) => body.replace(/\s+/g, ' ').slice(0, 140);
