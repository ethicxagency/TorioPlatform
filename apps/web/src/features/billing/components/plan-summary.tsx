'use client';

import { CalendarClock, CircleDot, Layers, Repeat, type LucideIcon } from 'lucide-react';
import { useTimeZone } from '@/features/settings/queries';
import type { Overview } from '../types';
import { fmtDate } from './bits';

/** The few facts worth seeing while choosing a plan: what you are on, its state, when it renews, and how it bills. */
export function PlanSummary({ o }: { o: Overview }) {
  const tz = useTimeZone();
  const s = o.subscription;
  const ends = !!s && (s.cancelAtPeriodEnd || s.status === 'CANCELED');
  const items: { label: string; icon: LucideIcon; value: string }[] = [
    { label: 'Current plan', icon: Layers, value: o.plan.name },
    {
      label: 'Status',
      icon: CircleDot,
      value: !s
        ? 'Free plan'
        : ends
          ? 'Ends at period end'
          : s.status
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/^./, (c) => c.toUpperCase()),
    },
    {
      label: ends ? 'Access until' : 'Next billing',
      icon: CalendarClock,
      value: s ? fmtDate(s.currentPeriodEnd, tz) : 'None',
    },
    {
      label: 'Billing cycle',
      icon: Repeat,
      value: s ? (s.interval === 'YEAR' ? 'Yearly' : 'Monthly') : 'No billing',
    },
  ];
  return (
    <dl aria-label="Subscription summary" className="m-0 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-line bg-white px-3.5 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-faint">
            <i.icon size={13} aria-hidden /> {i.label}
          </dt>
          <dd className="m-0 mt-0.5 truncate text-[14px] font-semibold text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
