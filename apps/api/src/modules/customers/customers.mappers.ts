import type { Prisma } from '@torio/database';

export const customerInclude = {
  owner: { select: { id: true, name: true } },
  _count: { select: { conversations: true } },
} satisfies Prisma.CustomerInclude;
type Row = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export interface ConvInfo {
  latestId: string | null;
  lastMessageAt: Date | null;
}

export function toCustomerListItem(c: Row, conv: ConvInfo) {
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
    company: c.company,
    address: c.address,
    source: c.source,
    status: c.status,
    owner: c.owner,
    conversationCount: c._count.conversations,
    conversationId: conv.latestId,
    lastActivityAt: (conv.lastMessageAt && conv.lastMessageAt > c.updatedAt
      ? conv.lastMessageAt
      : c.updatedAt
    ).toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const digitsOnly = (v: string) => v.replace(/\D/g, '');
