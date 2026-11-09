'use client';

import { Inbox, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CHANNELS } from '../constants';
import type { Conversation, InboxFilters, Provider } from '../types';
import { advancedFilterCount } from '../types';
import { BulkActionsToolbar, type BulkRequest } from './bulk-actions-toolbar';
import { ChannelTabs } from './channel-tabs';
import { ConversationFilters } from './conversation-filters';
import { ConversationRow } from './conversation-row';

interface Props {
  conversations: Conversation[];
  counts: { open: number; snoozed: number; resolved: number } | undefined;
  channelCounts: Record<'all' | Provider, number> | undefined;
  filters: InboxFilters;
  agents: { id: string; name: string }[];
  agentsLoading: boolean;
  tags: string[];
  tagsLoading: boolean;
  meId: string;
  activeId: string | null;
  selected: Set<string>;
  now: number;
  state: 'loading' | 'error' | 'ready';
  fetching: boolean;
  errorMessage?: string;
  canManage: boolean;
  /** Manage mode: rows show checkboxes and clicks select instead of opening. */
  managing: boolean;
  bulkBusy: boolean;
  onRetry: () => void;
  onFilters: (patch: Partial<InboxFilters>) => void;
  onChannel: (channel: '' | Provider) => void;
  onClearFilters: () => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onManage: () => void;
  onToggleAll: () => void;
  onBulk: (req: BulkRequest) => void;
}

export function ConversationList(p: Props) {
  const filtered = !!p.filters.q || p.filters.view !== 'all' || advancedFilterCount(p.filters) > 0;
  const channel = p.filters.channel ? `${CHANNELS[p.filters.channel].label} ` : '';

  return (
    <section
      aria-label="Conversations"
      className="flex h-full min-h-0 min-w-0 flex-col bg-white/70 backdrop-blur-[12px]"
    >
      <header className="flex min-h-[52px] items-center gap-2 px-4 pb-1 pt-4">
        <h1 className="m-0 font-page-title">Inbox</h1>
        {p.fetching && (
          <Loader2 size={13} aria-label="Refreshing" className="ml-auto animate-spin text-faint" />
        )}
      </header>
      <ChannelTabs
        value={p.filters.channel}
        counts={p.channelCounts}
        status={p.filters.status}
        onChange={p.onChannel}
      />
      <ConversationFilters
        filters={p.filters}
        counts={p.counts}
        agents={p.agents}
        agentsLoading={p.agentsLoading}
        tags={p.tags}
        tagsLoading={p.tagsLoading}
        onChange={p.onFilters}
        onClear={p.onClearFilters}
        canManage={p.canManage}
        managing={p.managing}
        onManage={p.onManage}
      />
      {p.managing && (
        <BulkActionsToolbar
          total={p.conversations.length}
          count={p.selected.size}
          busy={p.bulkBusy}
          agents={p.agents}
          meId={p.meId}
          onToggleAll={p.onToggleAll}
          onDone={p.onManage}
          onAction={p.onBulk}
        />
      )}
      <div
        role="listbox"
        aria-label="Conversation list"
        aria-busy={p.state === 'loading'}
        className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line-subtle"
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
            <TriangleAlert size={24} className="mx-auto mb-2 text-danger" />
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
              <Inbox size={24} className="text-primary" />
            </span>
            <div className="text-[14.5px] font-semibold">
              {filtered
                ? 'No conversations match'
                : p.filters.status === 'OPEN'
                  ? `No open ${channel}conversations`
                  : p.filters.status === 'SNOOZED'
                    ? channel
                      ? `No snoozed ${channel}conversations`
                      : 'Nothing snoozed'
                    : `No resolved ${channel}conversations`}
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
              selectionMode={p.managing}
              now={p.now}
              onOpen={p.onOpen}
              onToggle={p.onToggle}
            />
          ))}
      </div>
    </section>
  );
}
