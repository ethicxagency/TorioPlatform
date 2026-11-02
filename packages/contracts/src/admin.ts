import { z } from 'zod';
import {
  USAGE_METRICS,
  billingIntervalSchema,
  subscriptionStatusSchema,
  invoiceStatusSchema,
} from './billing';

/** Super Admin (platform operator) API shapes and pure rules. Customer data is read only as far as administration needs. */

const nullableString = z.string().describe('Text, or null when not set').nullable();
const iso = z.iso.datetime();
const meta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
const paged = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- pure money rules ----------

export interface MrrInput {
  status: string;
  source: string;
  interval: 'MONTH' | 'YEAR';
  priceMinor: number | null;
  currency: string | null;
}
/** Monthly equivalent of a recurring price, in minor units. Yearly prices are divided by 12 and rounded. */
export const monthlyEquivalent = (priceMinor: number, interval: 'MONTH' | 'YEAR') =>
  interval === 'YEAR' ? Math.round(priceMinor / 12) : priceMinor;

/**
 * MRR per currency (currencies are never added together). Counts paying, provider-billed ACTIVE subscriptions
 * (including ones scheduled to cancel at period end, which still pay until then). Excludes canceled, expired,
 * past-due, trialing and manually granted plans. Subscriptions without a recorded price are reported, not guessed.
 */
export function computeMrr(subs: MrrInput[]): {
  byCurrency: { currency: string; amountMinor: number }[];
  unpriced: number;
} {
  const totals = new Map<string, number>();
  let unpriced = 0;
  for (const s of subs) {
    if (s.status !== 'ACTIVE' || s.source !== 'PROVIDER') continue;
    if (s.priceMinor === null || !s.currency) {
      unpriced++;
      continue;
    }
    totals.set(
      s.currency,
      (totals.get(s.currency) ?? 0) + monthlyEquivalent(s.priceMinor, s.interval),
    );
  }
  return {
    byCurrency: [...totals]
      .map(([currency, amountMinor]) => ({ currency, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    unpriced,
  };
}

// ---------- auth ----------

export const adminLoginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const adminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12, 'Use at least 12 characters').max(128),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a different password',
  });
export const adminProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.string(),
});
export const updateAdminProfileSchema = z.object({ name: z.string().trim().min(1).max(100) });

// ---------- shared ----------

export const adminReasonSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(500),
});
export const adminResultSchema = z.object({
  /** True when the request was accepted. */
  accepted: z.literal(true),
  /** False means the change is already applied. True means the payment provider must confirm it first. */
  pending: z.boolean(),
  message: z.string(),
});

// ---------- dashboard ----------

const money = z.object({ currency: z.string(), amountMinor: z.number().int() });
export const adminDashboardSchema = z.object({
  customers: z.object({
    total: z.number().int(),
    newLast30Days: z.number().int(),
    suspended: z.number().int(),
  }),
  workspaces: z.object({ active: z.number().int(), suspended: z.number().int() }),
  subscriptions: z.object({
    active: z.number().int(),
    trialing: z.number().int(),
    pastDue: z.number().int(),
  }),
  mrr: z.object({ byCurrency: z.array(money), unpricedSubscriptions: z.number().int() }),
  revenue: z.array(
    z.object({
      currency: z.string(),
      months: z.array(z.object({ month: z.string(), amountMinor: z.number().int() })),
    }),
  ),
  recentCustomers: z.array(
    z.object({ id: z.uuid(), name: z.string(), email: z.string(), createdAt: iso }),
  ),
  recentSubscriptions: z.array(
    z.object({
      id: z.uuid(),
      workspace: z.string(),
      planKey: z.string(),
      status: subscriptionStatusSchema,
      createdAt: iso,
    }),
  ),
  failedPayments: z.array(
    z.object({
      id: z.uuid(),
      workspace: z.string(),
      number: nullableString,
      totalMinor: z.number().int(),
      currency: z.string(),
      issuedAt: iso,
    }),
  ),
});

// ---------- customers ----------

export const adminCustomerQuerySchema = paged.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  subscription: z
    .enum(['NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'])
    .optional(),
});
export const adminCustomerItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  createdAt: iso,
  status: z.enum(['ACTIVE', 'DISABLED']),
  workspaceCount: z.number().int(),
  planKey: z.string(),
  planName: z.string(),
  subscriptionStatus: z.string().describe('A subscription status, or NONE for the free plan'),
});
export const adminCustomerListSchema = z.object({ data: z.array(adminCustomerItemSchema), meta });
export const adminCustomerDetailSchema = adminCustomerItemSchema.extend({
  suspendedAt: nullableString,
  suspendedReason: nullableString,
  emailVerified: z.boolean(),
  workspaces: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      role: z.string(),
      status: z.enum(['ACTIVE', 'SUSPENDED']),
      planKey: z.string(),
      subscriptionStatus: z.string(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.uuid(),
      number: nullableString,
      status: invoiceStatusSchema,
      totalMinor: z.number().int(),
      currency: z.string(),
      issuedAt: iso,
      workspace: z.string(),
    }),
  ),
  activity: z.array(z.object({ action: z.string(), at: iso })),
});

// ---------- workspaces ----------

export const adminWorkspaceQuerySchema = paged.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export const adminWorkspaceItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  owner: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  members: z.number().int(),
  channels: z.number().int(),
  planKey: z.string(),
  planName: z.string(),
  subscriptionStatus: z.string(),
  createdAt: iso,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export const adminWorkspaceListSchema = z.object({ data: z.array(adminWorkspaceItemSchema), meta });
