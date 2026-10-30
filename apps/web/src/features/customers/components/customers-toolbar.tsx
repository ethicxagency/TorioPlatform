'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { DATE_RANGES, SOURCES } from '@/features/leads/constants';
import { SEGMENTS, STATUSES, UNAVAILABLE_SEGMENTS } from '../constants';
import {
  activeCustomerFilterCount,
  type CustomerFilters,
  type CustomerSort,
  type DateRange,
  type Segment,
} from '../types';

interface Props {
  filters: CustomerFilters;
  search: string;
  sort: CustomerSort;
  dir: 'asc' | 'desc';
  owners: { id: string; name: string }[];
  tags: string[];
  onSearch: (q: string) => void;
  onFilters: (p: Partial<CustomerFilters>) => void;
  onClear: () => void;
  onSort: (s: CustomerSort, d: 'asc' | 'desc') => void;
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
  { key: 'name-asc', label: 'Name A–Z', sort: 'name' as const, dir: 'asc' as const },
  { key: 'name-desc', label: 'Name Z–A', sort: 'name' as const, dir: 'desc' as const },
];

export function CustomersToolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const f = p.filters;
  const n = activeCustomerFilterCount(f);
  const chips = [
    f.status && {
      label: STATUSES.find((s) => s.key === f.status)!.label,
      clear: () => p.onFilters({ status: '' }),
    },
    ...f.sources.map((s) => ({
      label: SOURCES.find((x) => x.key === s)!.label,
      clear: () => p.onFilters({ sources: f.sources.filter((x) => x !== s) }),
    })),
    f.owner && {
      label:
        f.owner === 'unassigned'
          ? 'Unassigned'
          : (p.owners.find((o) => o.id === f.owner)?.name ?? 'Owner'),
      clear: () => p.onFilters({ owner: '' }),
    },
    f.tag && { label: `#${f.tag}`, clear: () => p.onFilters({ tag: '' }) },
    f.range && {
      label: DATE_RANGES.find((r) => r.key === f.range)!.label,
      clear: () => p.onFilters({ range: '' }),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Segments" className="flex flex-wrap gap-1.5">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={f.segment === s.key}
            title={s.rule}
            onClick={() => p.onFilters({ segment: s.key as Segment })}
            className={cn(
              'h-7 cursor-pointer rounded-full border px-3 text-[12.5px]',
              f.segment === s.key
                ? 'border-[rgba(91,92,226,0.25)] bg-primary-soft font-semibold text-primary-hover'
                : 'border-line bg-white text-muted hover:bg-wash',
            )}
          >
            {s.label}
          </button>
        ))}
        {UNAVAILABLE_SEGMENTS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled
            title={s.reason}
            className="h-7 cursor-not-allowed rounded-full border border-dashed border-line px-3 text-[12.5px] text-faint"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[360px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search customers"
            placeholder="Search name, email, phone or company"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
          {p.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => p.onSearch('')}
              className="cursor-pointer text-faint"
            >
              <X size={14} />
            </button>
          )}
        </label>
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
              aria-label="Customer filters"
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              className="absolute left-0 top-11 z-30 flex max-h-[70vh] w-[min(320px,calc(100vw-32px))] animate-panel-in flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-white/95 p-3.5 shadow-popover backdrop-blur-[20px]"
            >
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Status
                <select
                  value={f.status}
                  onChange={(e) =>
                    p.onFilters({ status: e.target.value as CustomerFilters['status'] })
                  }
                  className={selectCls}
                >
                  <option value="">Any status</option>
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1.5 text-[11.5px] text-faint">Source</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map((s) => {
                    const on = f.sources.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => p.onFilters({ sources: toggle(f.sources, s.key) })}
                        className={cn(
                          'flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs',
                          on
                            ? 'border-[rgba(91,92,226,0.3)] bg-primary-soft font-semibold text-primary-hover'
                            : 'border-line bg-white text-muted hover:bg-wash',
                        )}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: s.color }}
                        />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Owner
                <select
                  value={f.owner}
                  onChange={(e) => p.onFilters({ owner: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any owner</option>
                  <option value="unassigned">Unassigned</option>
                  {p.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Tag
                <select
                  value={f.tag}
                  onChange={(e) => p.onFilters({ tag: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any tag</option>
                  {p.tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Registered
                <select
                  value={f.range}
                  onChange={(e) => p.onFilters({ range: e.target.value as DateRange })}
                  className={selectCls}
                >
                  <option value="">Any time</option>
                  {DATE_RANGES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
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
          aria-label="Sort customers"
          value={`${p.sort}-${p.dir}`}
          onChange={(e) => {
            const s = SORTS.find((x) => x.key === e.target.value)!;
            p.onSort(s.sort, s.dir);
          }}
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] max-md:hidden"
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
