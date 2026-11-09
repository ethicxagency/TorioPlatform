'use client';

import { MetricCard } from '@/components/ui/card';
import type { LeadSummary } from '../types';

interface Props {
  summary: LeadSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

/** KPIs come straight from the API; the cards show only the metric and its title. */
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

  const cards = [
    { label: 'Total leads', value: s?.total },
    { label: 'New', value: s?.new },
    { label: 'Qualified', value: s?.qualified },
    { label: 'Conversion rate', value: s ? pct(s.conversionRate) : undefined },
    { label: 'Unassigned', value: s?.unassigned },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
      {cards.map((c) => (
        <MetricCard
          key={c.label}
          label={c.label}
          value={c.value}
          loading={loading}
          className="max-sm:last:col-span-2"
        />
      ))}
    </div>
  );
}
