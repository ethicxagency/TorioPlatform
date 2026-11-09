'use client';

import { ChannelIcon, channelKind } from '@/components/channel-icon';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  CalendarArrowDown,
  CalendarArrowUp,
  CircleDollarSign,
  Columns3,
  List,
  Search,
  SlidersHorizontal,
  Activity,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import { FilterMenu, type FilterMenuOption } from '@/features/inbox/components/filter-menu';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { initialsOf } from '@/features/inbox/format';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useKeepInView } from '@/features/inbox/use-keep-in-view';
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

type SortKey = `${LeadSortField}-${'asc' | 'desc'}`;

// The orders the leads API supports (the table headers can also set Name Z–A or Lowest score, shown as "Custom").
const SORTS: (FilterMenuOption<SortKey> & { sort: LeadSortField; dir: 'asc' | 'desc' })[] = [
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
    key: 'lastActivityAt-desc',
    label: 'Recent activity',
    short: 'Activity',
    sort: 'lastActivityAt',
    dir: 'desc',
    hint: 'Latest conversation or update first',
    icon: <Activity size={15} aria-hidden />,
  },
  {
    key: 'score-desc',
    label: 'Highest score',
    short: 'Score',
    sort: 'score',
    dir: 'desc',
    icon: <ArrowDownWideNarrow size={15} aria-hidden />,
  },
  {
    key: 'dealValue-desc',
    label: 'Highest deal value',
    short: 'Value',
    sort: 'dealValue',
    dir: 'desc',
    icon: <CircleDollarSign size={15} aria-hidden />,
  },
  {
    key: 'name-asc',
    label: 'Name A–Z',
    short: 'Name',
    sort: 'name',
    dir: 'asc',
    icon: <ArrowDownAZ size={15} aria-hidden />,
  },
];

const ICON_BTN =
  'relative flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

const selectCls =
  'h-9 w-full rounded-[var(--radius-control)] border border-line bg-white px-2 text-[13px] text-ink';
const chip =
  'inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover';

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function LeadsToolbar(p: Props) {
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
  const sortKey = `${p.sort}-${p.dir}` as SortKey;
  const sortOptions = SORTS.some((x) => x.key === sortKey)
    ? SORTS
    : [
        ...SORTS,
        {
          key: sortKey,
          label: 'Custom sort',
          icon: <SlidersHorizontal size={15} aria-hidden />,
          sort: p.sort,
          dir: p.dir,
        },
      ];
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
      <div className="@container">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[200px] flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 motion-reduce:transition-none">
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
                aria-label="Lead filters"
                className="absolute left-0 top-11 z-[45] flex w-[min(340px,calc(100vw-32px))] animate-panel-in flex-col gap-3.5 rounded-xl border border-line bg-white p-3.5 shadow-popover max-sm:max-h-[72vh] max-sm:overflow-y-auto"
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
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-1.5 font-label text-muted">Status</legend>
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
                  <legend className="mb-1.5 font-label text-muted">Source</legend>
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
                          {channelKind(s.key) ? (
                            <ChannelIcon channel={s.key} size={13} decorative />
                          ) : (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: s.color }}
                            />
                          )}
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <SearchSelect
                  label="Owner"
                  anyLabel="Any owner"
                  searchPlaceholder="Search owners"
                  emptyText="No team members."
                  options={[
                    { value: 'unassigned', label: 'Unassigned' },
                    ...p.owners.map((o) => ({
                      value: o.id,
                      label: o.name,
                      lead: (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
                          {initialsOf(o.name)}
                        </span>
                      ),
                    })),
                  ]}
                  value={f.owner}
                  onChange={(owner) => p.onFilters({ owner })}
                />
                <SearchSelect
                  label="Tag"
                  anyLabel="Any tag"
                  searchPlaceholder="Search tags"
                  emptyText="No lead tags yet."
                  options={p.tags.map((t) => ({ value: t, label: t }))}
                  value={f.tag}
                  onChange={(tag) => p.onFilters({ tag })}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1.5 font-label text-muted">
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
                  <label className="flex flex-col gap-1.5 font-label text-muted">
                    Lead score
                    <select
                      value={f.minScore}
                      onChange={(e) =>
                        p.onFilters({ minScore: e.target.value as LeadFilters['minScore'] })
                      }
                      className={selectCls}
                    >
                      <option value="">Any score</option>
                      <option value="40">Medium+ (40+)</option>
                      <option value="70">High (70+)</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          <FilterMenu
            label="Sort"
            options={sortOptions}
            value={sortKey}
            defaultValue="createdAt-desc"
            onChange={(key) => {
              const o = sortOptions.find((x) => x.key === key)!;
              p.onSort(o.sort, o.dir);
            }}
            className="w-[148px] shrink-0 @min-[640px]:w-[172px]"
          />

          <div
            role="radiogroup"
            aria-label="View"
            className="ml-auto flex gap-0.5 rounded-[var(--radius-control)] bg-wash-2 p-[3px]"
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
                aria-label={label}
                title={label}
                onClick={() => p.onView(k)}
                className={cn(
                  'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors duration-150 motion-reduce:transition-none',
                  p.view === k
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon size={14} aria-hidden />
                <span className="max-[480px]:hidden">{label}</span>
              </button>
            ))}
          </div>
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
