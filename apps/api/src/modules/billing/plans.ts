import type { BillingInterval, PlanDef } from '@torio/contracts';

/**
 * Plan catalog. No pricing existed in the project, so these are configurable placeholders: `placeholderPricing`
 * is true and the UI says so. Edit the numbers here, set `placeholderPricing: false`, and set the matching
 * provider price ids in `BILLING_PRICE_IDS` before selling anything.
 *
 * Amounts are BDT placeholders (৳1,500 / ৳4,500 / ৳12,000 a month; yearly = 10 months). They replaced earlier USD
 * placeholders and are not a conversion of them. Real prices still need to be decided and set with provider price ids. Prices shown are display values only: the
 * amount actually charged is always the provider price, and Torio never sends an amount to the provider.
 */
const none = null;
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
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For small teams handling daily conversations.',
    rank: 1,
    recommended: false,
    currency: 'BDT',
    monthlyMinor: 150_000,
    yearlyMinor: 1_500_000,
    placeholderPricing: true,
    limits: {
      members: 5,
      channels: 2,
      contacts: 2_000,
      messages: 5_000,
      whatsapp: 500,
      instagram: 500,
      messenger: 500,
    },
    features: [
      'Everything in Free',
      'More teammates and channels',
      'Automation workflows',
      'Audit log',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'For growing teams that sell through chat.',
    rank: 2,
    recommended: true,
    currency: 'BDT',
    monthlyMinor: 450_000,
    yearlyMinor: 4_500_000,
    placeholderPricing: true,
    limits: {
      members: 15,
      channels: 3,
      contacts: 20_000,
      messages: 50_000,
      whatsapp: 5_000,
      instagram: 5_000,
      messenger: 5_000,
    },
    features: ['Everything in Starter', 'Higher volume limits', 'Priority support'],
  },
  {
    key: 'scale',
    name: 'Scale',
    description: 'For large teams that need room to grow.',
    rank: 3,
    recommended: false,
    currency: 'BDT',
    monthlyMinor: 1_200_000,
    yearlyMinor: 12_000_000,
    placeholderPricing: true,
    limits: {
      members: none,
      channels: none,
      contacts: none,
      messages: none,
      whatsapp: none,
      instagram: none,
      messenger: none,
    },
    features: [
      'Everything in Growth',
      'Unlimited members, channels and contacts',
      'Dedicated onboarding',
    ],
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
