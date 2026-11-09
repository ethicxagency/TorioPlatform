'use client';

import { ChannelIcon, channelKind } from '@/components/channel-icon';
import {
  ArrowDownAZ,
  ArrowDownZA,
  CalendarArrowDown,
  CalendarArrowUp,
  Search,
  SlidersHorizontal,
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

const selectCls =
  'h-9 w-full rounded-[var(--radius-control)] border border-line bg-white px-2 text-[13px] text-ink';
const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

type SortKey = `${CustomerSort}-${'asc' | 'desc'}`;

// The orders the customers API supports (CUSTOMER_SORT_FIELDS): created date and name.
const SORTS: (FilterMenuOption<SortKey> & { sort: CustomerSort; dir: 'asc' | 'desc' })[] = [
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
    key: 'name-asc',
    label: 'Name A–Z',
    short: 'A–Z',
    sort: 'name',
    dir: 'asc',
    icon: <ArrowDownAZ size={15} aria-hidden />,
  },
  {
    key: 'name-desc',
    label: 'Name Z–A',
    short: 'Z–A',
    sort: 'name',
    dir: 'desc',
    icon: <ArrowDownZA size={15} aria-hidden />,
  },
];

const ICON_BTN =
  'relative flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

export function CustomersToolbar(p: Props) {
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
      <div className="@container">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[200px] flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 motion-reduce:transition-none">
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
                aria-label="Customer filters"
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
                <label className="flex flex-col gap-1.5 font-label text-muted">
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
                  emptyText="No customer tags yet."
                  options={p.tags.map((t) => ({ value: t, label: t }))}
                  value={f.tag}
                  onChange={(tag) => p.onFilters({ tag })}
                />
                <label className="flex flex-col gap-1.5 font-label text-muted">
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
