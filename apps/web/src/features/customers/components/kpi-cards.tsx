'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { CustomerSummary } from '../types';

interface Props {
  summary: CustomerSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/**
 * Real numbers only. Repeat customers, revenue and lifetime value need order data, which does not exist yet,
 * so those cards say so instead of showing a figure.
 */
export function CustomerKpis({ summary: s, loading, error, onRetry }: Props) {
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load customer metrics.
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );
  const delta = s ? s.createdLast30Days - s.createdPrevious30Days : 0;
  const cards = [
    { label: 'Total customers', value: s?.total, sub: s ? `${s.active} active` : '' },
    {
      label: 'New customers (30 days)',
      value: s?.createdLast30Days,
      sub: s
        ? s.createdPrevious30Days > 0
          ? `${delta >= 0 ? '+' : ''}${delta} vs prior 30 days`
          : 'No prior period to compare'
        : '',
    },
    { label: 'With conversations', value: s?.withConversations, sub: 'Have messaged you in Inbox' },
    { label: 'Repeat customers', unavailable: true },
    { label: 'Revenue · Lifetime value', unavailable: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:col-span-2"
        >
          <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
          {c.unavailable ? (
            <>
              <div className="mt-1 text-2xl font-semibold text-faint">—</div>
              <div className="mt-1 text-xs text-faint">Available once Orders is built</div>
            </>
          ) : loading ? (
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
