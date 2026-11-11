'use client';

import { ArrowDown, ArrowUp, Check, MessageSquare, Pencil, Trash2, UserRound } from 'lucide-react';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { SourceBadge } from '@/features/leads/components/badges';
import { ActionMenu } from '@/components/ui/menu';
import { Pagination } from '@/components/ui/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/ui/table-states';
import { cn } from '@/lib/utils';
import type { CustomerItem, CustomerSort } from '../types';
import { CustomerStatusBadge } from './status-badge';
import { fmtDate } from '@/lib/datetime';

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
  return (
    <ActionMenu
      label={`Actions for ${c.name}`}
      width={200}
      items={[
        { label: 'View profile', icon: UserRound, onSelect: () => p.onOpen(c) },
        p.canWrite && { label: 'Edit', icon: Pencil, onSelect: () => p.onEdit(c) },
        !!c.conversationId && {
          label: 'Open conversation',
          icon: MessageSquare,
          onSelect: () => p.onOpenConversation(c),
        },
        p.canDelete && {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: () => p.onDelete(c),
        },
      ]}
    />
  );
}

export function CustomersTable(p: Props) {
  const allOnPage = p.customers.length > 0 && p.customers.every((c) => p.selected.has(c.id));
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
    return <TableError noun="customers" message={p.errorMessage} onRetry={p.onRetry} />;
  if (p.state === 'loading') return <TableLoading noun="customers" avatar={true} />;
  if (p.customers.length === 0)
    return (
      <TableEmpty
        noun="customers"
        filtered={p.filtered}
        hint="Customers appear here when people message you, or you can add them manually or import a CSV."
        maxWidth={340}
        onClearFilters={p.onClearFilters}
        action={p.canWrite ? { label: 'Add customer', onClick: p.onAdd } : null}
      />
    );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-line bg-white transition-opacity',
        p.fetching && 'opacity-80',
      )}
    >
      <div className="max-h-[max(360px,calc(100vh-300px))] overflow-auto max-md:hidden">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[#FBFBFC] shadow-[0_1px_0_var(--color-line-subtle)]">
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
                  'transition-colors duration-150 motion-reduce:transition-none',
                  p.selected.has(c.id) || p.activeId === c.id ? 'bg-primary-soft' : 'hover:bg-wash',
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
                        className="inline-flex h-[18px] max-w-[110px] items-center truncate rounded-full bg-wash-2 px-2 text-[11px] leading-none text-muted"
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
                  {fmtDate(c.createdAt, {
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
      <Pagination page={p.page} total={p.total} pageSize={p.pageSize} onPage={p.onPage} />
    </div>
  );
}
