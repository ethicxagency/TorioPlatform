import { z } from 'zod';

/**
 * Orders. Money is integer minor units (cents) with one currency per order. Totals are computed here, on the
 * server, and stored; clients never send a total. There is no product catalog or payment provider yet, so line
 * items are custom and payments are manual records entered by staff. Nothing here simulates a provider.
 */

const nullableString = z.string().describe('Text, or null when not set').nullable();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);
const csvEnum = <E extends z.ZodEnum<Record<string, string>>>(item: E) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const out: z.infer<E>[] = [];
      for (const part of v.split(',')) {
        const r = item.safeParse(part.trim());
        if (!r.success) {
          ctx.addIssue({ code: 'custom', message: `Invalid value “${part}”` });
          return z.NEVER;
        }
        out.push(r.data as z.infer<E>);
      }
      return out.length ? out : undefined;
    });

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export const FULFILLMENT_STATUSES = ['UNFULFILLED', 'PROCESSING', 'FULFILLED'] as const;
export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_WALLET',
  'CARD_EXTERNAL',
  'OTHER',
] as const;
export const ORDER_CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'INR', 'AED'] as const;
export const ORDER_CHANNELS = ['MANUAL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const;

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const currencySchema = z.enum(ORDER_CURRENCIES);
export const orderChannelSchema = z.enum(ORDER_CHANNELS);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const MAX_ORDER_LINES = 50;
export const MAX_MINOR = 2_000_000_000;

// ---------- pure business rules (shared by API enforcement and UI hints) ----------

export interface OrderLike {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  totalMinor: number;
  paidMinor: number;
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Why `target` cannot be applied to `o` right now, or null when it can. */
export function statusBlockReason(o: OrderLike, target: OrderStatus): string | null {
  if (o.status === target)
    return `The order is already ${ORDER_STATUS_LABEL[target].toLowerCase()}`;
  if (o.status === 'COMPLETED' || o.status === 'CANCELLED')
    return `A ${ORDER_STATUS_LABEL[o.status].toLowerCase()} order can’t change status`;
  if (!ORDER_TRANSITIONS[o.status].includes(target))
    return `An order can’t go from ${ORDER_STATUS_LABEL[o.status]} to ${ORDER_STATUS_LABEL[target]}`;
  if (target === 'CANCELLED' && o.fulfillmentStatus === 'FULFILLED')
    return 'Fulfilled orders can’t be cancelled';
  if (target === 'COMPLETED') {
    if (o.fulfillmentStatus !== 'FULFILLED') return 'Mark the order fulfilled before completing it';
    if (o.paymentStatus !== 'PAID') return 'Record the full payment before completing the order';
  }
  return null;
}

export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  UNFULFILLED: ['PROCESSING', 'FULFILLED'],
  PROCESSING: ['FULFILLED'],
  FULFILLED: [],
};

export function fulfillmentBlockReason(o: OrderLike, target: FulfillmentStatus): string | null {
  if (o.status === 'CANCELLED' || o.status === 'COMPLETED')
    return `A ${ORDER_STATUS_LABEL[o.status].toLowerCase()} order can’t be fulfilled`;
  if (o.status === 'PENDING') return 'Confirm the order before fulfilling it';
  if (!FULFILLMENT_TRANSITIONS[o.fulfillmentStatus].includes(target))
    return o.fulfillmentStatus === target
      ? 'Already in this fulfillment state'
      : 'Fulfillment can only move forward';
  return null;
}

export const outstandingMinor = (o: Pick<OrderLike, 'totalMinor' | 'paidMinor'>) =>
  Math.max(0, o.totalMinor - o.paidMinor);

export function paymentBlockReason(o: OrderLike): string | null {
  if (o.status === 'CANCELLED') return 'This order is cancelled';
  if (outstandingMinor(o) <= 0) return 'This order is already fully paid';
  return null;
}

/** Items and prices can be edited only before any payment is recorded and while the order is Pending. */
export function editBlockReason(o: OrderLike): string | null {
  if (o.status !== 'PENDING') return 'Items and pricing can only change while the order is Pending';
  if (o.paidMinor > 0) return 'Items and pricing are locked once a payment is recorded';
  return null;
}

export const paymentStatusOf = (totalMinor: number, paidMinor: number): PaymentStatus =>
  paidMinor <= 0 ? 'UNPAID' : paidMinor >= totalMinor ? 'PAID' : 'PARTIALLY_PAID';

export interface LineInput {
  quantity: number;
  unitPriceMinor: number;
}
export interface Totals {
  lineTotals: number[];
  subtotalMinor: number;
  totalMinor: number;
}
/** total = subtotal − discount + shipping + tax. Returns an error string when amounts are inconsistent. */
export function computeTotals(
  lines: LineInput[],
  discountMinor: number,
  shippingMinor: number,
  taxMinor: number,
): { ok: true; totals: Totals } | { ok: false; error: string } {
  const lineTotals = lines.map((l) => l.quantity * l.unitPriceMinor);
  if (lineTotals.some((t) => t > MAX_MINOR))
    return { ok: false, error: 'A line total is too large' };
  const subtotalMinor = lineTotals.reduce((a, b) => a + b, 0);
  if (discountMinor > subtotalMinor)
    return { ok: false, error: 'The discount can’t be more than the subtotal' };
  const totalMinor = subtotalMinor - discountMinor + shippingMinor + taxMinor;
  if (subtotalMinor > MAX_MINOR || totalMinor > MAX_MINOR)
    return { ok: false, error: 'The order total is too large' };
  return { ok: true, totals: { lineTotals, subtotalMinor, totalMinor } };
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

// ---------- inputs ----------

export const orderItemInputSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(160),
  sku: optText(60),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10_000),
  unitPriceMinor: z.number().int().min(0).max(100_000_000),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

const money = z.number().int().min(0).max(MAX_MINOR);

export const createOrderSchema = z.object({
  customerId: z.uuid(),
  conversationId: z.uuid().optional(),
  currency: currencySchema,
  items: z.array(orderItemInputSchema).min(1, 'Add at least one item').max(MAX_ORDER_LINES),
  discountMinor: money.default(0),
  shippingMinor: money.default(0),
  taxMinor: money.default(0),
  shippingAddress: optText(500),
  shippingMethod: optText(120),
  note: optText(2000),
  /** Client-generated; a retried request with the same key returns the existing order. */
  requestId: z.uuid(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = z
  .object({
    items: z.array(orderItemInputSchema).min(1).max(MAX_ORDER_LINES).optional(),
    discountMinor: money.optional(),
    shippingMinor: money.optional(),
    taxMinor: money.optional(),
    shippingAddress: z.string().trim().max(500).nullable().optional(),
    shippingMethod: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const setOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']),
});
export type SetOrderStatusInput = z.infer<typeof setOrderStatusSchema>;

export const recordPaymentSchema = z.object({
  amountMinor: z.number().int().min(1, 'Enter an amount').max(MAX_MINOR),
  method: paymentMethodSchema,
  reference: optText(120),
  note: optText(500),
  paidAt: z.iso.datetime().optional(),
  requestId: z.uuid(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

const httpUrl = z
  .url({ protocol: /^https?$/, message: 'Tracking link must be an http(s) URL' })
  .max(500);

export const setFulfillmentSchema = z.object({
  status: z.enum(['PROCESSING', 'FULFILLED']),
  shippingMethod: optText(120),
  carrier: optText(80),
  trackingNumber: optText(120),
  trackingUrl: z
    .union([z.literal(''), httpUrl])
    .optional()
    .transform((v) => v || undefined),
});
export type SetFulfillmentInput = z.infer<typeof setFulfillmentSchema>;

export const orderNoteInputSchema = z.object({
  body: z.string().trim().min(1, 'Write a note first').max(2000),
});

export const orderBulkSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.literal('SET_STATUS'),
  status: setOrderStatusSchema.shape.status,
});
export type OrderBulkInput = z.infer<typeof orderBulkSchema>;

export const ORDER_SORT_FIELDS = ['createdAt', 'total'] as const;
export const orderFilterSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: csvEnum(orderStatusSchema),
  paymentStatus: csvEnum(paymentStatusSchema),
  fulfillmentStatus: csvEnum(fulfillmentStatusSchema),
  channel: orderChannelSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  customerId: z.uuid().optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
  minTotal: z.coerce.number().int().min(0).max(MAX_MINOR).optional(),
  maxTotal: z.coerce.number().int().min(0).max(MAX_MINOR).optional(),
});
export type OrderFilter = z.infer<typeof orderFilterSchema>;

export const orderQuerySchema = orderFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(ORDER_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const orderExportQuerySchema = orderFilterSchema.extend({ ids: z.string().optional() });

export const orderSummaryQuerySchema = z.object({
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
});

// ---------- responses ----------

const moneyBlock = z.object({ currency: z.string(), amountMinor: z.number().int() });

export const orderListItemSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  customer: z.object({
    id: z.uuid(),
    name: z.string(),
    email: nullableString,
    phone: nullableString,
  }),
  itemCount: z.number().int(),
  itemSummary: z.string(),
  currency: z.string(),
  totalMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  channel: orderChannelSchema,
  conversationId: nullableString,
  isSample: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const orderListSchema = z.object({
  data: z.array(orderListItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const orderEventSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  description: z.string(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});
export const orderNoteSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const orderPaymentSchema = z.object({
  id: z.uuid(),
  amountMinor: z.number().int(),
  method: paymentMethodSchema,
  reference: nullableString,
  note: nullableString,
  paidAt: z.iso.datetime(),
  recordedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

export const orderDetailSchema = orderListItemSchema.extend({
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  shippingMinor: z.number().int(),
  taxMinor: z.number().int(),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      sku: nullableString,
      quantity: z.number().int(),
      unitPriceMinor: z.number().int(),
      lineTotalMinor: z.number().int(),
    }),
  ),
  payments: z.array(orderPaymentSchema),
  notes: z.array(orderNoteSchema),
  events: z.array(orderEventSchema),
  shippingAddress: nullableString,
  shippingMethod: nullableString,
  carrier: nullableString,
  trackingNumber: nullableString,
  trackingUrl: nullableString,
  shippedAt: nullableString,
  cancelledAt: nullableString,
  completedAt: nullableString,
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  conversation: z
    .object({ id: z.uuid(), provider: z.enum(['WHATSAPP', 'INSTAGRAM', 'MESSENGER']) })
    .nullable(),
  customerConversations: z.array(
    z.object({
      id: z.uuid(),
      provider: z.enum(['WHATSAPP', 'INSTAGRAM', 'MESSENGER']),
      lastMessageAt: z.iso.datetime(),
      preview: z.string(),
    }),
  ),
});

export const orderSummarySchema = z.object({
  totalOrders: z.number().int(),
  /** False when no bounded period was selected, so no comparison exists. */
  hasPrevious: z.boolean(),
  /** Orders in the equal-length period immediately before (0 when `hasPrevious` is false). */
  previousTotalOrders: z.number().int(),
  /** Payments collected on non-cancelled orders created in the period, per currency. */
  revenue: z.array(moneyBlock),
  pendingPayments: z.object({ count: z.number().int(), outstanding: z.array(moneyBlock) }),
  processing: z.number().int(),
  completed: z.number().int(),
  cancelled: z.number().int(),
});

export const orderBulkResultSchema = z.object({
  updated: z.number().int(),
  failed: z.array(z.object({ id: z.uuid(), number: z.number().int(), reason: z.string() })),
});
