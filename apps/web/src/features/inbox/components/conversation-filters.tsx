'use client';

import {
  AlarmClock,
  ArrowDownNarrowWide,
  CheckCircle2,
  Flag,
  Clock,
  Inbox,
  ListChecks,
  Mail,
  MessageCircle,
  Search,
  SlidersHorizontal,
  User,
  UserX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import { initialsOf } from '../format';
import { useDismiss } from '../use-dismiss';
import { useAnchoredPopover } from '../use-anchored-popover';
import { FilterMenu, type FilterMenuOption } from './filter-menu';
import { SearchSelect } from './search-select';
import {
  advancedFilterCount,
  type ConversationStatus,
  type InboxFilters,
  type ListView,
  type Priority,
} from '../types';

interface Props {
  filters: InboxFilters;
  counts: { open: number; snoozed: number; resolved: number } | undefined;
  agents: { id: string; name: string }[];
  agentsLoading: boolean;
  tags: string[];
  tagsLoading: boolean;
  onChange: (patch: Partial<InboxFilters>) => void;
  onClear: () => void;
  /** Manage (bulk selection) mode; the button is hidden without conversations:manage. */
  canManage: boolean;
  managing: boolean;
  onManage: () => void;
}

const VIEW_OPTIONS: FilterMenuOption<ListView>[] = [
  { key: 'all', label: 'All conversations', short: 'All', icon: <Inbox size={15} aria-hidden /> },
  { key: 'unread', label: 'Unread', icon: <Mail size={15} aria-hidden />, dot: true },
  { key: 'mine', label: 'Assigned to me', short: 'Mine', icon: <User size={15} aria-hidden /> },
  { key: 'unassigned', label: 'Unassigned', icon: <UserX size={15} aria-hidden /> },
];

const STATUS_OPTIONS: FilterMenuOption<ConversationStatus>[] = [
  { key: 'OPEN', label: 'Open', icon: <MessageCircle size={15} aria-hidden /> },
  { key: 'SNOOZED', label: 'Snoozed', icon: <AlarmClock size={15} aria-hidden /> },
  { key: 'RESOLVED', label: 'Resolved', icon: <CheckCircle2 size={15} aria-hidden /> },
];
const COUNT_KEY = { OPEN: 'open', SNOOZED: 'snoozed', RESOLVED: 'resolved' } as const;

// Only the orders the API supports (conversationQuerySchema.order).
const SORT_OPTIONS: FilterMenuOption<InboxFilters['order']>[] = [
  {
    key: 'waiting',
    label: 'Longest wait',
    hint: 'Customers waiting longest first',
    icon: <Clock size={15} aria-hidden />,
  },
  {
    key: 'newest',
    label: 'Newest',
    hint: 'Latest message first',
    icon: <ArrowDownNarrowWide size={15} aria-hidden />,
  },
  {
    key: 'priority',
    label: 'Priority',
    hint: 'Urgent first, then longest wait',
    icon: <Flag size={15} aria-hidden />,
  },
];

const PRIORITIES: { key: '' | Priority; label: string; dot?: string }[] = [
  { key: '', label: 'All' },
  { key: 'HIGH', label: 'Urgent', dot: 'bg-[#E5484D]' },
  { key: 'NORMAL', label: 'Normal', dot: 'bg-faint' },
  { key: 'LOW', label: 'Low', dot: 'bg-line-input' },
];

const ICON_BTN =
  'relative flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';
const IDLE = 'border-line bg-white text-ink hover:border-line-input hover:bg-wash active:bg-wash-2';
const ON = 'border-[rgba(91,92,226,0.28)] bg-primary-soft text-primary-hover';

const initials = (name: string) => (
  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
    {initialsOf(name)}
  </span>
);

export function ConversationFilters({
  filters,
  counts,
  agents,
  agentsLoading,
  tags,
  tagsLoading,
  onChange,
  onClear,
  canManage,
  managing,
  onManage,
}: Props) {
  const { registerEscape } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false), panel);
  useAnchoredPopover(ref, panel, open);
  useEffect(
    () => (open ? registerEscape(() => setOpen(false)) : undefined),
    [open, registerEscape],
  );
  const advanced = advancedFilterCount(filters);
  const hasAny = advanced > 0 || !!filters.q || filters.view !== 'all';
  const removable = [
    filters.assigneeId && {
      label: agents.find((a) => a.id === filters.assigneeId)?.name ?? 'Agent',
      clear: () => onChange({ assigneeId: '' }),
    },
    filters.tag && { label: `#${filters.tag}`, clear: () => onChange({ tag: '' }) },
    filters.priority && {
      label: filters.priority === 'HIGH' ? 'Urgent' : `Priority: ${filters.priority.toLowerCase()}`,
      clear: () => onChange({ priority: '' }),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col gap-2.5 pb-2.5 pt-3">
      {/* Search, Conversations, Status, sort, Manage, Filters. One row when the list is wide; on a narrow list
          the search takes its own row and the rest share the next. */}
      <div className="@container px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex h-9 min-w-0 flex-[1_1_100%] items-center @min-[800px]:flex-[1_1_128px] gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
            <Search size={15} className="shrink-0 text-faint" aria-hidden />
            <input
              type="search"
              aria-label="Search conversations"
              placeholder="Search"
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
            />
            {filters.q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onChange({ q: '' })}
                className="cursor-pointer text-faint"
              >
                <X size={14} />
              </button>
            )}
          </label>
          {/* From 520px the five controls share one row (display: contents). Narrower, they stack as two
              rows of labelled controls: the three menus, then Manage and Filters. Labels never collapse. */}
          <div className="flex w-full gap-1.5 @min-[520px]:contents">
            <FilterMenu
              label="Conversations"
              options={VIEW_OPTIONS}
              value={filters.view}
              defaultValue="all"
              onChange={(view) => onChange({ view })}
              className="flex-auto @min-[800px]:w-[176px] @min-[800px]:flex-none"
            />
            <FilterMenu
              label="Status"
              options={STATUS_OPTIONS.map((o) => ({ ...o, count: counts?.[COUNT_KEY[o.key]] }))}
              value={filters.status}
              defaultValue="OPEN"
              onChange={(status) => onChange({ status })}
              className="flex-auto @min-[800px]:w-[144px] @min-[800px]:flex-none"
            />
            <FilterMenu
              label="Sort"
              options={SORT_OPTIONS}
              value={filters.order}
              defaultValue="waiting"
              onChange={(order) => onChange({ order })}
              className="flex-auto @min-[800px]:w-[148px] @min-[800px]:flex-none"
            />
          </div>
          <div className="flex w-full gap-1.5 @min-[520px]:contents">
            {canManage && (
              <button
                type="button"
                aria-pressed={managing}
                aria-label={managing ? 'Exit manage mode' : 'Manage conversations'}
                title={
                  managing ? 'Exit manage mode' : 'Select conversations to act on several at once'
                }
                onClick={onManage}
                className={cn(
                  ICON_BTN,
                  'flex-1 px-2.5 @min-[520px]:flex-none',
                  managing ? ON : IDLE,
                )}
              >
                <ListChecks
                  size={16}
                  aria-hidden
                  className={managing ? 'text-primary' : 'text-faint'}
                />
                Manage
              </button>
            )}
            <div ref={ref} className="relative flex-1 @min-[520px]:flex-none">
              <button
                type="button"
                aria-label={advanced ? `Filters, ${advanced} applied` : 'Filters'}
                title="Filters"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={cn(ICON_BTN, 'w-full px-2.5', open || advanced ? ON : IDLE)}
              >
                <SlidersHorizontal
                  size={16}
                  aria-hidden
                  className={open || advanced ? 'text-primary' : 'text-faint'}
                />
                Filters
                {advanced > 0 && (
                  <span
                    aria-hidden
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-white"
                  >
                    {advanced}
                  </span>
                )}
              </button>
              {open &&
                createPortal(
                  <div
                    ref={panel}
                    role="dialog"
                    aria-label="Advanced filters"
                    style={{ top: 0, left: 0 }}
                    className="fixed z-[45] flex w-[min(300px,calc(100vw-24px))] animate-panel-in flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-white p-3.5 shadow-popover"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-card-title">Filters</span>
                      {advanced > 0 && (
                        <span className="rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary-hover">
                          {advanced}
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        type="button"
                        disabled={!advanced}
                        onClick={() => onChange({ assigneeId: '', tag: '', priority: '' })}
                        className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent"
                      >
                        Clear all
                      </button>
                    </div>
                    <SearchSelect
                      label="Assigned agent"
                      anyLabel="Any agent"
                      searchPlaceholder="Search agents"
                      emptyText="No agents in this workspace."
                      loading={agentsLoading}
                      options={agents.map((a) => ({
                        value: a.id,
                        label: a.name,
                        lead: initials(a.name),
                      }))}
                      value={filters.assigneeId}
                      onChange={(assigneeId) => onChange({ assigneeId })}
                    />
                    <SearchSelect
                      label="Tag"
                      anyLabel="Any tag"
                      searchPlaceholder="Search tags"
                      emptyText="No customer tags yet."
                      loading={tagsLoading}
                      options={tags.map((t) => ({ value: t, label: t }))}
                      value={filters.tag}
                      onChange={(tag) => onChange({ tag })}
                    />
                    <div role="radiogroup" aria-label="Priority" className="flex flex-col gap-1.5">
                      <span className="font-label text-muted">Priority</span>
                      <div className="flex gap-0.5 rounded-[var(--radius-control)] bg-wash-2 p-[3px]">
                        {PRIORITIES.map((p) => {
                          const on = filters.priority === p.key;
                          return (
                            <button
                              key={p.label}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => onChange({ priority: p.key })}
                              className={cn(
                                'flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] text-[12.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none',
                                on
                                  ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08),0_0_0_1px_rgba(0,55,112,0.05)]'
                                  : 'font-medium text-muted hover:text-ink',
                              )}
                            >
                              {p.dot && (
                                <span
                                  aria-hidden
                                  className={cn('h-1.5 w-1.5 rounded-full', p.dot)}
                                />
                              )}
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="m-0 text-xs text-faint">
                      Filters apply as you choose and combine with search, status and channel.
                    </p>
                  </div>,
                  document.body,
                )}
            </div>
          </div>
        </div>
      </div>
      {(removable.length > 0 || hasAny) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3">
          {removable.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
            >
              {f.label}
              <button
                type="button"
                aria-label={`Remove filter ${f.label}`}
                onClick={f.clear}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {hasAny && (
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer text-xs font-medium text-primary"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
