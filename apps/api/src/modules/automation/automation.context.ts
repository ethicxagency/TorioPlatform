import type { Context } from '@torio/contracts';

/**
 * Event context builders. They keep only ids, enums, counts and the customer/lead name: never email, phone,
 * addresses, tokens or message text. The same object is shown (as-is) in execution details.
 */
export const leadContext = (
  l: {
    id: string;
    name: string;
    stage: string;
    source: string;
    dealValue: number | null;
    ownerId: string | null;
  },
  previousStage?: string,
): Context => ({
  lead: {
    id: l.id,
    name: l.name,
    stage: l.stage,
    source: l.source,
    dealValue: l.dealValue,
    owner: l.ownerId !== null,
    ...(previousStage && { previousStage }),
  },
});

export const customerContext = (c: {
  id: string;
  name: string;
  source: string;
  tags: string[];
}): Context => ({ customer: { id: c.id, name: c.name, source: c.source, tags: c.tags } });

export const orderContext = (
  o: {
    id: string;
    number: number;
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    totalMinor: number;
    currency: string;
    conversation: { channel: { provider: string } } | null;
  },
  c: { id: string; name: string; tags: string[] },
): Context => ({
  order: {
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    channel: o.conversation?.channel.provider ?? 'MANUAL',
    total: o.totalMinor / 100,
    currency: o.currency,
  },
  customer: { id: c.id, name: c.name, tags: c.tags },
});

export const conversationContext = (
  v: {
    id: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    channel: { provider: string };
  },
  c: { id: string; name: string; tags: string[] },
): Context => ({
  conversation: {
    id: v.id,
    status: v.status,
    priority: v.priority,
    channel: v.channel.provider,
    assignee: v.assigneeId !== null,
  },
  customer: { id: c.id, name: c.name, tags: c.tags },
});
