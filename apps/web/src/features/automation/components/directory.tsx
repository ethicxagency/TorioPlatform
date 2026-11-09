'use client';

import {
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Search,
  Trash2,
  Workflow,
  X,
  Zap,
  ArrowUpDown,
} from 'lucide-react';
import { triggerOf, TRIGGERS } from '@torio/contracts';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FilterMenu } from '@/features/inbox/components/filter-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtAgo } from '@/features/inbox/format';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { cn } from '@/lib/utils';
import type { AutomationItem, DirectoryFilters } from '../types';
import { StatusBadge } from './bits';

interface Props {
  items: AutomationItem[];
  state: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  filters: DirectoryFilters;
  filtered: boolean;
  total: number;
  page: number;
  pageSize: number;
  canWrite: boolean;
  canActivate: boolean;
  busyId: string | null;
  onFilters: (p: Partial<DirectoryFilters>) => void;
  onPage: (p: number) => void;
  onToggle: (a: AutomationItem) => void;
  onDuplicate: (a: AutomationItem) => void;
  onRename: (a: AutomationItem) => void;
  onDelete: (a: AutomationItem) => void;
  onHistory: (a: AutomationItem) => void;
  onRetry: () => void;
  onCreate: () => void;
  onExplore: () => void;
}

const SORTS = [
  { key: 'updatedAt-desc', label: 'Recently updated' },
  { key: 'name-asc', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
  { key: 'lastRun-desc', label: 'Last run' },
];

function RowMenu({ a, p }: { a: AutomationItem; p: Props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const item =
    'flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13px] no-underline hover:bg-wash hover:no-underline disabled:cursor-not-allowed disabled:opacity-50';
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${a.name}`}
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
          <Link role="menuitem" href={`/automation/${a.id}`} className={item}>
            <Workflow size={14} className="text-muted" />
            Open editor
          </Link>
          {p.canActivate && (
            <button
              role="menuitem"
              type="button"
              className={item}
              disabled={p.busyId === a.id}
              onClick={run(() => p.onToggle(a))}
            >
              {a.status === 'ACTIVE' ? (
                <Pause size={14} className="text-muted" />
              ) : (
                <Play size={14} className="text-muted" />
              )}
              {a.status === 'ACTIVE' ? 'Disable' : 'Enable'}
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={run(() => p.onHistory(a))}
          >
            <History size={14} className="text-muted" />
            Run history
          </button>
          {p.canWrite && (
            <>
              <button
                role="menuitem"
                type="button"
                className={item}
                onClick={run(() => p.onRename(a))}
              >
                <Pencil size={14} className="text-muted" />
                Rename
              </button>
              <button
                role="menuitem"
                type="button"
                className={item}
                onClick={run(() => p.onDuplicate(a))}
              >
                <Copy size={14} className="text-muted" />
                Duplicate
              </button>
            </>
          )}
          {p.canActivate && (
            <button
              role="menuitem"
              type="button"
              className={cn(item, 'text-danger')}
              disabled={a.status === 'ACTIVE'}
              title={a.status === 'ACTIVE' ? 'Disable it before deleting' : undefined}
              onClick={run(() => p.onDelete(a))}
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

export function Directory(p: Props) {
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-3 focus-within:border-primary sm:max-w-[360px]">
          <Search size={15} className="text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search automations"
            placeholder="Search automations by name..."
            value={p.filters.q}
            onChange={(e) => p.onFilters({ q: e.target.value })}
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] outline-none"
          />
          {p.filters.q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => p.onFilters({ q: '' })}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <FilterMenu
          label="Trigger"
          value={p.filters.trigger || 'any'}
          defaultValue="any"
          onChange={(k) => p.onFilters({ trigger: k === 'any' ? '' : k })}
          options={[
            { key: 'any', label: 'Any trigger', icon: <Zap size={14} /> },
            ...TRIGGERS.map((t) => ({ key: t.type, label: t.label, icon: <Zap size={14} /> })),
          ]}
        />
        <FilterMenu
          label="Sort automations"
          value={`${p.filters.sort}-${p.filters.dir}`}
          defaultValue="updatedAt-desc"
          onChange={(k) => {
            const [sort, dir] = k.split('-') as [DirectoryFilters['sort'], 'asc' | 'desc'];
            p.onFilters({ sort, dir });
          }}
          options={SORTS.map((o) => ({ ...o, icon: <ArrowUpDown size={14} /> }))}
        />
      </div>

      {p.state === 'error' && (
        <div
          role="alert"
          className="rounded-card border border-line bg-white px-6 py-12 text-center"
        >
          <div className="text-sm font-semibold">Couldn&apos;t load automations</div>
          <div className="mb-3 mt-1 text-[13px] text-muted">{p.errorMessage}</div>
          <Button variant="outline" size="sm" onClick={p.onRetry}>
            Try again
          </Button>
        </div>
      )}
      {p.state === 'loading' && (
        <div
          className="overflow-hidden rounded-card border border-line bg-white"
          aria-busy="true"
          aria-label="Loading automations"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-line-subtle px-4 py-4 last:border-0"
            >
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-3.5 w-1/5 bg-wash-2" />
              <Skeleton className="ml-auto h-5 w-16" />
            </div>
          ))}
        </div>
      )}
      {p.state === 'ready' && p.items.length === 0 && (
        <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
          <span
            aria-hidden
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"
          >
            <Workflow size={18} />
          </span>
          <div className="text-[14.5px] font-semibold">
            {p.filtered ? 'No automations match your filters' : 'No automations yet'}
          </div>
          <div className="mx-auto mb-4 mt-1 max-w-[380px] text-[13px] text-muted">
            {p.filtered
              ? 'Try a different search or clear the filters.'
              : 'Start from a template or build your own workflow. Nothing runs until you activate it.'}
          </div>
          {!p.filtered && (
            <div className="flex flex-wrap justify-center gap-2">
              {p.canWrite && <Button onClick={p.onCreate}>Create automation</Button>}
              <Button variant="outline" onClick={p.onExplore}>
                Explore templates
              </Button>
            </div>
          )}
        </div>
      )}
      {p.state === 'ready' && p.items.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <ul className="m-0 list-none p-0">
            {p.items.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-0 hover:bg-[#F7F7F9]"
              >
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/automation/${a.id}`}
                    className="block truncate text-[13.5px] font-semibold text-ink no-underline hover:text-primary hover:no-underline"
                  >
                    {a.name}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {a.description || triggerOf(a.triggerType)?.description || 'No description'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
                    <span>When: {triggerOf(a.triggerType)?.label ?? a.triggerType}</span>
                    <span>
                      {a.stepCount} step{a.stepCount === 1 ? '' : 's'}
                    </span>
                    <span>{a.lastRunAt ? `Last run ${fmtAgo(a.lastRunAt)}` : 'Never run'}</span>
                    <span>
                      {a.runs} run{a.runs === 1 ? '' : 's'} (30 days)
                      {a.failed > 0 && (
                        <span className="font-medium text-danger"> · {a.failed} failed</span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={a.status} />
                  {a.hasUnpublishedChanges && (
                    <span className="text-[11px] text-warning">Unpublished changes</span>
                  )}
                </span>
                <RowMenu a={a} p={p} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted">
            <span aria-live="polite">{p.total} automations</span>
            <span className="flex items-center gap-2">
              Page {p.page} of {pages}
              <Button
                size="sm"
                variant="outline"
                disabled={p.page <= 1}
                onClick={() => p.onPage(p.page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={p.page >= pages}
                onClick={() => p.onPage(p.page + 1)}
              >
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
