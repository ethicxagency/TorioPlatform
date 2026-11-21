'use client';

import {
  annualSavingsPct,
  ENTITLEMENT_LABEL,
  formatMoney,
  type PublicPlan,
} from '@torio/contracts';
import { Check, Contact, MessageSquare, Plug, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { planHref, type Interval } from '@/lib/public-plans';

const limitText = (v: number | undefined) =>
  v === undefined ? '' : v < 0 ? 'Unlimited' : v.toLocaleString('en');

/** Which interval a plan can be bought on: the chosen one if it has a price, else the other. Never invents a price. */
export const intervalFor = (p: PublicPlan, want: Interval): Interval | null =>
  want === 'YEAR'
    ? p.yearlyAvailable
      ? 'YEAR'
      : p.monthlyAvailable
        ? 'MONTH'
        : null
    : p.monthlyAvailable
      ? 'MONTH'
      : p.yearlyAvailable
        ? 'YEAR'
        : null;

/** The feature list as configured, plus the capabilities the plan really includes, without repeating one. */
export const featureList = (p: PublicPlan) => {
  const seen = new Set(p.features.map((f) => f.toLowerCase()));
  const extra = p.entitlements
    .map((e) => ENTITLEMENT_LABEL[e])
    .filter((label) => !seen.has(label.toLowerCase()));
  return [...p.features, ...extra];
};

export function PricingCards({ plans }: { plans: PublicPlan[] }) {
  const anyYearly = plans.some((p) => p.yearlyAvailable);
  const anyMonthly = plans.some((p) => p.monthlyAvailable);
  const [interval, setInterval] = useState<Interval>(anyMonthly ? 'MONTH' : 'YEAR');
  const savings = Math.max(0, ...plans.map((p) => annualSavingsPct({ ...p })));
  return (
    <div>
      {anyYearly && anyMonthly && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <div
            role="group"
            aria-label="Billing interval"
            className="inline-flex rounded-xl border border-line bg-wash p-0.5"
          >
            {(['MONTH', 'YEAR'] as const).map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={interval === i}
                onClick={() => setInterval(i)}
                className={cn(
                  'h-9 min-w-[96px] cursor-pointer rounded-[10px] border-none px-4 text-[14px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
                  interval === i
                    ? 'bg-white font-semibold text-primary-hover shadow-[0_1px_3px_rgba(0,55,112,0.12)]'
                    : 'bg-transparent text-muted hover:text-ink',
                )}
              >
                {i === 'MONTH' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          {savings > 0 && (
            <span className="text-[13px] text-success">
              Save up to {savings}% with yearly billing
            </span>
          )}
        </div>
      )}
      <ul className="m-0 mt-10 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const shown = intervalFor(p, interval);
          const amount = shown === 'YEAR' ? p.yearlyMinor : p.monthlyMinor;
          const rows: [LucideIcon, string][] = [
            [
              Users,
              `${limitText(p.limits.members)} team member${p.limits.members === 1 ? '' : 's'}`,
            ],
            [Plug, `${limitText(p.limits.channels)} connected channels`],
            [Contact, `${limitText(p.limits.contacts)} customer contacts`],
            [MessageSquare, `${limitText(p.limits.messages)} messages / month`],
          ];
          return (
            <li
              key={p.key}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-white p-6',
                p.recommended
                  ? 'border-primary shadow-[0_0_0_3px_rgba(91,92,226,0.10)]'
                  : 'border-line',
              )}
            >
              {p.recommended && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-[12px] font-medium text-white">
                  Recommended
                </span>
              )}
              <h3 className="m-0 text-[20px] font-semibold">{p.name}</h3>
              <p className="m-0 mt-1.5 min-h-[44px] text-[14px] leading-snug text-muted">
                {p.description}
              </p>
              <div className="mt-5 flex items-baseline gap-1.5">
                {shown ? (
                  <>
                    <span className="text-[36px] font-semibold leading-none tracking-[-0.02em]">
                      {formatMoney(amount, p.currency)}
                    </span>
                    <span className="text-[14px] text-faint">
                      / {shown === 'YEAR' ? 'year' : 'month'}
                    </span>
                  </>
                ) : (
                  <span className="text-[15px] text-muted">Pricing not available</span>
                )}
              </div>
              <p className="m-0 mt-1.5 min-h-[20px] text-[13px] text-success">
                {shown === 'YEAR' && annualSavingsPct({ ...p }) > 0
                  ? `Saves ${annualSavingsPct({ ...p })}% vs monthly`
                  : interval === 'YEAR' && shown === 'MONTH'
                    ? 'Yearly billing isn’t offered for this plan'
                    : ''}
              </p>
              {shown ? (
                <Link
                  href={planHref(p.key, shown)}
                  className={cn(
                    'mt-4 inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    p.recommended
                      ? 'bg-primary text-white hover:bg-primary-hover'
                      : 'border border-line bg-white text-ink hover:bg-wash',
                  )}
                >
                  Get started with {p.name}
                </Link>
              ) : null}
              <ul className="m-0 mt-5 flex list-none flex-col gap-2 border-t border-line-subtle p-0 pt-5 text-[14px]">
                {rows.map(([Icon, text]) => (
                  <li key={text} className="flex items-center gap-2.5 font-medium">
                    <Icon size={16} aria-hidden className="shrink-0 text-primary" />
                    {text}
                  </li>
                ))}
              </ul>
              <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-[14px] text-ink-secondary">
                {featureList(p).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-8 text-center text-[13px] text-faint">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary">
          Sign in
        </Link>{' '}
        to change your plan from Billing.
      </p>
    </div>
  );
}
