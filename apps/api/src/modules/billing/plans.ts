import type { BillingInterval, PlanDef } from '@torio/contracts';

/**
 * The official Torio plan catalog. The database (`plans` table) is the source of truth that Super Admin edits; this list
 * seeds an empty database and is what `pnpm plans:apply` writes for the three paid plans. Amounts are BDT in minor units
 * (poisha): BDT 500 = 50_000. Per-product conversation counts (whatsapp/instagram/messenger) are not part of the plans, so
 * they are unlimited here; the four limits that matter are members, channels, contacts and messages.
 *
 * `placeholderPricing` is false: these are the real prices. Provider price ids are still configured separately
 * (`BILLING_PRICE_IDS` or the plan editor); Torio never sends an amount to a provider, it only displays these.
 */
const none = null;
const CORE_FEATURES = [
  'Unified Smart Inbox',
  'Torio Brain',
  'WhatsApp Integration',
  'Instagram Integration',
  'Facebook Messenger Integration',
  'Customer Management',
  'Lead Management',
  'Conversation Assignment',
  'Saved Replies',
  'Customer Conversation History',
  'Dashboard & Analytics',
  'Smart Automation',
];
const perProduct = { whatsapp: none, instagram: none, messenger: none };
export const PLANS: PlanDef[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'For trying Torio with a small team.',
    rank: 0,
    recommended: false,
    currency: 'BDT',
    monthlyMinor: 0,
    yearlyMinor: 0,
    placeholderPricing: false,
    limits: {
      members: 2,
      channels: 1,
      contacts: 100,
      messages: 500,
      whatsapp: 50,
      instagram: 50,
      messenger: 50,
    },
    features: ['Shared Inbox', 'Leads and Customers', 'Orders', 'Basic automations'],
    entitlements: [],
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For one brand getting its conversations in one place.',
    rank: 1,
    recommended: false,
    currency: 'BDT',
    monthlyMinor: 50_000,
    yearlyMinor: 600_000,
    placeholderPricing: false,
    limits: { members: 1, channels: 3, contacts: 500, messages: 10_000, ...perProduct },
    features: CORE_FEATURES,
    entitlements: [],
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'For growing teams that sell through chat and ship with couriers.',
    rank: 2,
    recommended: true,
    currency: 'BDT',
    monthlyMinor: 150_000,
    yearlyMinor: 1_800_000,
    placeholderPricing: false,
    limits: { members: 10, channels: 3, contacts: 5_000, messages: 50_000, ...perProduct },
    features: ['Everything in Starter', 'Courier Integration'],
    entitlements: ['courier'],
  },
  {
    key: 'scale',
    name: 'Scale',
    description: 'Premium: more people, more channels and Brand Management.',
    rank: 3,
    recommended: false,
    currency: 'BDT',
    monthlyMinor: 250_000,
    yearlyMinor: 3_000_000,
    placeholderPricing: false,
    limits: { members: 20, channels: 10, contacts: 50_000, messages: 100_000, ...perProduct },
    features: ['Everything in Growth', 'Brand Management'],
    entitlements: ['courier', 'brands'],
  },
];
export const FREE_PLAN = PLANS[0]!;
export const planOf = (key: string) => PLANS.find((p) => p.key === key);
export const priceMinor = (p: PlanDef, interval: BillingInterval) =>
  interval === 'YEAR' ? p.yearlyMinor : p.monthlyMinor;

export type PriceIds = Record<string, { month?: string; year?: string }>;
export const priceIdOf = (ids: PriceIds, planKey: string, interval: BillingInterval) =>
  ids[planKey]?.[interval === 'YEAR' ? 'year' : 'month'];
/** Reverse lookup used by webhooks: provider price id → our plan and interval. */
export function planFromPriceId(ids: PriceIds, priceId: string) {
  for (const [key, v] of Object.entries(ids)) {
    if (v.month === priceId) return { planKey: key, interval: 'MONTH' as const };
    if (v.year === priceId) return { planKey: key, interval: 'YEAR' as const };
  }
  return null;
}
