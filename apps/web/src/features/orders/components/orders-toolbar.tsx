'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { DATE_RANGES } from '@/features/leads/constants';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABEL,
  FULFILLMENT_INFO,
  METHOD_LABEL,
  PAYMENT_INFO,
  STATUS_INFO,
} from '../constants';
import {
  activeOrderFilterCount,
  type FulfillmentStatus,
  type OrderChannel,
  type OrderFilters,
  type OrderRange,
  type OrderSort,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../types';

interface Props {
  filters: OrderFilters;
  search: string;
  sort: OrderSort;
  dir: 'asc' | 'desc';
  onSearch: (q: string) => void;
  onFilters: (p: Partial<OrderFilters>) => void;
  onClear: () => void;
  onSort: (s: OrderSort, d: 'asc' | 'desc') => void;
}

const selectCls = 'h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink';
const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
const SORTS = [
  {
    key: 'createdAt-desc',
    label: 'Newest first',
    sort: 'createdAt' as const,
    dir: 'desc' as const,
  },
  { key: 'createdAt-asc', label: 'Oldest first', sort: 'createdAt' as const, dir: 'asc' as const },
  { key: 'total-desc', label: 'Highest value', sort: 'total' as const, dir: 'desc' as const },
  { key: 'total-asc', label: 'Lowest value', sort: 'total' as const, dir: 'asc' as const },
];

function Chips<T extends string>({
  legend,
  items,
  value,
  onChange,
}: {
  legend: string;
  items: { key: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1.5 text-[11.5px] text-faint">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const on = value.includes(i.key);
          return (
            <button
              key={i.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggle(value, i.key))}
              className={cn(
                'h-7 cursor-pointer rounded-full border px-2.5 text-xs',
                on
                  ? 'border-[rgba(91,92,226,0.3)] bg-primary-soft font-semibold text-primary-hover'
                  : 'border-line bg-white text-muted hover:bg-wash',
              )}
            >
              {i.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function OrdersToolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const f = p.filters;
  const n = activeOrderFilterCount(f);
  const chips = [
    ...f.status.map((s) => ({
      label: STATUS_INFO[s].label,
      clear: () => p.onFilters({ status: f.status.filter((x) => x !== s) }),
    })),
    ...f.paymentStatus.map((s) => ({
      label: PAYMENT_INFO[s].label,
      clear: () => p.onFilters({ paymentStatus: f.paymentStatus.filter((x) => x !== s) }),
    })),
    ...f.fulfillmentStatus.map((s) => ({
      label: FULFILLMENT_INFO[s].label,
      clear: () => p.onFilters({ fulfillmentStatus: f.fulfillmentStatus.filter((x) => x !== s) }),
    })),
    f.channel && { label: CHANNEL_LABEL[f.channel], clear: () => p.onFilters({ channel: '' }) },
    f.method && { label: METHOD_LABEL[f.method], clear: () => p.onFilters({ method: '' }) },
    f.min && { label: `Min ${f.min}`, clear: () => p.onFilters({ min: '' }) },
    f.max && { label: `Max ${f.max}`, clear: () => p.onFilters({ max: '' }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[360px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search orders"
            placeholder="Search order #, customer, email or phone"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
        </label>
        <select
          aria-label="Period"
          value={f.range}
          onChange={(e) => p.onFilters({ range: e.target.value as OrderRange })}
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="">All time</option>
          {DATE_RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <div ref={ref} className="relative">
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-medium',
              open || n ? 'bg-primary-soft text-primary-hover' : 'bg-white hover:bg-wash',
            )}
          >
            <SlidersHorizontal size={14} />
            Filters
            {n > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-lg bg-primary px-1 text-[10px] font-semibold text-white">
                {n}
              </span>
            )}
          </button>
          {open && (
            <div
              role="dialog"
              aria-label="Order filters"
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              className="absolute left-0 top-11 z-30 flex max-h-[70vh] w-[min(340px,calc(100vw-32px))] animate-panel-in flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-white p-3.5 shadow-popover"
            >
              <Chips<OrderStatus>
                legend="Order status"
                items={(Object.keys(STATUS_INFO) as OrderStatus[]).map((k) => ({
                  key: k,
                  label: STATUS_INFO[k].label,
                }))}
                value={f.status}
                onChange={(status) => p.onFilters({ status })}
              />
              <Chips<PaymentStatus>
                legend="Payment"
                items={(Object.keys(PAYMENT_INFO) as PaymentStatus[]).map((k) => ({
                  key: k,
                  label: PAYMENT_INFO[k].label,
                }))}
                value={f.paymentStatus}
                onChange={(paymentStatus) => p.onFilters({ paymentStatus })}
              />
              <Chips<FulfillmentStatus>
                legend="Fulfillment"
                items={(Object.keys(FULFILLMENT_INFO) as FulfillmentStatus[]).map((k) => ({
                  key: k,
                  label: FULFILLMENT_INFO[k].label,
                }))}
                value={f.fulfillmentStatus}
                onChange={(fulfillmentStatus) => p.onFilters({ fulfillmentStatus })}
              />
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Sales channel
                <select
                  value={f.channel}
                  onChange={(e) => p.onFilters({ channel: e.target.value as '' | OrderChannel })}
                  className={selectCls}
                >
                  <option value="">Any channel</option>
                  {(Object.keys(CHANNEL_LABEL) as OrderChannel[]).map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Payment method
                <select
                  value={f.method}
                  onChange={(e) => p.onFilters({ method: e.target.value as '' | PaymentMethod })}
                  className={selectCls}
                >
                  <option value="">Any method</option>
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['min', 'max'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-[11.5px] text-faint">
                    {k === 'min' ? 'Min value' : 'Max value'}
                    <input
                      inputMode="decimal"
                      value={f[k]}
                      placeholder="0.00"
                      onChange={(e) => p.onFilters({ [k]: e.target.value.replace(/[^\d.,]/g, '') })}
                      className={selectCls}
                    />
                  </label>
                ))}
              </div>
              {n > 0 && (
                <button
                  type="button"
                  onClick={p.onClear}
                  className="cursor-pointer self-start text-xs font-medium text-primary"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
        <select
          aria-label="Sort orders"
          value={`${p.sort}-${p.dir}`}
          onChange={(e) => {
            const s = SORTS.find((x) => x.key === e.target.value)!;
            p.onSort(s.sort, s.dir);
          }}
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
            >
              {c.label}
              <button
                type="button"
                aria-label={`Remove filter ${c.label}`}
                onClick={c.clear}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={p.onClear}
            className="cursor-pointer text-xs font-medium text-primary"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
