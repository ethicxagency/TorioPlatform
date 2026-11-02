'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { moneyList } from '../money';
import type { OrderSummary } from '../types';

interface Props {
  summary: OrderSummary | undefined;
  loading: boolean;
  error: boolean;
  periodLabel: string;
  onRetry: () => void;
}

/**
 * Real numbers only, from the API. Revenue is the sum of payments recorded on non-cancelled orders created in the
 * period, shown per currency (currencies are never added together). Unpaid, cancelled and refunded amounts never count.
 */
export function OrderKpis({ summary: s, loading, error, periodLabel, onRetry }: Props) {
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load order metrics.
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );
  const delta = s ? s.totalOrders - s.previousTotalOrders : 0;
  const cards = [
    {
      label: 'Total orders',
      value: s?.totalOrders,
      sub: s
        ? s.hasPrevious
          ? s.previousTotalOrders > 0
            ? `${delta >= 0 ? '+' : ''}${delta} vs prior period`
            : 'No prior period to compare'
          : `${s.cancelled} cancelled`
        : '',
    },
    {
      label: 'Revenue collected',
      value: s ? (s.revenue.length ? moneyList(s.revenue) : '—') : undefined,
      sub: s ? 'Recorded payments, excl. cancelled' : '',
    },
    {
      label: 'Pending payments',
      value: s?.pendingPayments.count,
      sub: s
        ? s.pendingPayments.outstanding.length
          ? `${moneyList(s.pendingPayments.outstanding)} outstanding`
          : 'Nothing outstanding'
        : '',
    },
    { label: 'Processing', value: s?.processing, sub: 'Confirmed or in progress' },
    { label: 'Completed', value: s?.completed, sub: 'Fulfilled and paid' },
  ];
  return (
    <section aria-label={`Order metrics, ${periodLabel}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:col-span-2"
          >
            <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
            {loading && !s ? (
              <>
                <Skeleton className="mt-2 h-7 w-16" />
                <Skeleton className="mt-2 h-3 w-24 bg-wash-2" />
              </>
            ) : (
              <>
                <div className="mt-1 truncate text-2xl font-metric">{c.value ?? '—'}</div>
                <div className="mt-1 truncate text-xs text-faint" title={c.sub}>
                  {c.sub}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
