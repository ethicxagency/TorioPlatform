'use client';

import { Columns3, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { DATE_RANGES, SOURCES, STAGES } from '../constants';
import { activeFilterCount, type DateRange, type LeadFilters, type LeadSortField } from '../types';

export type View = 'list' | 'pipeline';

interface Props {
  filters: LeadFilters;
  search: string;
  sort: LeadSortField;
  dir: 'asc' | 'desc';
  view: View;
  owners: { id: string; name: string }[];
  tags: string[];
  onSearch: (q: string) => void;
  onFilters: (patch: Partial<LeadFilters>) => void;
  onClear: () => void;
  onSort: (sort: LeadSortField, dir: 'asc' | 'desc') => void;
  onView: (v: View) => void;
}

const SORTS: { key: string; label: string; sort: LeadSortField; dir: 'asc' | 'desc' }[] = [
  { key: 'createdAt-desc', label: 'Newest first', sort: 'createdAt', dir: 'desc' },
  { key: 'createdAt-asc', label: 'Oldest first', sort: 'createdAt', dir: 'asc' },
  { key: 'lastActivityAt-desc', label: 'Recent activity', sort: 'lastActivityAt', dir: 'desc' },
  { key: 'score-desc', label: 'Highest score', sort: 'score', dir: 'desc' },
  { key: 'dealValue-desc', label: 'Highest deal value', sort: 'dealValue', dir: 'desc' },
  { key: 'name-asc', label: 'Name A–Z', sort: 'name', dir: 'asc' },
];

const selectCls = 'h-8 w-full rounded-lg border border-line bg-white px-2 text-[13px] text-ink';
const chip =
  'inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover';

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function LeadsToolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const n = activeFilterCount(p.filters);
  const f = p.filters;
  const chips = [
    ...f.stages.map((s) => ({
      label: STAGES.find((x) => x.key === s)!.label,
      clear: () => p.onFilters({ stages: f.stages.filter((x) => x !== s) }),
    })),
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
    f.minScore && { label: `Score ≥ ${f.minScore}`, clear: () => p.onFilters({ minScore: '' }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[360px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search leads"
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
              'relative flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-medium',
              open || n ? 'bg-primary-soft text-primary-hover' : 'bg-white text-ink hover:bg-wash',
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
              aria-label="Lead filters"
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              className="absolute left-0 top-11 z-30 flex max-h-[70vh] w-[min(320px,calc(100vw-32px))] animate-panel-in flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-white/95 p-3.5 shadow-popover backdrop-blur-[20px]"
            >
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1.5 text-[11.5px] text-faint">Status</legend>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map((s) => {
                    const on = f.stages.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => p.onFilters({ stages: toggle(f.stages, s.key) })}
                        className={cn(
                          'h-7 cursor-pointer rounded-full border px-2.5 text-xs',
                          on
                            ? 'border-[rgba(91,92,226,0.3)] bg-primary-soft font-semibold text-primary-hover'
                            : 'border-line bg-white text-muted hover:bg-wash',
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
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
                Created
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
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Lead score
                <select
                  value={f.minScore}
                  onChange={(e) =>
                    p.onFilters({ minScore: e.target.value as LeadFilters['minScore'] })
                  }
                  className={selectCls}
                >
                  <option value="">Any score</option>
                  <option value="40">Medium or higher (40+)</option>
                  <option value="70">High (70+)</option>
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

        <label className="flex items-center gap-1.5 text-[13px] text-muted max-md:hidden">
          <span className="sr-only">Sort leads</span>
          <select
            aria-label="Sort leads"
            value={`${p.sort}-${p.dir}`}
            onChange={(e) => {
              const s = SORTS.find((x) => x.key === e.target.value)!;
              p.onSort(s.sort, s.dir);
            }}
            className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] text-ink"
          >
            {!SORTS.some((s) => s.key === `${p.sort}-${p.dir}`) && (
              <option value={`${p.sort}-${p.dir}`}>Custom sort</option>
            )}
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div
          role="radiogroup"
          aria-label="View"
          className="ml-auto flex gap-0.5 rounded-[10px] bg-wash-2 p-[3px]"
        >
          {(
            [
              ['list', 'List', List],
              ['pipeline', 'Pipeline', Columns3],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={p.view === k}
              onClick={() => p.onView(k)}
              className={cn(
                'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium',
                p.view === k
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                  : 'text-muted',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <span key={c.label} className={chip}>
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
