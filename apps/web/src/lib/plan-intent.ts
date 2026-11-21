/**
 * The plan a visitor picked on the public pricing page, carried through sign-up or sign-in as ?plan=<key>&interval=MONTH|YEAR.
 * It is only a pointer: the price and availability are decided by the server again at checkout, never trusted from here.
 */
export interface PlanIntent {
  plan: string;
  interval: 'MONTH' | 'YEAR';
}
const KEY = /^[a-z][a-z0-9-]{1,29}$/;

export function planIntent(params: { get(name: string): string | null }): PlanIntent | null {
  const plan = params.get('plan');
  if (!plan || !KEY.test(plan)) return null;
  return { plan, interval: params.get('interval') === 'YEAR' ? 'YEAR' : 'MONTH' };
}
const qs = (i: PlanIntent) => `plan=${encodeURIComponent(i.plan)}&interval=${i.interval}`;
/** Where the customer lands to finish choosing: the existing Billing plans tab, with that plan highlighted. */
export const billingUrlFor = (i: PlanIntent) => `/billing/subscription?tab=plans&${qs(i)}`;
export const onboardingUrlFor = (i: PlanIntent | null) =>
  i ? `/onboarding?${qs(i)}` : '/onboarding';
