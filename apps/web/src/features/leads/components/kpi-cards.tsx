'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { LeadSummary } from '../types';

interface Props {
  summary: LeadSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

/** KPIs come straight from the API. The only comparison shown is real: leads created in the last 30 days vs the 30 before. */
export function KpiCards({ summary: s, loading, error, onRetry }: Props) {
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load lead metrics.
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );

  const delta = s ? s.createdLast30Days - s.createdPrevious30Days : 0;
  const cards = [
    {
      label: 'Total leads',
      value: s?.total,
      sub: s
        ? `${s.createdLast30Days} added in 30 days${s.createdPrevious30Days > 0 ? ` (${delta >= 0 ? '+' : ''}${delta} vs prior 30)` : ''}`
        : '',
    },
    { label: 'New', value: s?.new, sub: 'Not yet contacted' },
    { label: 'Qualified', value: s?.qualified, sub: 'Ready for a proposal' },
    {
      label: 'Conversion rate',
      value: s ? pct(s.conversionRate) : undefined,
      sub: s?.conversionRate == null ? 'No closed leads yet' : `${s.won} won · ${s.lost} lost`,
    },
    {
      label: 'Unassigned',
      value: s?.unassigned,
      sub: s && s.unassigned > 0 ? 'Need an owner' : 'All leads have owners',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:col-span-2"
        >
          <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
          {loading ? (
            <>
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24 bg-wash-2" />
            </>
          ) : (
            <>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em]">
                {c.value ?? '—'}
              </div>
              <div className="mt-1 truncate text-xs text-faint">{c.sub}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