export const adminWorkspaceDetailSchema = adminWorkspaceItemSchema.extend({
  suspendedAt: nullableString,
  suspendedReason: nullableString,
  subscription: z
    .object({
      id: z.uuid(),
      interval: billingIntervalSchema,
      source: z.enum(['PROVIDER', 'MANUAL']),
      renewsAt: nullableString,
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
});

// ---------- subscriptions ----------

export const adminSubscriptionQuerySchema = paged.extend({
  status: z.enum(['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export const adminSubscriptionItemSchema = z.object({
  id: z.uuid(),
  providerSubscriptionId: z.string(),
  source: z.enum(['PROVIDER', 'MANUAL']),
  customer: z.object({ name: z.string(), email: z.string() }).nullable(),
  workspace: z.object({ id: z.uuid(), name: z.string() }),
  planKey: z.string(),
  planName: z.string(),
  interval: billingIntervalSchema,
  amountMinor: z
    .number()
    .int()
    .describe('Recurring price per interval, or -1 when unknown or complimentary'),
  currency: nullableString,
  status: subscriptionStatusSchema,
  cancelAtPeriodEnd: z.boolean(),
  startedAt: nullableString,
  renewsAt: nullableString,
  grantReason: nullableString,
});
export const adminSubscriptionListSchema = z.object({
  data: z.array(adminSubscriptionItemSchema),
  meta,
});
export const adminSubscriptionDetailSchema = adminSubscriptionItemSchema.extend({
  invoices: z.array(
    z.object({
      id: z.uuid(),
      number: nullableString,
      status: invoiceStatusSchema,
      totalMinor: z.number().int(),
      currency: z.string(),
      issuedAt: iso,
    }),
  ),
  payments: z.array(z.object({ type: z.string(), outcome: z.string(), at: iso })),
});
export const adminCancelSubscriptionSchema = adminReasonSchema.extend({
  atPeriodEnd: z.boolean().default(true),
});
export const adminAssignPlanSchema = adminReasonSchema.extend({
  planKey: z.string().min(1).max(40),
  interval: billingIntervalSchema.default('MONTH'),
  /** Optional end of the complimentary grant. */
  endsAt: z.iso.datetime().optional(),
});

// ---------- plans ----------

const limitValue = z.number().int().min(0).max(1_000_000_000).nullable();
export const planLimitsSchema = z.object(
  Object.fromEntries(USAGE_METRICS.map((m) => [m, limitValue])) as Record<
    (typeof USAGE_METRICS)[number],
    typeof limitValue
  >,
);
const planFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(''),
  rank: z.number().int().min(0).max(100),
  recommended: z.boolean().default(false),
  currency: z.enum(['USD', 'EUR', 'GBP', 'BDT', 'INR', 'AED']),
  monthlyMinor: z.number().int().min(0).max(100_000_000),
  yearlyMinor: z.number().int().min(0).max(1_000_000_000),
  placeholderPricing: z.boolean().default(false),
  limits: planLimitsSchema,
  aiCredits: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  priceIdMonth: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  priceIdYear: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
};
export const adminCreatePlanSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]{1,29}$/,
      'Use 2–30 lowercase letters, digits or dashes, starting with a letter',
    ),
  ...planFields,
});
export const adminUpdatePlanSchema = z
  .object(planFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const adminPlanStatusSchema = adminReasonSchema.extend({
  status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']),
});
export const adminPlanSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  rank: z.number().int(),
  recommended: z.boolean(),
  currency: z.string(),
  monthlyMinor: z.number().int(),
  yearlyMinor: z.number().int(),
  placeholderPricing: z.boolean(),
  limits: z.record(z.string(), z.number().int().describe('Limit, or -1 for unlimited')),
  aiCredits: z.number().int().describe('Credits, or -1 when not set'),
  features: z.array(z.string()),
  priceIdMonth: nullableString,
  priceIdYear: nullableString,
  status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']),
  subscribers: z
    .number()
    .int()
    .describe('Subscriptions currently on this plan (active, trialing or past due)'),
});
export const adminPlanListSchema = z.object({ data: z.array(adminPlanSchema) });

// ---------- activity ----------

export const adminActivityQuerySchema = paged.extend({
  source: z.enum(['admin', 'payments']).default('admin'),
  q: z.string().trim().min(1).max(100).optional(),
});
export const adminActivityItemSchema = z.object({
  id: z.uuid(),
  at: iso,
  actor: z.string(),
  action: z.string(),
  target: nullableString,
  reason: nullableString,
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export const adminActivityListSchema = z.object({ data: z.array(adminActivityItemSchema), meta });

// ---------- settings ----------

export const adminSettingsSchema = z.object({
  branding: z.object({
    productName: z.string(),
    legalName: z.string(),
    supportEmail: z.string(),
    invoiceNote: z.string(),
  }),
  registrationOpen: z.boolean(),
  paymentProvider: z.object({
    provider: nullableString,
    configured: z.boolean(),
    webhookSecretSet: z.boolean(),
    priceIdsConfigured: z.number().int(),
    lastWebhookAt: nullableString,
  }),
  emailProvider: z.object({ configured: z.boolean(), note: z.string() }),
});
export const updateAdminSettingsSchema = z
  .object({
    productName: z.string().trim().min(1).max(60).optional(),
    legalName: z.string().trim().max(120).optional(),
    supportEmail: z.union([z.literal(''), z.email().max(254)]).optional(),
    invoiceNote: z.string().trim().max(300).optional(),
    registrationOpen: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== 'reason').length > 0, 'Nothing to update');

export type AdminCreatePlanInput = z.infer<typeof adminCreatePlanSchema>;
export type AdminUpdatePlanInput = z.infer<typeof adminUpdatePlanSchema>;
