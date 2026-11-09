'use client';

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  MoreHorizontal,
  Receipt,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { CHANNEL_LABEL } from '../constants';
import { formatMoney } from '../money';
import type { OrderItem, OrderSort } from '../types';
import { FulfillmentBadge, OrderStatusBadge, PaymentBadge, SampleTag } from './badges';

interface Props {
  orders: OrderItem[];
  total: number;
  page: number;
  pageSize: number;
  state: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  fetching: boolean;
  filtered: boolean;
  selected: Set<string>;
  activeId: string | null;
  sort: OrderSort;
  dir: 'asc' | 'desc';
  canWrite: boolean;
  now: number;
  onSort: (f: OrderSort) => void;
  onPage: (p: number) => void;
  onOpen: (o: OrderItem) => void;
  onExport: (o: OrderItem) => void;
  onOpenConversation: (id: string) => void;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onCreate: () => void;
}

const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-muted whitespace-nowrap';

function Box({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="flex h-6 w-6 cursor-pointer items-center justify-center"
    >
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px]',
          checked ? 'border-primary bg-primary' : 'border-[#C9CBD3] bg-white',
        )}
      >
        {checked && <Check size={12} strokeWidth={3.4} className="text-white" />}
      </span>
    </button>
  );
}

function RowMenu({ o, p }: { o: OrderItem; p: Props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const item =
    'flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13px] no-underline hover:bg-wash hover:no-underline';
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for order #${o.number}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash-2"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-[210px] animate-panel-in rounded-xl border border-line glass-menu p-1.5 shadow-popover"
        >
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              p.onOpen(o);
            }}
          >
            <Receipt size={14} className="text-muted" />
            View order
          </button>
          <Link role="menuitem" href={`/customers?customer=${o.customer.id}`} className={item}>
            <UserRound size={14} className="text-muted" />
            Open customer
          </Link>
          {o.conversationId && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                p.onOpenConversation(o.conversationId!);
              }}
            >
              <MessageSquare size={14} className="text-muted" />
              Open conversation
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              p.onExport(o);
            }}
          >
            <Download size={14} className="text-muted" />
            Export order
          </button>
        </div>
      )}
    </div>
  );
}

