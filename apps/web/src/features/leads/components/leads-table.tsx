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
import { cn } from '@/lib/utils';
import type { Lead, LeadSortField } from '../types';
import { ScoreIndicator, SourceBadge, StageBadge } from './badges';

interface Props {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  state: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  fetching: boolean;
  filtered: boolean;
  selected: Set<string>;
  activeId: string | null;
  sort: LeadSortField;
  dir: 'asc' | 'desc';
  canWrite: boolean;
  canDelete: boolean;
  now: number;
  onSort: (f: LeadSortField) => void;
  onPage: (p: number) => void;
  onOpen: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onDelete: (l: Lead) => void;
  onOpenConversation: (l: Lead) => void;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onAdd: () => void;
}

const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-muted whitespace-nowrap';

function Check_({
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

function RowMenu({ l, p }: { l: Lead; p: Props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const item =
    'flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13px] hover:bg-wash';
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${l.name}`}
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
          className="absolute right-0 top-9 z-20 w-[190px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover"
        >
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              p.onOpen(l);
            }}
          >
            <UserRound size={14} className="text-muted" />
            View details
          </button>
          {p.canWrite && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                p.onEdit(l);
              }}
            >
              <Pencil size={14} className="text-muted" />
              Edit
            </button>
          )}
          {l.conversationId && (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                p.onOpenConversation(l);
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
                p.onDelete(l);
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

export function LeadsTable(p: Props) {
  const allOnPage = p.leads.length > 0 && p.leads.every((l) => p.selected.has(l.id));
  const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.total, p.page * p.pageSize);
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));

  const sortHead = (label: string, field: LeadSortField, cls = '') => (
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
        <div className="text-sm font-semibold">Couldn&apos;t load leads</div>
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
        aria-label="Loading leads"
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

  if (p.leads.length === 0)
    return (
      <div className="rounded-card border border-line bg-white px-6 py-14 text-center">
        <div className="text-[14.5px] font-semibold">
          {p.filtered ? 'No leads match your filters' : 'No leads yet'}
        </div>
        <div className="mx-auto mb-3.5 mt-1 max-w-[320px] text-[13px] text-muted">
          {p.filtered
            ? 'Try a different search or clear your filters.'
            : 'Add your first lead, or import a CSV to get started.'}
        </div>
        {p.filtered ? (
          <Button variant="outline" size="sm" onClick={p.onClearFilters}>
            Clear filters
          </Button>
        ) : (
          p.canWrite && (
            <Button size="sm" onClick={p.onAdd}>
              Add lead
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
      {/* Table from md up */}
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="border-b border-line-subtle bg-[#FBFBFC]">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <Check_
                  checked={allOnPage}
                  label="Select all leads on this page"
                  onChange={p.onTogglePage}
                />
              </th>
              {sortHead('Lead', 'name')}
              <th scope="col" className={cn(th, 'max-lg:hidden')}>
                Contact
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              {sortHead('Score', 'score', 'max-lg:hidden')}
              <th scope="col" className={cn(th, 'max-xl:hidden')}>
                Source
              </th>
              <th scope="col" className={cn(th, 'max-lg:hidden')}>
                Owner
              </th>
              {sortHead('Last activity', 'lastActivityAt', 'max-xl:hidden')}
              {sortHead('Created', 'createdAt', 'max-2xl:hidden')}
              <th scope="col" className="w-10 px-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.leads.map((l) => (
              <tr
                key={l.id}
                tabIndex={0}
                aria-selected={p.activeId === l.id}
                onClick={() => p.onOpen(l)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) p.onOpen(l);
                }}
                className={cn(
                  'cursor-pointer border-b border-line-subtle last:border-0 focus-visible:outline-offset-[-2px]',
                  p.selected.has(l.id)
                    ? 'bg-primary-soft'
                    : p.activeId === l.id
                      ? 'bg-[#F1F1FF]'
                      : 'hover:bg-[#F7F7F9]',
                )}
              >
                <td className="w-10 px-3 py-2.5">
                  <Check_
                    checked={p.selected.has(l.id)}
                    label={`Select ${l.name}`}
                    onChange={() => p.onToggle(l.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                      {initialsOf(l.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{l.name}</span>
                      <span className="block truncate text-xs text-faint">{l.company ?? '—'}</span>
                    </span>
                  </div>
                </td>
                <td className="max-w-[200px] px-3 py-2.5 max-lg:hidden">
                  <span className="block truncate">{l.email ?? '—'}</span>
                  <span className="block truncate text-xs text-faint">{l.phone ?? ''}</span>
                </td>
                <td className="px-3 py-2.5">
                  <StageBadge stage={l.stage} />
                </td>
                <td className="px-3 py-2.5 max-lg:hidden">
                  <ScoreIndicator score={l.score} />
                </td>
                <td className="px-3 py-2.5 max-xl:hidden">
                  <SourceBadge source={l.source} />
                </td>
                <td className="px-3 py-2.5 max-lg:hidden">
                  {l.owner ? (
                    <span className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
                        {initialsOf(l.owner.name)}
                      </span>
                      {l.owner.name}
                    </span>
                  ) : (
                    <span className="text-faint">Unassigned</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted max-xl:hidden">
                  {fmtAgo(l.lastActivityAt, p.now)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted max-2xl:hidden">
                  {new Date(l.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="w-10 px-2">
                  <RowMenu l={l} p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards below md */}
      <ul className="m-0 list-none p-0 md:hidden">
        {p.leads.map((l) => (
          <li
            key={l.id}
            className={cn(
              'flex items-start gap-3 border-b border-line-subtle px-3 py-3 last:border-0',
              p.selected.has(l.id) && 'bg-primary-soft',
            )}
          >
            <Check_
              checked={p.selected.has(l.id)}
              label={`Select ${l.name}`}
              onChange={() => p.onToggle(l.id)}
            />
            <button
              type="button"
              onClick={() => p.onOpen(l)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{l.name}</span>
                <StageBadge stage={l.stage} className="shrink-0" />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[l.company, l.email ?? l.phone].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <ScoreIndicator score={l.score} showLabel={false} />
                <SourceBadge source={l.source} />
                <span className="text-xs text-faint">
                  {l.owner?.name ?? 'Unassigned'} · {fmtAgo(l.lastActivityAt, p.now)}
                </span>
              </span>
            </button>
            <RowMenu l={l} p={p} />
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
