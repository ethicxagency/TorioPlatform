'use client';

import { MetricCard } from '@/components/ui/card';
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
 * Real numbers only, from the API; each card shows just its title and value. Revenue is the sum of payments recorded on non-cancelled orders created in the
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
  const cards = [
    { label: 'Total orders', value: s?.totalOrders },
    {
      label: 'Revenue collected',
      value: s ? (s.revenue.length ? moneyList(s.revenue) : '—') : undefined,
    },
    { label: 'Pending payments', value: s?.pendingPayments.count },
    { label: 'Processing', value: s?.processing },
    { label: 'Completed', value: s?.completed },
  ];
  return (
    <section aria-label={`Order metrics, ${periodLabel}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        {cards.map((c) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={c.value}
            loading={loading && !s}
            className="max-sm:last:col-span-2"
          />
        ))}
      </div>
    </section>
  );
}
