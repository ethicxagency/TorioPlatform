'use client';

import { MetricCard } from '@/components/ui/card';
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
  const cards = [
    { label: 'Total customers', value: s?.total },
    { label: 'New customers (30 days)', value: s?.createdLast30Days },
    { label: 'With conversations', value: s?.withConversations },
    { label: 'Repeat customers', unavailable: true },
    { label: 'Revenue · Lifetime value', unavailable: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
      {cards.map((c) => (
        <MetricCard
          key={c.label}
          label={c.label}
          value={c.unavailable ? '—' : c.value}
          muted={c.unavailable}
          loading={loading && !c.unavailable}
          className="max-sm:last:col-span-2"
        />
      ))}
    </div>
  );
}
