'use client';

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { SourceBadge } from '@/features/leads/components/badges';
import { cn } from '@/lib/utils';
import type { CustomerItem, CustomerSort } from '../types';
import { CustomerStatusBadge } from './status-badge';

interface Props {
  customers: CustomerItem[];
  total: number;
  page: number;
  pageSize: number;
  state: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  fetching: boolean;
  filtered: boolean;
  selected: Set<string>;
  activeId: string | null;
  sort: CustomerSort;
  dir: 'asc' | 'desc';
  canWrite: boolean;
  canDelete: boolean;
  now: number;
  onSort: (f: CustomerSort) => void;
  onPage: (p: number) => void;
  onOpen: (c: CustomerItem) => void;
  onEdit: (c: CustomerItem) => void;
  onDelete: (c: CustomerItem) => void;
  onOpenConversation: (c: CustomerItem) => void;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onAdd: () => void;
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

function RowMenu({ c, p }: { c: CustomerItem; p: Props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const item =
    'flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13px] hover:bg-wash';
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${c.name}`}
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
          className="absolute right-0 top-9 z-20 w-[200px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover"
        >
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              p.onOpen(c);
            }}
          >
            <UserRound size={14} className="text-muted" />
            View profile
          </button>
          {p.canWrite && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                p.onEdit(c);
              }}
            >
              <Pencil size={14} className="text-muted" />
              Edit
            </button>
          )}
          {c.conversationId && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                p.onOpenConversation(c);
              }}
            >
              <MessageSquare size={14} className="text-muted" />
              Open conversation
            </button>
          )}
          {p.canDelete && (
            <button
              role="menuitem"
              type="button"
              className={cn(item, 'text-danger')}
              onClick={() => {
                setOpen(false);
                p.onDelete(c);
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomersTable(p: Props) {
  const allOnPage = p.customers.length > 0 && p.customers.every((c) => p.selected.has(c.id));
  const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.total, p.page * p.pageSize);
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const sortHead = (label: string, field: CustomerSort, cls = '') => (
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
        <div className="text-sm font-semibold">Couldn&apos;t load customers</div>
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
        aria-label="Loading customers"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line-subtle px-4 py-3.5 last:border-0"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 w-1/5 bg-wash-2" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    );
  if (p.customers.length === 0)
    return (
      <div className="rounded-card border border-line bg-white px-6 py-14 text-center">
        <div className="text-[14.5px] font-semibold">
          {p.filtered ? 'No customers match your filters' : 'No customers yet'}
        </div>
        <div className="mx-auto mb-3.5 mt-1 max-w-[340px] text-[13px] text-muted">
          {p.filtered
            ? 'Try a different search or clear your filters.'
            : 'Customers appear here when people message you, or you can add them manually or import a CSV.'}
        </div>
        {p.filtered ? (
          <Button variant="outline" size="sm" onClick={p.onClearFilters}>
            Clear filters
          </Button>
        ) : (
          p.canWrite && (
            <Button size="sm" onClick={p.onAdd}>
              Add customer
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
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="border-b border-line-subtle bg-[#FBFBFC]">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <Box
                  checked={allOnPage}
                  label="Select all customers on this page"
                  onChange={p.onTogglePage}
                />
              </th>
              {sortHead('Customer', 'name')}
              <th scope="col" className={cn(th, 'max-lg:hidden')}>
                Contact
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Conversations
              </th>
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Source
              </th>
              <th scope="col" className={cn(th, 'max-lg:hidden')}>
                Tags
              </th>
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Last activity
              </th>
              {sortHead('Created', 'createdAt', 'max-2xl:hidden')}
              <th scope="col" className="w-10 px-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.customers.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                aria-selected={p.activeId === c.id}
                onClick={() => p.onOpen(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) p.onOpen(c);
                }}
                className={cn(
                  'cursor-pointer border-b border-line-subtle last:border-0 focus-visible:outline-offset-[-2px]',
                  p.selected.has(c.id)
                    ? 'bg-primary-soft'
                    : p.activeId === c.id
                      ? 'bg-[#F1F1FF]'
                      : 'hover:bg-[#F7F7F9]',
                )}
              >
                <td className="w-10 px-3 py-2.5">
                  <Box
                    checked={p.selected.has(c.id)}
                    label={`Select ${c.name}`}
                    onChange={() => p.onToggle(c.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                      {initialsOf(c.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-faint">
                        {c.company ?? (c.isSample ? 'Sample' : '—')}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="max-w-[200px] px-3 py-2.5 max-lg:hidden">
                  <span className="block truncate">{c.email ?? '—'}</span>
                  <span className="block truncate text-xs text-faint">{c.phone ?? ''}</span>
                </td>
                <td className="px-3 py-2.5">
                  <CustomerStatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2.5 tabular-nums max-xl:hidden">{c.conversationCount}</td>
                <td className="px-3 py-2.5 max-xl:hidden">
                  <SourceBadge source={c.source} />
                </td>
                <td className="max-w-[160px] px-3 py-2.5 max-lg:hidden">
                  <span className="flex gap-1 overflow-hidden">
                    {c.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="truncate rounded-full bg-primary-soft px-2 py-px text-xs text-primary-hover"
                      >
                        {t}
                      </span>
                    ))}
                    {c.tags.length > 2 && (
                      <span className="text-xs text-faint">+{c.tags.length - 2}</span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted max-xl:hidden">
                  {fmtAgo(c.lastActivityAt, p.now)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted max-2xl:hidden">
                  {new Date(c.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="w-10 px-2">
                  <RowMenu c={c} p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden">
        {p.customers.map((c) => (
          <li
            key={c.id}
            className={cn(
              'flex items-start gap-3 border-b border-line-subtle px-3 py-3 last:border-0',
              p.selected.has(c.id) && 'bg-primary-soft',
            )}
          >
            <Box
              checked={p.selected.has(c.id)}
              label={`Select ${c.name}`}
              onChange={() => p.onToggle(c.id)}
            />
            <button
              type="button"
              onClick={() => p.onOpen(c)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{c.name}</span>
                <CustomerStatusBadge status={c.status} className="shrink-0" />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[c.company, c.email ?? c.phone].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <SourceBadge source={c.source} />
                <span className="text-xs text-faint">
                  {c.conversationCount} conversations · {fmtAgo(c.lastActivityAt, p.now)}
                </span>
              </span>
            </button>
            <RowMenu c={c} p={p} />
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
