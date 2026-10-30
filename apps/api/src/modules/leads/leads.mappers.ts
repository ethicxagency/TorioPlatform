import type { Prisma } from '@torio/database';

export const leadInclude = {
  owner: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export function toLeadDto(l: LeadRow, conversationId: string | null) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    jobTitle: l.jobTitle,
    source: l.source,
    stage: l.stage,
    owner: l.owner,
    tags: l.tags,
    dealValue: l.dealValue,
    score: l.score,
    notes: l.notes,
    customerId: l.customerId,
    conversationId,
    lastActivityAt: l.lastActivityAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
  };
}

export const digitsOnly = (v: string) => v.replace(/\D/g, '');
