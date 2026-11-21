import type { PublicPlan } from '@torio/contracts';
import { describe, expect, it } from 'vitest';
import { planHref } from '@/lib/public-plans';
import { planIntent } from '@/lib/plan-intent';
import { featureList, intervalFor } from './pricing-cards';

const plan = (over: Partial<PublicPlan> = {}): PublicPlan => ({
  key: 'growth',
  name: 'Growth',
  description: '',
  rank: 2,
  recommended: false,
  currency: 'BDT',
  monthlyMinor: 150_000,
  yearlyMinor: 1_800_000,
  monthlyAvailable: true,
  yearlyAvailable: true,
  limits: {},
  features: ['Unified Smart Inbox'],
  entitlements: [],
  ...over,
});

describe('public pricing helpers', () => {
  it('shows the interval the visitor chose when the plan has a price for it', () => {
    expect(intervalFor(plan(), 'YEAR')).toBe('YEAR');
    expect(intervalFor(plan(), 'MONTH')).toBe('MONTH');
  });
  it('falls back to the other interval only when it is really configured, and never invents one', () => {
    expect(intervalFor(plan({ yearlyAvailable: false, yearlyMinor: 0 }), 'YEAR')).toBe('MONTH');
    expect(intervalFor(plan({ monthlyAvailable: false, monthlyMinor: 0 }), 'MONTH')).toBe('YEAR');
    expect(
      intervalFor(plan({ monthlyAvailable: false, yearlyAvailable: false }), 'MONTH'),
    ).toBeNull();
  });
  it('lists configured features plus real capabilities, without repeating one', () => {
    expect(featureList(plan({ features: ['A'], entitlements: ['courier'] }))).toEqual([
      'A',
      'Courier Integration',
    ]);
    expect(
      featureList(plan({ features: ['Courier Integration'], entitlements: ['courier'] })),
    ).toEqual(['Courier Integration']);
  });
  it('the plan CTA carries the plan key and interval', () => {
    expect(planHref('scale', 'YEAR')).toBe('/signup?plan=scale&interval=YEAR');
    expect(planHref('starter', 'MONTH', '/login')).toBe('/login?plan=starter&interval=MONTH');
  });
  it('reads a plan intent only when it is well formed; anything else is ignored', () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(planIntent(q('plan=growth&interval=YEAR'))).toEqual({
      plan: 'growth',
      interval: 'YEAR',
    });
    expect(planIntent(q('plan=growth'))).toEqual({ plan: 'growth', interval: 'MONTH' });
    expect(planIntent(q('plan=../admin'))).toBeNull();
    expect(planIntent(q('plan=Growth!'))).toBeNull();
    expect(planIntent(q(''))).toBeNull();
  });
});