export function OrdersTable(p: Props) {
  const tz = useTimeZone();
  const allOnPage = p.orders.length > 0 && p.orders.every((o) => p.selected.has(o.id));
  const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.total, p.page * p.pageSize);
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const sortHead = (label: string, field: OrderSort, cls = '') => (
    <th
      scope="col"
      aria-sort={p.sort === field ? (p.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(th, cls)}
    >
      <button
        type="button"
        onClick={() => p.onSort(field)}
        className="inline-flex cursor-pointer items-center gap-1 font-medium hover:text-ink"
      >
        {label}
        {p.sort === field && (p.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  if (p.state === 'error')
    return (
      <div role="alert" className="rounded-card border border-line bg-white px-6 py-14 text-center">
        <div className="text-sm font-semibold">Couldn&apos;t load orders</div>
        <div className="mb-3.5 mt-1 text-[13px] text-muted">{p.errorMessage}</div>
        <Button variant="outline" size="sm" onClick={p.onRetry}>
          Try again
        </Button>
      </div>
    );
  if (p.state === 'loading')
    return (
      <div
        className="overflow-hidden rounded-card border border-line bg-white"
        aria-busy="true"
        aria-label="Loading orders"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line-subtle px-4 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-1/5 bg-wash-2" />
            <Skeleton className="h-3.5 w-1/6" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    );
  if (p.orders.length === 0)
    return (
      <div className="rounded-card border border-line bg-white px-6 py-14 text-center">
        <div className="text-[14.5px] font-semibold">
          {p.filtered ? 'No orders match your filters' : 'No orders yet'}
        </div>
        <div className="mx-auto mb-3.5 mt-1 max-w-[360px] text-[13px] text-muted">
          {p.filtered
            ? 'Try a different search or clear your filters.'
            : 'Create an order for a customer to start tracking payments and fulfillment.'}
        </div>
        {p.filtered ? (
          <Button variant="outline" size="sm" onClick={p.onClearFilters}>
            Clear filters
          </Button>
        ) : (
          p.canWrite && (
            <Button size="sm" onClick={p.onCreate}>
              Create order
            </Button>
          )
        )}
      </div>
    );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-line bg-white transition-opacity',
        p.fetching && 'opacity-80',
      )}
    >
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead className="border-b border-line-subtle bg-[#FBFBFC]">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <Box
                  checked={allOnPage}
                  label="Select all orders on this page"
                  onChange={p.onTogglePage}
                />
              </th>
              {sortHead('Order', 'createdAt')}
              <th scope="col" className={th}>
                Customer
              </th>
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Items
              </th>
              {sortHead('Total', 'total')}
              <th scope="col" className={th}>
                Payment
              </th>
              <th scope="col" className={cn(th, 'max-lg:hidden')}>
                Fulfillment
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Channel
              </th>
              <th scope="col" className={cn(th, 'max-2xl:hidden')}>
                Created
              </th>
              <th scope="col" className="w-10 px-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.orders.map((o) => (
              <tr
                key={o.id}
                tabIndex={0}
                aria-selected={p.activeId === o.id}
                onClick={() => p.onOpen(o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) p.onOpen(o);
                }}
                className={cn(
                  'cursor-pointer border-b border-line-subtle last:border-0 focus-visible:outline-offset-[-2px]',
                  'transition-colors duration-150 motion-reduce:transition-none',
                  p.selected.has(o.id) || p.activeId === o.id ? 'bg-primary-soft' : 'hover:bg-wash',
                )}
              >
                <td className="w-10 px-3 py-2.5">
                  <Box
                    checked={p.selected.has(o.id)}
                    label={`Select order #${o.number}`}
                    onChange={() => p.onToggle(o.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    #{o.number}
                    {o.isSample && <SampleTag />}
                  </div>
                  <div className="text-xs text-faint">{fmtAgo(o.createdAt, p.now)}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                      {initialsOf(o.customer.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[180px] truncate font-medium">
                        {o.customer.name}
                      </span>
                      <span className="block max-w-[180px] truncate text-xs text-faint">
                        {o.customer.email ?? o.customer.phone ?? '—'}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 max-xl:hidden">
                  <div className="max-w-[200px] truncate" title={o.itemSummary}>
                    {o.itemSummary}
                  </div>
                  <div className="text-xs text-faint">
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums">
                  {formatMoney(o.totalMinor, o.currency)}
                  {o.outstandingMinor > 0 && o.paidMinor > 0 && (
                    <div className="text-xs font-normal text-faint">
                      {formatMoney(o.outstandingMinor, o.currency)} due
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <PaymentBadge status={o.paymentStatus} />
                </td>
                <td className="px-3 py-2.5 max-lg:hidden">
                  <FulfillmentBadge status={o.fulfillmentStatus} />
                </td>
                <td className="px-3 py-2.5">
                  <OrderStatusBadge status={o.status} />
                </td>
                <td className="px-3 py-2.5 text-muted max-xl:hidden">{CHANNEL_LABEL[o.channel]}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted max-2xl:hidden">
                  {fmtDateTime(o.createdAt, tz)}
                </td>
                <td className="w-10 px-2">
                  <RowMenu o={o} p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden">
        {p.orders.map((o) => (
          <li
            key={o.id}
            className={cn(
              'flex items-start gap-3 border-b border-line-subtle px-3 py-3 last:border-0',
              p.selected.has(o.id) && 'bg-primary-soft',
            )}
          >
            <Box
              checked={p.selected.has(o.id)}
              label={`Select order #${o.number}`}
              onChange={() => p.onToggle(o.id)}
            />
            <button
              type="button"
              onClick={() => p.onOpen(o)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  #{o.number} {o.isSample && <SampleTag />}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatMoney(o.totalMinor, o.currency)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {o.customer.name} · {fmtAgo(o.createdAt, p.now)}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <OrderStatusBadge status={o.status} />
                <PaymentBadge status={o.paymentStatus} />
                <FulfillmentBadge status={o.fulfillmentStatus} />
              </span>
            </button>
            <RowMenu o={o} p={p} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted">
        <span aria-live="polite">
          {from}–{to} of {p.total}
        </span>
        <div className="flex items-center gap-1.5">
          <span>
            Page {p.page} of {pages}
          </span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={p.page <= 1}
            onClick={() => p.onPage(p.page - 1)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={p.page >= pages}
            onClick={() => p.onPage(p.page + 1)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
