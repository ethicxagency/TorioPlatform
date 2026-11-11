'use client';

import { ArrowDown, ArrowUp, Check, MessageSquare, Pencil, Trash2, UserRound } from 'lucide-react';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { ActionMenu } from '@/components/ui/menu';
import { Pagination } from '@/components/ui/pagination';
import { TableEmpty, TableError, TableLoading } from '@/components/ui/table-states';
import { cn } from '@/lib/utils';
import { DEFAULT_CURRENCY, formatCurrencyMajor } from '@torio/contracts';
import type { Lead, LeadSortField } from '../types';
import { ScoreIndicator, SourceBadge, StageBadge } from './badges';
import { fmtDate } from '@/lib/datetime';

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

const money = (n: number) => formatCurrencyMajor(n, DEFAULT_CURRENCY);

/** Up to two tags, then a +N count; renders nothing when the lead has none. */
function TagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {tags.slice(0, 2).map((t) => (
        <span
          key={t}
          className="inline-flex h-[18px] max-w-[110px] items-center truncate rounded-full bg-wash-2 px-2 text-[11px] leading-none text-muted"
        >
          {t}
        </span>
      ))}
      {tags.length > 2 && (
        <span title={tags.slice(2).join(', ')} className="text-[11px] text-faint">
          +{tags.length - 2}
        </span>
      )}
    </span>
  );
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
  return (
    <ActionMenu
      label={`Actions for ${l.name}`}
      width={200}
      items={[
        { label: 'View details', icon: UserRound, onSelect: () => p.onOpen(l) },
        p.canWrite && { label: 'Edit', icon: Pencil, onSelect: () => p.onEdit(l) },
        !!l.conversationId && {
          label: 'Open conversation',
          icon: MessageSquare,
          onSelect: () => p.onOpenConversation(l),
        },
        p.canDelete && {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: () => p.onDelete(l),
        },
      ]}
    />
  );
}

export function LeadsTable(p: Props) {
  const allOnPage = p.leads.length > 0 && p.leads.every((l) => p.selected.has(l.id));

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
    return <TableError noun="leads" message={p.errorMessage} onRetry={p.onRetry} />;
  if (p.state === 'loading') return <TableLoading noun="leads" avatar={true} />;
  if (p.leads.length === 0)
    return (
      <TableEmpty
        noun="leads"
        filtered={p.filtered}
        hint="Add your first lead, or import a CSV to get started."
        maxWidth={320}
        onClearFilters={p.onClearFilters}
        action={p.canWrite ? { label: 'Add lead', onClick: p.onAdd } : null}
      />
    );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-line bg-white transition-opacity',
        p.fetching && 'opacity-80',
      )}
    >
      {/* Table from md up */}
      <div className="max-h-[max(360px,calc(100vh-300px))] overflow-auto max-md:hidden">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[#FBFBFC] shadow-[0_1px_0_var(--color-line-subtle)]">
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
              {sortHead('Value', 'dealValue', 'max-xl:hidden')}
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
                  'transition-colors duration-150 motion-reduce:transition-none',
                  p.selected.has(l.id) || p.activeId === l.id ? 'bg-primary-soft' : 'hover:bg-wash',
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
                      <span className="mt-1 block max-xl:hidden">
                        <TagPills tags={l.tags} />
                      </span>
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
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums max-xl:hidden">
                  {l.dealValue != null ? money(l.dealValue) : <span className="text-faint">—</span>}
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
                  {fmtDate(l.createdAt, {
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
                {l.dealValue != null && (
                  <span className="text-xs font-medium tabular-nums text-ink-secondary">
                    {money(l.dealValue)}
                  </span>
                )}
                <TagPills tags={l.tags} />
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

      <Pagination page={p.page} total={p.total} pageSize={p.pageSize} onPage={p.onPage} />
    </div>
  );
}
