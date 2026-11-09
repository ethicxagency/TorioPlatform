'use client';

import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarArrowDown,
  CalendarArrowUp,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { FilterMenu, type FilterMenuOption } from '@/features/inbox/components/filter-menu';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useKeepInView } from '@/features/inbox/use-keep-in-view';
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

const selectCls =
  'h-9 w-full rounded-[var(--radius-control)] border border-line bg-white px-2 text-[13px] text-ink';
const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

type SortKey = `${OrderSort}-${'asc' | 'desc'}`;

// The orders the orders API supports: created date and total.
const SORTS: (FilterMenuOption<SortKey> & { sort: OrderSort; dir: 'asc' | 'desc' })[] = [
  {
    key: 'createdAt-desc',
    label: 'Newest first',
    short: 'Newest',
    sort: 'createdAt',
    dir: 'desc',
    icon: <CalendarArrowDown size={15} aria-hidden />,
  },
  {
    key: 'createdAt-asc',
    label: 'Oldest first',
    short: 'Oldest',
    sort: 'createdAt',
    dir: 'asc',
    icon: <CalendarArrowUp size={15} aria-hidden />,
  },
  {
    key: 'total-desc',
    label: 'Highest value',
    short: 'Highest',
    sort: 'total',
    dir: 'desc',
    icon: <ArrowDownWideNarrow size={15} aria-hidden />,
  },
  {
    key: 'total-asc',
    label: 'Lowest value',
    short: 'Lowest',
    sort: 'total',
    dir: 'asc',
    icon: <ArrowUpNarrowWide size={15} aria-hidden />,
  },
];

const ICON_BTN =
  'relative flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

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
      <legend className="mb-1.5 font-label text-muted">{legend}</legend>
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
  const { registerEscape } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  useKeepInView(panel);
  useEffect(
    () => (open ? registerEscape(() => setOpen(false)) : undefined),
    [open, registerEscape],
  );
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
    f.range && {
      label: DATE_RANGES.find((r) => r.key === f.range)!.label,
      clear: () => p.onFilters({ range: '' }),
    },
    f.min && { label: `Min ${f.min}`, clear: () => p.onFilters({ min: '' }) },
    f.max && { label: `Max ${f.max}`, clear: () => p.onFilters({ max: '' }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="@container">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[200px] flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 motion-reduce:transition-none">
            <Search size={15} className="shrink-0 text-faint" aria-hidden />
            <input
              type="search"
              aria-label="Search orders"
              placeholder="Search order ID, customer, email or phone"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
            />
            {p.search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => p.onSearch('')}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-faint hover:bg-wash-2 hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </label>
          <div ref={ref} className="relative shrink-0">
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-label={n ? `Filters, ${n} applied` : 'Filters'}
              onClick={() => setOpen((v) => !v)}
              className={cn(
                ICON_BTN,
                open || n
                  ? 'border-[rgba(91,92,226,0.28)] bg-primary-soft text-primary-hover'
                  : 'border-line bg-white text-ink hover:border-line-input hover:bg-wash active:bg-wash-2',
              )}
            >
              <SlidersHorizontal size={15} aria-hidden />
              Filters
              {n > 0 && (
                <span
                  aria-hidden
                  className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
                >
                  {n}
                </span>
              )}
            </button>
            {open && (
              <div
                ref={panel}
                role="dialog"
                aria-label="Order filters"
                className="absolute left-0 top-11 z-[45] flex w-[min(360px,calc(100vw-32px))] animate-panel-in flex-col gap-3.5 rounded-xl border border-line bg-white p-3.5 shadow-popover max-h-[min(78vh,640px)] overflow-y-auto"
              >
                <div className="flex items-center gap-2">
                  <span className="font-card-title">Filters</span>
                  {n > 0 && (
                    <span className="rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary-hover">
                      {n}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={!n}
                    onClick={p.onClear}
                    className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent"
                  >
                    Clear all
                  </button>
                </div>
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
                <label className="flex flex-col gap-1.5 font-label text-muted">
                  Order date
                  <select
                    aria-label="Order date"
                    value={f.range}
                    onChange={(e) => p.onFilters({ range: e.target.value as OrderRange })}
                    className={selectCls}
                  >
                    <option value="">All time</option>
                    {DATE_RANGES.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 font-label text-muted">
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
                <label className="flex flex-col gap-1.5 font-label text-muted">
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
                    <label key={k} className="flex flex-col gap-1.5 font-label text-muted">
                      {k === 'min' ? 'Min value' : 'Max value'}
                      <input
                        inputMode="decimal"
                        value={f[k]}
                        placeholder="0.00"
                        onChange={(e) =>
                          p.onFilters({ [k]: e.target.value.replace(/[^\d.,]/g, '') })
                        }
                        className={selectCls}
                      />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['min', 'max'] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-1.5 font-label text-muted">
                      {k === 'min' ? 'Min value' : 'Max value'}
                      <input
                        inputMode="decimal"
                        value={f[k]}
                        placeholder="0.00"
                        onChange={(e) =>
                          p.onFilters({ [k]: e.target.value.replace(/[^\d.,]/g, '') })
                        }
                        className={selectCls}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <FilterMenu
            label="Sort"
            options={SORTS}
            value={`${p.sort}-${p.dir}` as SortKey}
            defaultValue="createdAt-desc"
            onChange={(key) => {
              const o = SORTS.find((x) => x.key === key)!;
              p.onSort(o.sort, o.dir);
            }}
            className="w-[148px] shrink-0 @min-[640px]:w-[172px]"
          />
        </div>
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
