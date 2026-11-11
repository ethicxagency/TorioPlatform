import { z } from 'zod';

/**
 * Billing. The payment provider is the source of truth for subscriptions, invoices and payment methods; Torio
 * mirrors them from verified webhook events and never accepts a status or amount from the browser. Card data is
 * never handled here. This file holds the plan shape, the pure rules (usage levels, plan-change classification,
 * subscription state), and the API shapes.
 */

export const USAGE_APPROACHING = 70;
export const USAGE_NEAR = 90;

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
] as const;
export const INVOICE_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'VOID'] as const;
export const BILLING_INTERVALS = ['MONTH', 'YEAR'] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** Meters the application can really measure today. AI usage and storage are not metered, so they aren't listed. */
export const USAGE_METRICS = [
  'members',
  'channels',
  'contacts',
  'messages',
  'whatsapp',
  'instagram',
  'messenger',
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];
export const USAGE_LABEL: Record<UsageMetric, string> = {
  members: 'Team members',
  channels: 'Connected channels',
  contacts: 'Contacts',
  messages: 'Messages sent (this month)',
  whatsapp: 'WhatsApp conversations (this month)',
  instagram: 'Instagram conversations (this month)',
  messenger: 'Messenger conversations (this month)',
};

export interface PlanDef {
  key: string;
  name: string;
  description: string;
  /** Higher = bigger plan. Decides upgrade vs downgrade. */
  rank: number;
  recommended: boolean;
  currency: string;
  /** Minor units per interval; 0 for the free plan. */
  monthlyMinor: number;
  yearlyMinor: number;
  /** True until real pricing is configured. The UI labels these clearly. */
  placeholderPricing: boolean;
  /** null = unlimited. Keyed by usage metric. */
  limits: Record<UsageMetric, number | null>;
  features: string[];
}

export const planSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  rank: z.number().int(),
  recommended: z.boolean(),
  currency: z.string(),
  monthlyMinor: z.number().int(),
  yearlyMinor: z.number().int(),
  placeholderPricing: z.boolean(),
  /** Whether the provider price ids needed to buy this plan are configured. */
  purchasable: z.boolean(),
  limits: z.record(z.string(), z.number().int().describe('Limit, or -1 for unlimited')),
  features: z.array(z.string()),
});
export const planListSchema = z.object({ data: z.array(planSchema) });

// ---------- pure rules ----------

export type UsageLevel = 'unlimited' | 'ok' | 'approaching' | 'near' | 'reached';
export const usagePercent = (used: number, limit: number | null) =>
  limit === null
    ? 0
    : limit <= 0
      ? used > 0
        ? 100
        : 0
      : Math.min(100, Math.round((used / limit) * 100));
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return 'unlimited';
  if (limit <= 0 ? used > 0 : used >= limit) return 'reached';
  const pct = (used / Math.max(limit, 1)) * 100;
  return pct >= USAGE_NEAR ? 'near' : pct >= USAGE_APPROACHING ? 'approaching' : 'ok';
}

export type ChangeKind = 'same' | 'upgrade' | 'downgrade' | 'interval';
export function changeKind(
  cur: { rank: number; key: string; interval: BillingInterval },
  target: { rank: number; key: string; interval: BillingInterval },
): ChangeKind {
  if (cur.key === target.key) return cur.interval === target.interval ? 'same' : 'interval';
  return target.rank > cur.rank ? 'upgrade' : 'downgrade';
}

/** Metrics where current usage already exceeds what the target plan allows. */
export function overages(
  usage: Partial<Record<UsageMetric, number>>,
  target: Pick<PlanDef, 'limits'>,
): { metric: UsageMetric; used: number; limit: number }[] {
  const out: { metric: UsageMetric; used: number; limit: number }[] = [];
  for (const m of USAGE_METRICS) {
    const limit = target.limits[m];
    const used = usage[m] ?? 0;
    if (limit !== null && used > limit) out.push({ metric: m, used, limit });
  }
  return out;
}

/** Percentage saved by paying yearly instead of 12 monthly payments. */
export const annualSavingsPct = (p: Pick<PlanDef, 'monthlyMinor' | 'yearlyMinor'>) =>
  p.monthlyMinor <= 0 || p.yearlyMinor <= 0
    ? 0
    : Math.max(0, Math.round((1 - p.yearlyMinor / (p.monthlyMinor * 12)) * 100));

