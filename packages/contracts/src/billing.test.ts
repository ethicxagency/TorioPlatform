import { describe, expect, it } from 'vitest';
import {
  annualSavingsPct,
  changeKind,
  mapInvoiceStatus,
  mapProviderStatus,
  overages,
  subscriptionActions,
  updateBillingProfileSchema,
  usageLevel,
  usagePercent,
  type PlanDef,
} from './billing';

const plan = (limits: Partial<PlanDef['limits']>): Pick<PlanDef, 'limits'> => ({
  limits: {
    members: null,
    channels: null,
    contacts: null,
    messages: null,
    whatsapp: null,
    instagram: null,
    messenger: null,
    ...limits,
  },
});

describe('usage levels', () => {
  it('warns at 70%, 90% and 100%', () => {
    expect(usageLevel(10, 100)).toBe('ok');
    expect(usageLevel(69, 100)).toBe('ok');
    expect(usageLevel(70, 100)).toBe('approaching');
    expect(usageLevel(89, 100)).toBe('approaching');
    expect(usageLevel(90, 100)).toBe('near');
    expect(usageLevel(99, 100)).toBe('near');
    expect(usageLevel(100, 100)).toBe('reached');
    expect(usageLevel(150, 100)).toBe('reached');
    expect(usageLevel(5, null)).toBe('unlimited');
  });
  it('handles zero limits and caps the percentage', () => {
    expect(usageLevel(0, 0)).toBe('ok');
    expect(usageLevel(1, 0)).toBe('reached');
    expect(usagePercent(150, 100)).toBe(100);
    expect(usagePercent(1, 3)).toBe(33);
    expect(usagePercent(5, null)).toBe(0);
  });
});

describe('plan changes', () => {
  const a = { key: 'starter', rank: 1, interval: 'MONTH' as const };
  it('classifies upgrade, downgrade, interval switch and no-op', () => {
    expect(changeKind(a, { key: 'growth', rank: 2, interval: 'MONTH' })).toBe('upgrade');
    expect(
      changeKind({ ...a, key: 'growth', rank: 2 }, { key: 'starter', rank: 1, interval: 'MONTH' }),
    ).toBe('downgrade');
    expect(changeKind(a, { ...a, interval: 'YEAR' })).toBe('interval');
    expect(changeKind(a, a)).toBe('same');
  });
  it('lists only the limits the current usage would exceed', () => {
    const o = overages(
      { members: 8, channels: 2, contacts: 50 },
      plan({ members: 5, channels: 3, contacts: 50 }),
    );
    expect(o).toEqual([{ metric: 'members', used: 8, limit: 5 }]);
    expect(overages({ members: 99 }, plan({}))).toEqual([]);
  });
  it('computes the annual saving', () => {
    expect(annualSavingsPct({ monthlyMinor: 1000, yearlyMinor: 10000 })).toBe(17);
    expect(annualSavingsPct({ monthlyMinor: 0, yearlyMinor: 0 })).toBe(0);
    expect(annualSavingsPct({ monthlyMinor: 1000, yearlyMinor: 13000 })).toBe(0);
  });
});

describe('subscription state', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const s = (
    status: Parameters<typeof subscriptionActions>[0] extends infer T
      ? NonNullable<T>['status']
      : never,
    extra = {},
  ) => ({
    status,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: future,
    ...extra,
  });
  it('active and trialing can change and cancel; scheduled cancellation can only be resumed', () => {
    expect(subscriptionActions(s('ACTIVE'))).toMatchObject({
      canChange: true,
      canCancel: true,
      canResume: false,
      access: 'full',
    });
    expect(subscriptionActions(s('TRIALING'))).toMatchObject({ canChange: true, canCancel: true });
    expect(subscriptionActions(s('ACTIVE', { cancelAtPeriodEnd: true }))).toMatchObject({
      canChange: false,
      canCancel: false,
      canResume: true,
      access: 'full_until_period_end',
    });
  });
  it('past due can retry payment or cancel, with limited access, but not change plan', () => {
    expect(subscriptionActions(s('PAST_DUE'))).toMatchObject({
      canRetryPayment: true,
      canCancel: true,
      canChange: false,
      access: 'limited',
    });
  });
  it('canceled keeps access until the period ends, then allows a new checkout', () => {
    expect(subscriptionActions(s('CANCELED'))).toMatchObject({
      access: 'full_until_period_end',
      canCheckout: false,
    });
    expect(subscriptionActions(s('CANCELED', { currentPeriodEnd: past }))).toMatchObject({
      access: 'none',
      canCheckout: true,
    });
    expect(subscriptionActions(s('EXPIRED'))).toMatchObject({ access: 'none', canCheckout: true });
  });
  it('no subscription means the free plan: can start checkout only', () => {
    expect(subscriptionActions(null)).toMatchObject({
      canCheckout: true,
      canChange: false,
      canCancel: false,
    });
  });
});

describe('provider mapping', () => {
  it('maps Stripe subscription statuses and ignores transient ones', () => {
    expect(mapProviderStatus('active')).toBe('ACTIVE');
    expect(mapProviderStatus('trialing')).toBe('TRIALING');
    expect(mapProviderStatus('unpaid')).toBe('PAST_DUE');
    expect(mapProviderStatus('past_due')).toBe('PAST_DUE');
    expect(mapProviderStatus('canceled')).toBe('CANCELED');
    expect(mapProviderStatus('incomplete_expired')).toBe('EXPIRED');
    expect(mapProviderStatus('incomplete')).toBeNull();
  });
  it('maps invoice states', () => {
    expect(mapInvoiceStatus('paid', true)).toBe('PAID');
    expect(mapInvoiceStatus('open', false)).toBe('PENDING');
    expect(mapInvoiceStatus('open', true)).toBe('FAILED');
    expect(mapInvoiceStatus('void', false)).toBe('VOID');
    expect(mapInvoiceStatus('uncollectible', true)).toBe('FAILED');
    expect(mapInvoiceStatus('draft', false)).toBe('PENDING');
  });
});

describe('billing profile validation', () => {
  it('normalises, clears and rejects', () => {
    expect(
      updateBillingProfileSchema.parse({
        billingEmail: 'Pay@Acme.CO',
        country: 'bd',
        companyName: '',
      }),
    ).toEqual({
      billingEmail: 'pay@acme.co',
      country: 'BD',
      companyName: null,
    });
    expect(updateBillingProfileSchema.safeParse({ country: 'Bangladesh' }).success).toBe(false);
    expect(updateBillingProfileSchema.safeParse({ billingEmail: 'nope' }).success).toBe(false);
    expect(updateBillingProfileSchema.safeParse({}).success).toBe(false);
    expect(updateBillingProfileSchema.safeParse({ providerCustomerId: 'cus_1' }).success).toBe(
      false,
    );
  });
});
