'use client';

import { LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CHANNELS } from '@/features/inbox/constants';
import { fmtAgo } from '@/features/inbox/format';
import { useDebounced } from '@/features/leads/use-debounced';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';
import { useChannels, useChannelSummary, useProviders } from '../queries';
import { EMPTY_CHANNEL_FILTERS, STATUS_INFO, type Channel, type ChannelFilters } from '../types';
import { ProviderMark, StatusPill } from './bits';
import { ChannelDrawer } from './channel-drawer';
import { ConnectDialog } from './connect-dialog';

export function ChannelsPage() {
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const canManage = can('channels:manage');
  const [filters, setFilters] = useState<ChannelFilters>(EMPTY_CHANNEL_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [open, setOpen] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const eff = useMemo(() => ({ ...filters, q }), [filters, q]);
  const list = useChannels(ws, eff);
  const summary = useChannelSummary(ws);
  const providers = useProviders(ws, connect);
  const openChannel = list.data?.find((c) => c.id === open) ?? null;

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('channels:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Channels in this workspace.
      </div>
    );

  const s = summary.data;
  const filtered = !!q || !!filters.provider || !!filters.status;
  const kpis = [
    { label: 'Connected', value: s?.connected, sub: 'Connection records (health not verified)' },
    {
      label: 'Needs attention',
      value: s?.needsAttention,
      sub: s && s.needsAttention > 0 ? 'Action required' : 'Nothing flagged',
    },
    { label: 'Disconnected', value: s?.disconnected, sub: 'History kept' },
    {
      label: 'Conversations (30 days)',
      value: s?.conversationsLast30Days,
      sub: 'Across all channels',
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            Settings / <span className="text-muted">Channels</span>
          </nav>
          <h1 className="m-0 font-page-title">Channels</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Connect your messaging platforms and manage every conversation in one place.
          </p>
        </div>
        <Button
          disabled={!canManage}
          onClick={() => setConnect(true)}
          title={canManage ? undefined : 'Only admins and owners can connect channels'}
        >
          <Plus size={14} />
          Connect Channel
        </Button>
      </header>

      {summary.isError && !s ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          Couldn&apos;t load channel metrics.
          <button
            type="button"
            onClick={() => summary.refetch()}
            className="cursor-pointer font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-0 rounded-card border border-line bg-white p-3.5">
              <div className="truncate text-[12.5px] font-medium text-muted">{k.label}</div>
              {summary.isPending ? (
                <>
                  <Skeleton className="mt-2 h-7 w-12" />
                  <Skeleton className="mt-2 h-3 w-24 bg-wash-2" />
                </>
              ) : (
                <>
                  <div className="mt-1 text-2xl font-metric">{k.value ?? '—'}</div>
                  <div className="mt-1 truncate text-xs text-faint">{k.sub}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {s && s.sample > 0 && (
        <p role="note" className="m-0 text-xs text-muted">
          {s.sample} of {s.total} channel{s.total === 1 ? ' is a' : 's are'} development sample
          {s.sample === 1 ? '' : 's'} with no live provider connection.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[320px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search channels"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels"
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="cursor-pointer text-faint"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <select
          aria-label="Filter by platform"
          value={filters.provider}
          onChange={(e) =>
            setFilters({ ...filters, provider: e.target.value as ChannelFilters['provider'] })
          }
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="">All platforms</option>
          {(Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]).map((p) => (
            <option key={p} value={p}>
              {CHANNELS[p].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) =>
            setFilters({ ...filters, status: e.target.value as ChannelFilters['status'] })
          }
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="">Any status</option>
          {(Object.keys(STATUS_INFO) as (keyof typeof STATUS_INFO)[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_INFO[k].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort channels"
          value={filters.sort}
          onChange={(e) =>
            setFilters({ ...filters, sort: e.target.value as ChannelFilters['sort'] })
          }
          className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]"
        >
          <option value="name">Name</option>
          <option value="activity">Last activity</option>
        </select>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_CHANNEL_FILTERS);
              setSearch('');
            }}
            className="cursor-pointer text-xs font-medium text-primary"
          >
            Clear filters
          </button>
        )}
        <div
          role="radiogroup"
          aria-label="View"
          className="ml-auto flex gap-0.5 rounded-[10px] bg-wash-2 p-[3px]"
        >
          {(
            [
              ['grid', 'Grid', LayoutGrid],
              ['list', 'List', List],
            ] as const
          ).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={view === k}
              onClick={() => setView(k)}
              className={cn(
                'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium',
                view === k
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                  : 'text-muted',
              )}
            >
              <Icon size={14} />
              {l}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading channels"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
      ) : list.isError ? (
        <div
          role="alert"
          className="rounded-card border border-line bg-white px-6 py-12 text-center"
        >
          <div className="text-sm font-semibold">Couldn&apos;t load channels</div>
          <div className="mb-3 mt-1 text-[13px] text-muted">{list.error.message}</div>
          <Button variant="outline" size="sm" onClick={() => list.refetch()}>
            Try again
          </Button>
        </div>
      ) : list.data.length === 0 ? (
        <div className="rounded-card border border-line bg-[radial-gradient(500px_220px_at_50%_0%,rgba(124,131,255,0.10),transparent_70%),#fff] px-6 py-14 text-center">
          {filtered ? (
            <>
              <div className="text-[15px] font-semibold">No channels match</div>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilters(EMPTY_CHANNEL_FILTERS);
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <div className="mb-3 flex justify-center gap-2" aria-hidden>
                {(['WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const).map((p) => (
                  <ProviderMark key={p} provider={p} size={34} />
                ))}
              </div>
              <div className="text-[16px] font-semibold">Connect your first channel</div>
              <p className="mx-auto mb-4 mt-1 max-w-[380px] text-[13px] text-muted">
                Bring your messaging platforms into Torio to manage conversations from one
                workspace.
              </p>
              {canManage && <Button onClick={() => setConnect(true)}>Connect Channel</Button>}
            </>
          )}
        </div>
      ) : (
        <ul
          className={cn(
            'm-0 list-none gap-3 p-0',
            view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col',
          )}
        >
          {list.data.map((c) => (
            <ChannelCard key={c.id} c={c} view={view} onOpen={() => setOpen(c.id)} />
          ))}
        </ul>
      )}

      {openChannel && (
        <ChannelDrawer
          channel={openChannel}
          canManage={canManage}
          canAudit={can('audit:read')}
          onClose={() => setOpen(null)}
        />
      )}
      {connect && (
        <ConnectDialog
          providers={providers.data}
          loading={providers.isPending}
          error={providers.error?.message}
          onRetry={() => providers.refetch()}
          onClose={() => setConnect(false)}
        />
      )}
    </div>
  );
}

function ChannelCard({
  c,
  view,
  onOpen,
}: {
  c: Channel;
  view: 'grid' | 'list';
  onOpen: () => void;
}) {
  return (
    <li
      className={cn(
        'flex gap-3 rounded-card border border-line bg-white p-4',
        view === 'grid' ? 'flex-col' : 'flex-row flex-wrap items-center',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ProviderMark provider={c.provider} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full cursor-pointer truncate text-left text-[15px] font-semibold hover:text-primary-hover"
          >
            {c.displayName}
          </button>
          <div className="truncate text-xs text-muted">
            {CHANNELS[c.provider].label}
            {c.accountName ? ` · ${c.accountName}` : ''}
            {c.accountMask ? ` · ${c.accountMask}` : ''}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={c.status} />
        {c.isSample && (
          <span className="rounded-md bg-wash-2 px-2 py-0.5 text-[11.5px] text-faint">Sample</span>
        )}
        {c.status === 'CONNECTED' && !c.lastHealthCheckAt && !c.isSample && (
          <span className="text-xs text-faint">Not verified</span>
        )}
      </div>
      <div className="text-xs text-muted">
        {c.openConversations} open · {c.unreadConversations} unread
        {c.lastConversationAt ? ` · last ${fmtAgo(c.lastConversationAt)} ago` : ''}
      </div>
      {c.lastError && (
        <div role="alert" className="max-w-full truncate text-xs text-danger" title={c.lastError}>
          {c.lastError}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>
          Manage
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/inbox?channel=${c.provider}`}>Open Inbox</Link>
        </Button>
      </div>
    </li>
  );
}