/** Maps a provider (Stripe) subscription status to ours. Returns null for states we don't mirror yet. */
export function mapProviderStatus(s: string): SubscriptionStatus | null {
  switch (s) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete_expired':
      return 'EXPIRED';
    default:
      return null; // incomplete, paused: wait for a later event
  }
}

export interface SubLike {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
}
export type Access = 'full' | 'full_until_period_end' | 'limited' | 'none';

/** What the customer may do right now, from the subscription alone. */
export function subscriptionActions(sub: SubLike | null, now = new Date()) {
  const ended = (d: Date | string | null) => !d || new Date(d).getTime() <= now.getTime();
  if (!sub)
    return {
      canCheckout: true,
      canChange: false,
      canCancel: false,
      canResume: false,
      canRetryPayment: false,
      access: 'full' as Access,
    };
  switch (sub.status) {
    case 'ACTIVE':
    case 'TRIALING':
      return {
        canCheckout: false,
        canChange: !sub.cancelAtPeriodEnd,
        canCancel: !sub.cancelAtPeriodEnd,
        canResume: sub.cancelAtPeriodEnd,
        canRetryPayment: false,
        access: (sub.cancelAtPeriodEnd ? 'full_until_period_end' : 'full') as Access,
      };
    case 'PAST_DUE':
      return {
        canCheckout: false,
        canChange: false,
        canCancel: true,
        canResume: false,
        canRetryPayment: true,
        access: 'limited' as Access,
      };
    case 'CANCELED':
      return {
        canCheckout: ended(sub.currentPeriodEnd),
        canChange: false,
        canCancel: false,
        canResume: false,
        canRetryPayment: false,
        access: (ended(sub.currentPeriodEnd) ? 'none' : 'full_until_period_end') as Access,
      };
    case 'EXPIRED':
      return {
        canCheckout: true,
        canChange: false,
        canCancel: false,
        canResume: false,
        canRetryPayment: false,
        access: 'none' as Access,
      };
  }
}

export function mapInvoiceStatus(providerStatus: string, attempted: boolean): InvoiceStatus {
  if (providerStatus === 'paid') return 'PAID';
  if (providerStatus === 'void') return 'VOID';
  if (providerStatus === 'uncollectible') return 'FAILED';
  if (providerStatus === 'open') return attempted ? 'FAILED' : 'PENDING';
  return 'PENDING'; // draft
}

// ---------- API shapes ----------

const nullableString = z.string().describe('Text, or null when not set').nullable();
const iso = z.iso.datetime();

export const billingProfileSchema = z.object({
  companyName: nullableString,
  contactName: nullableString,
  billingEmail: nullableString,
  phone: nullableString,
  country: nullableString,
  state: nullableString,
  city: nullableString,
  addressLine: nullableString,
  postalCode: nullableString,
  taxId: nullableString,
});
/** What the Billing page and checkout read: the store's General Settings as invoice details, and what is still missing. */
export const billingDetailsResponseSchema = z.object({
  details: billingProfileSchema,
  missing: z.array(z.object({ field: z.string(), label: z.string() })),
  complete: z.boolean(),
  source: z.literal('general-settings'),
});
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));
export const updateBillingProfileSchema = z
  .strictObject({
    companyName: opt(120),
    contactName: opt(100),
    billingEmail: z
      .union([z.literal(''), z.email().max(254)])
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v.toLowerCase() : null)),
    phone: opt(40),
    country: z
      .union([
        z.literal(''),
        z.string().regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code, e.g. BD'),
      ])
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v.toUpperCase() : null)),
    state: opt(80),
    city: opt(80),
    addressLine: opt(200),
    postalCode: opt(20),
    taxId: opt(40),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateBillingProfileInput = z.infer<typeof updateBillingProfileSchema>;

export const subscriptionSchema = z.object({
  planKey: z.string(),
  interval: billingIntervalSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: nullableString,
  currentPeriodEnd: nullableString,
  trialEnd: nullableString,
  startedAt: nullableString,
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: nullableString,
});
export const overviewSchema = z.object({
  /** False until a payment provider and its credentials are configured. Nothing can be bought or changed then. */
  providerConfigured: z.boolean(),
  provider: nullableString,
  /** True when no real subscription exists: the workspace is on the built-in Free plan. */
  onFreePlan: z.boolean(),
  plan: planSchema,
  subscription: subscriptionSchema.nullable(),
  actions: z.object({
    canCheckout: z.boolean(),
    canChange: z.boolean(),
    canCancel: z.boolean(),
    canResume: z.boolean(),
    canRetryPayment: z.boolean(),
    access: z.enum(['full', 'full_until_period_end', 'limited', 'none']),
  }),
  nextPayment: z
    .object({
      date: z.iso.datetime(),
      amountMinor: z.number().int(),
      currency: z.string(),
      placeholderPricing: z.boolean(),
    })
    .nullable(),
  hasFailedPayment: z.boolean(),
  usage: z
    .object({
      metric: z.string(),
      used: z.number().int(),
      limit: z.number().int(),
      percent: z.number().int(),
    })
    .nullable(),
  /** AI credits aren't metered by the application yet. */
  aiCredits: z.object({ metered: z.literal(false) }),
});

