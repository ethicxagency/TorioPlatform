'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { AutomationSummary } from '../types';

export function AutomationKpis({
  summary: s,
  loading,
  error,
  onRetry,
}: {
  summary: AutomationSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load automation metrics.
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );
  const period = s ? `last ${s.periodDays} days` : '';
  const cards = [
    {
      label: 'Total automations',
      value: s?.total,
      sub: s ? `${s.draft} draft · ${s.inactive} inactive` : '',
    },
    { label: 'Active', value: s?.active, sub: 'Currently enabled' },
    { label: 'Executions', value: s?.runs, sub: period },
    { label: 'Successful runs', value: s?.succeeded, sub: period },
    {
      label: 'Failed runs',
      value: s?.failed,
      sub: s && s.failed > 0 ? 'Needs investigation' : period,
    },
  ];
  return (
    <section
      aria-label="Automation metrics"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:col-span-2"
        >
          <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
          {loading && !s ? (
            <>
              <Skeleton className="mt-2 h-7 w-12" />
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
    </section>
  );
}
