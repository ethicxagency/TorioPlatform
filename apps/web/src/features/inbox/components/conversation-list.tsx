'use client';

import { Inbox, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { minutesSince } from '../format';
import type { Conversation, InboxFilters } from '../types';
import { advancedFilterCount } from '../types';
import { BulkActionsToolbar } from './bulk-actions-toolbar';
import { ConversationFilters } from './conversation-filters';
import { ConversationRow } from './conversation-row';

interface Props {
  conversations: Conversation[];
  counts: { open: number; snoozed: number; resolved: number } | undefined;
  filters: InboxFilters;
  agents: { id: string; name: string }[];
  tags: string[];
  activeId: string | null;
  selected: Set<string>;
  now: number;
  state: 'loading' | 'error' | 'ready';
  fetching: boolean;
  errorMessage?: string;
  canManage: boolean;
  bulkBusy: boolean;
  onRetry: () => void;
  onFilters: (patch: Partial<InboxFilters>) => void;
  onClearFilters: () => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulk: (action: 'ASSIGN_ME' | 'MARK_READ' | 'SNOOZE' | 'RESOLVE') => void;
}

export function ConversationList(p: Props) {
  const waiting = p.conversations.filter((c) => c.waitingSince && c.status === 'OPEN');
  const over = waiting.filter((c) => minutesSince(c.waitingSince!, p.now) >= 120).length;
  const filtered = !!p.filters.q || p.filters.view !== 'all' || advancedFilterCount(p.filters) > 0;

  return (
    <section
      aria-label="Conversations"
      className="flex h-full min-h-0 min-w-0 flex-col bg-white/70 backdrop-blur-[12px]"
    >
      <header className="flex items-baseline gap-2 px-4 pb-2.5 pt-4">
        <h1 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">Inbox</h1>
        <span className="text-[12.5px] text-muted">
          {p.counts ? `${p.counts.open} open` : ''}
          {waiting.length > 0 && ` · ${waiting.length} waiting`}
        </span>
        {over > 0 && (
          <span className="ml-auto rounded-md bg-danger-soft px-[7px] py-0.5 text-[11px] font-medium text-danger">
            {over} over 2h
          </span>
        )}
        {p.fetching && (
          <Loader2 size={13} aria-label="Refreshing" className="ml-auto animate-spin text-faint" />
        )}
      </header>
      <ConversationFilters
        filters={p.filters}
        counts={p.counts}
        agents={p.agents}
        tags={p.tags}
        onChange={p.onFilters}
        onClear={p.onClearFilters}
      />
      {p.selected.size > 0 && (
        <BulkActionsToolbar
          count={p.selected.size}
          canManage={p.canManage}
          busy={p.bulkBusy}
          onSelectAll={p.onSelectAll}
          onClear={p.onClearSelection}
          onAssignMe={() => p.onBulk('ASSIGN_ME')}
          onMarkRead={() => p.onBulk('MARK_READ')}
          onSnooze={() => p.onBulk('SNOOZE')}
          onResolve={() => p.onBulk('RESOLVE')}
        />
      )}
      <div
        role="listbox"
        aria-label="Conversation list"
        aria-busy={p.state === 'loading'}
        className="min-h-0 flex-1 overflow-y-auto border-t border-line-subtle"
      >
        {p.state === 'loading' && (
          <div aria-label="Loading conversations">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 border-b border-line-subtle px-4 py-3.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5 bg-wash-2" />
                  <Skeleton className="h-3 w-1/4 bg-wash-2" />
                </div>
              </div>
            ))}
          </div>
        )}
        {p.state === 'error' && (
          <div role="alert" className="px-6 py-12 text-center">
            <TriangleAlert size={22} className="mx-auto mb-2 text-danger" />
            <div className="text-sm font-semibold">Couldn&apos;t load conversations</div>
            <div className="mx-auto mb-3.5 mt-1 max-w-[260px] text-[13px] text-muted">
              {p.errorMessage ?? 'Something went wrong.'}
            </div>
            <Button variant="outline" size="sm" onClick={p.onRetry}>
              Try again
            </Button>
          </div>
        )}
        {p.state === 'ready' && p.conversations.length === 0 && (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-soft">
              <Inbox size={20} className="text-primary" />
            </span>
            <div className="text-[14.5px] font-semibold">
              {filtered
                ? 'No conversations match'
                : p.filters.status === 'OPEN'
                  ? 'No open conversations'
                  : p.filters.status === 'SNOOZED'
                    ? 'Nothing snoozed'
                    : 'No resolved conversations'}
            </div>
            <div className="mx-auto mb-3.5 mt-1 max-w-[260px] text-[13px] text-muted">
              {filtered
                ? 'Try a different search or clear your filters.'
                : p.filters.status === 'OPEN'
                  ? 'New customer messages will appear here once a channel is connected.'
                  : 'Conversations you move here will appear in this tab.'}
            </div>
            {filtered && (
              <Button variant="outline" size="sm" onClick={p.onClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}
        {p.state === 'ready' &&
          p.conversations.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              active={c.id === p.activeId}
              checked={p.selected.has(c.id)}
              selectionMode={p.selected.size > 0}
              now={p.now}
              onOpen={p.onOpen}
              onToggle={p.onToggle}
            />
          ))}
      </div>
    </section>
  );
}