export const usageItemSchema = z.object({
  metric: z.enum(USAGE_METRICS),
  label: z.string(),
  used: z.number().int(),
  limit: z.number().int().describe('Limit, or -1 for unlimited'),
  remaining: z.number().int().describe('Remaining allowance, or -1 for unlimited'),
  percent: z.number().int(),
  level: z.enum(['unlimited', 'ok', 'approaching', 'near', 'reached']),
});
export const usageSchema = z.object({
  planKey: z.string(),
  periodStart: iso,
  periodEnd: iso,
  data: z.array(usageItemSchema),
  /** Meters that exist in the product plan but are not measured yet, so no number is shown. */
  notTracked: z.array(z.string()),
});

export const savedPaymentMethodSchema = z.object({
  id: z.uuid(),
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number().int(),
  expYear: z.number().int(),
  isDefault: z.boolean(),
});
export const savedPaymentMethodListSchema = z.object({ data: z.array(savedPaymentMethodSchema) });

export const invoiceItemSchema = z.object({
  id: z.uuid(),
  number: nullableString,
  status: invoiceStatusSchema,
  currency: z.string(),
  totalMinor: z.number().int(),
  periodStart: nullableString,
  periodEnd: nullableString,
  planKey: nullableString,
  description: z.string(),
  issuedAt: iso,
  hostedUrl: nullableString,
  canRetry: z.boolean(),
});
export const invoiceDetailSchema = invoiceItemSchema.extend({
  subtotalMinor: z.number().int(),
  taxMinor: z.number().int(),
  amountPaidMinor: z.number().int(),
  paymentSummary: nullableString,
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().int(),
      amountMinor: z.number().int(),
    }),
  ),
  customer: billingProfileSchema,
  seller: z.object({ name: z.string(), note: z.string() }),
});
export const invoiceListSchema = z.object({
  data: z.array(invoiceItemSchema),
  /** Whole-history figures for this workspace, never narrowed by the list filters. */
  summary: z.object({
    total: z.number().int(),
    paid: z.number().int(),
    /** Unpaid pending and failed invoices, per currency (amounts are never added across currencies). */
    outstanding: z.array(z.object({ currency: z.string(), amountMinor: z.number().int() })),
  }),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const invoiceQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  /** Matches the invoice number or plan. */
  q: z.string().trim().max(80).optional(),
  /** Issue date range, inclusive, in UTC. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  /** Newest first by default. */
  sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).default('date_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

export const planChangeSchema = z.object({
  planKey: z.string().min(1).max(40),
  interval: billingIntervalSchema,
});
export type PlanChangeInput = z.infer<typeof planChangeSchema>;
export const planChangeConfirmSchema = planChangeSchema.extend({
  /** Required when the preview reported usage above the target plan's limits. */
  acknowledgeOverage: z.boolean().default(false),
});
export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().trim().max(500).optional(),
});
export const planPreviewSchema = z.object({
  kind: z.enum(['same', 'upgrade', 'downgrade', 'interval']),
  planKey: z.string(),
  interval: billingIntervalSchema,
  priceMinor: z.number().int(),
  currency: z.string(),
  placeholderPricing: z.boolean(),
  /** When the change applies, in words. The provider decides the exact proration; Torio doesn't estimate it. */
  effective: z.string(),
  gained: z.array(z.string()),
  lost: z.array(z.string()),
  overages: z.array(
    z.object({
      metric: z.string(),
      label: z.string(),
      used: z.number().int(),
      limit: z.number().int(),
    }),
  ),
  blockedReason: nullableString,
});
export const checkoutResultSchema = z.object({ url: z.url() });
export const acceptedResultSchema = z.object({
  accepted: z.literal(true),
  message: z.string(),
});
