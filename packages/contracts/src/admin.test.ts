import { describe, expect, it } from 'vitest';
import {
  computeMrr,
  monthlyEquivalent,
  adminAssignPlanSchema,
  adminCreatePlanSchema,
  adminReasonSchema,
} from './admin';

describe('MRR', () => {
  const s = (over: Partial<Parameters<typeof computeMrr>[0][number]> = {}) => ({
    status: 'ACTIVE',
    source: 'PROVIDER',
    interval: 'MONTH' as const,
    priceMinor: 4900,
    currency: 'USD',
    ...over,
  });
  it('normalises yearly prices to a monthly equivalent', () => {
    expect(monthlyEquivalent(4900, 'MONTH')).toBe(4900);
    expect(monthlyEquivalent(49000, 'YEAR')).toBe(4083);
  });
  it('sums paying provider subscriptions per currency and never mixes currencies', () => {
    const r = computeMrr([
      s(),
      s({ interval: 'YEAR', priceMinor: 12000 }),
      s({ currency: 'BDT', priceMinor: 100000 }),
    ]);
    expect(r.byCurrency).toEqual([
      { currency: 'BDT', amountMinor: 100000 },
      { currency: 'USD', amountMinor: 4900 + 1000 },
    ]);
    expect(r.unpriced).toBe(0);
  });
  it('excludes canceled, expired, past due, trialing and manual plans; reports unpriced ones', () => {
    const r = computeMrr([
      s({ status: 'CANCELED' }),
      s({ status: 'EXPIRED' }),
      s({ status: 'PAST_DUE' }),
      s({ status: 'TRIALING' }),
      s({ source: 'MANUAL' }),
      s({ priceMinor: null }),
    ]);
    expect(r).toEqual({ byCurrency: [], unpriced: 1 });
  });
});

describe('admin inputs', () => {
  it('requires a real reason', () => {
    expect(adminReasonSchema.safeParse({ reason: 'x' }).success).toBe(false);
    expect(adminReasonSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(adminReasonSchema.safeParse({ reason: 'Chargeback dispute' }).success).toBe(true);
  });
  it('validates plan keys and manual assignments', () => {
    const base = {
      name: 'Pro',
      rank: 2,
      currency: 'USD',
      monthlyMinor: 100,
      yearlyMinor: 1000,
      limits: {
        members: 5,
        channels: null,
        contacts: null,
        messages: null,
        whatsapp: null,
        instagram: null,
        messenger: null,
      },
    };
    expect(adminCreatePlanSchema.safeParse({ ...base, key: 'pro-2' }).success).toBe(true);
    expect(adminCreatePlanSchema.safeParse({ ...base, key: 'Pro Plan' }).success).toBe(false);
    expect(adminCreatePlanSchema.safeParse({ ...base, key: 'p', monthlyMinor: -1 }).success).toBe(
      false,
    );
    expect(
      adminAssignPlanSchema.safeParse({ planKey: 'growth', reason: 'VIP partner' }).success,
    ).toBe(true);
    expect(adminAssignPlanSchema.safeParse({ planKey: 'growth' }).success).toBe(false);
  });
});
