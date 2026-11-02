'use client';

import { ChannelIcon } from '@/components/channel-icon';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { VIEWS, CHANNELS } from '../constants';
import { useDismiss } from '../use-dismiss';
import {
  advancedFilterCount,
  type ConversationStatus,
  type InboxFilters,
  type Priority,
  type Provider,
} from '../types';

interface Props {
  filters: InboxFilters;
  counts: { open: number; snoozed: number; resolved: number } | undefined;
  agents: { id: string; name: string }[];
  tags: string[];
  onChange: (patch: Partial<InboxFilters>) => void;
  onClear: () => void;
  /** The Inbox navigation column is showing status, views and channels, so don't repeat them here. */
  navVisible?: boolean;
}

const TABS: { key: ConversationStatus; label: string; count: 'open' | 'snoozed' | 'resolved' }[] = [
  { key: 'OPEN', label: 'Open', count: 'open' },
  { key: 'SNOOZED', label: 'Snoozed', count: 'snoozed' },
  { key: 'RESOLVED', label: 'Resolved', count: 'resolved' },
];

const selectCls = 'h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink';

export function ConversationFilters({
  filters,
  counts,
  agents,
  tags,
  onChange,
  onClear,
  navVisible = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const advanced = advancedFilterCount(filters);
  const hasAny = advanced > 0 || !!filters.q || filters.view !== 'all' || !!filters.channel;
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

  const chipCls = (on: boolean) =>
    cn(
      'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border text-[12.5px]',
      on
        ? 'border-[rgba(91,92,226,0.18)] bg-primary-soft font-semibold text-primary-hover'
        : 'border-transparent font-medium text-muted hover:bg-wash-2',
    );

  return (
    <div className="flex flex-col gap-2.5 pb-2.5">
      {!navVisible && (
        <div
          role="tablist"
          aria-label="Conversation status"
          className="mx-3 flex gap-0.5 rounded-[10px] bg-wash-2 p-[3px]"
        >
          {TABS.map((t) => {
            const on = filters.status === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => onChange({ status: t.key })}
                className={cn(
                  'flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] text-[13px]',
                  on
                    ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08),0_0_0_1px_rgba(0,55,112,0.05)]'
                    : 'font-medium text-muted',
                )}
              >
                {t.label}
                {counts && (
                  <span className={cn('text-xs tabular-nums', on ? 'text-faint' : 'text-faint')}>
                    {counts[t.count]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!navVisible && (
        <div
          role="group"
          aria-label="Views"
          className="flex flex-wrap items-center justify-between gap-1 px-3 pb-0.5"
        >
          <span className="flex flex-wrap gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={filters.view === v.key}
                onClick={() => onChange({ view: v.key })}
                className={cn(chipCls(filters.view === v.key), 'px-2.5')}
              >
                {v.label}
              </button>
            ))}
          </span>
          {/* Channels combine with any view; icon-only (official logos read faster), named by label/tooltip.
              One unit, so on a narrow list the whole group moves down a line together. */}
          <span className="flex gap-1">
            {(Object.keys(CHANNELS) as Provider[]).map((ch) => {
              const on = filters.channel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  aria-pressed={on}
                  aria-label={CHANNELS[ch].label}
                  title={CHANNELS[ch].label}
                  onClick={() => onChange({ channel: on ? '' : ch })}
                  className={cn(chipCls(on), 'w-8 justify-center px-0')}
                >
                  <ChannelIcon channel={ch} size={16} decorative />
                </button>
              );
            })}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 px-3">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
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
        <select
          aria-label="Sort conversations"
          value={filters.order}
          onChange={(e) => onChange({ order: e.target.value as InboxFilters['order'] })}
          className={cn(selectCls, 'h-9 w-[124px] shrink-0')}
        >
          <option value="waiting">Longest wait</option>
          <option value="newest">Newest</option>
          <option value="priority">Priority</option>
        </select>
        <div ref={ref} className="relative">
          <button
            type="button"
            aria-label="Filters"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-line',
              open || advanced ? 'bg-primary-soft text-primary-hover' : 'bg-white text-muted',
            )}
          >
            <SlidersHorizontal size={15} />
            {advanced > 0 && (
              <span className="absolute -right-[5px] -top-[5px] flex h-4 min-w-4 items-center justify-center rounded-lg bg-primary text-[10px] font-semibold text-white">
                {advanced}
              </span>
            )}
          </button>
          {open && (
            <div
              role="dialog"
              aria-label="Advanced filters"
              className="absolute right-0 top-11 z-20 flex w-[260px] animate-panel-in flex-col gap-2.5 rounded-xl border border-line bg-white/95 p-3 shadow-popover backdrop-blur-[20px]"
            >
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Assigned agent
                <select
                  value={filters.assigneeId}
                  onChange={(e) => onChange({ assigneeId: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Tag
                <select
                  value={filters.tag}
                  onChange={(e) => onChange({ tag: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any tag</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                Priority
                <select
                  value={filters.priority}
                  onChange={(e) => onChange({ priority: e.target.value as '' | Priority })}
                  className={selectCls}
                >
                  <option value="">Any priority</option>
                  <option value="HIGH">Urgent</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </label>
            </div>
          )}
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
