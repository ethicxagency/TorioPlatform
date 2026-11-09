'use client';

import { Download, MoreHorizontal, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useNow } from '@/features/inbox/use-now';
import { DATE_RANGES } from '@/features/leads/constants';
import { useDebounced } from '@/features/leads/use-debounced';
import { useWorkspace } from '@/lib/workspace';
import { ORDER_PAGE_SIZE } from '../constants';
import {
  downloadOrdersCsv,
  useOrderMutations,
  useOrders,
  useOrderSummary,
  type OrderStatusTarget,
} from '../queries';
import {
  activeOrderFilterCount,
  EMPTY_ORDER_FILTERS,
  type OrderFilters,
  type OrderSort,
} from '../types';
import { OrderBulkBar } from './bulk-bar';
import { CreateOrderDialog } from './create-order-dialog';
import { OrderKpis } from './kpi-cards';
import { OrdersTable } from './orders-table';
import { OrdersToolbar } from './orders-toolbar';

const LIST_KEY = 'torio.orders.list';
type ListState = {
  filters: OrderFilters;
  search: string;
  sort: OrderSort;
  dir: 'asc' | 'desc';
  page: number;
};

function loadListState(): ListState | null {
  try {
    const raw = sessionStorage.getItem(LIST_KEY);
    return raw ? ({ ...JSON.parse(raw) } as ListState) : null;
  } catch {
    return null;
  }
}

function saveListState(v: ListState) {
  try {
    sessionStorage.setItem(LIST_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable: list simply starts fresh */
  }
}

export function OrdersPage() {
  const { toast } = useShell();
  const router = useRouter();
  const now = useNow();
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const canWrite = can('orders:write');

  // List context survives opening an order and coming back (same tab only).
  const [saved] = useState(loadListState);
  const [filters, setFilters] = useState<OrderFilters>(saved?.filters ?? EMPTY_ORDER_FILTERS);
  const [search, setSearch] = useState(saved?.search ?? '');
  const q = useDebounced(search, 300);
  const [sort, setSort] = useState<OrderSort>(saved?.sort ?? 'createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>(saved?.dir ?? 'desc');
  const [page, setPage] = useState(saved?.page ?? 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, moreOpen, () => setMoreOpen(false));

  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const list = useOrders(ws, { filters: effective, sort, dir, page, pageSize: ORDER_PAGE_SIZE });
  const summary = useOrderSummary(ws, filters.range);
  const m = useOrderMutations(ws);
  const orders = useMemo(() => list.data?.data ?? [], [list.data]);
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  const patchFilters = useCallback((p: Partial<OrderFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
    setSelected(new Set());
  }, []);
  const clearAll = useCallback(() => {
    setFilters(EMPTY_ORDER_FILTERS);
    setSearch('');
    setPage(1);
    setSelected(new Set());
  }, []);
  const onSort = (s: OrderSort, d: 'asc' | 'desc') => {
    setSort(s);
    setDir(d);
    setPage(1);
  };
  const headerSort = (f: OrderSort) =>
    f === sort ? onSort(f, dir === 'asc' ? 'desc' : 'asc') : onSort(f, 'desc');
  const openOrder = (o: { id: string }) => {
    saveListState({ filters, search, sort, dir, page });
    router.push(`/orders/${o.id}`);
  };
  const openConversation = (id: string) => router.push(`/inbox?conversation=${id}`);
  const ids = [...selected];

  const doExport = async (sel?: string[]) => {
    if (!ws) return;
    try {
      await downloadOrdersCsv(ws, effective, sel);
      toast(sel ? `Exported ${sel.length} order${sel.length === 1 ? '' : 's'}` : 'Export started');
    } catch (e) {
      err(e);
    }
  };

  const bulk = (status: OrderStatusTarget) =>
    m.bulk.mutate(
      { ids, action: 'SET_STATUS', status },
      {
        onSuccess: (r) => {
          const failed = r.failed.length;
          toast(
            failed
              ? `${r.updated} updated · ${failed} skipped: ${r.failed
                  .slice(0, 2)
                  .map((f) => `${f.number ? `#${f.number}` : 'order'} ${f.reason}`)
                  .join('; ')}${failed > 2 ? '…' : ''}`
              : `${r.updated} order${r.updated === 1 ? '' : 's'} updated`,
          );
          setSelected(new Set(r.failed.map((f) => f.id)));
        },
        onError: err,
      },
    );

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('orders:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Orders in this workspace.
      </div>
    );

  const state = list.isPending ? 'loading' : list.isError && !list.data ? 'error' : 'ready';
  const filtered = activeOrderFilterCount(filters) > 0 || !!q || !!filters.range;
  const periodLabel = DATE_RANGES.find((r) => r.key === filters.range)?.label ?? 'All time';

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            Commerce / <span className="text-muted">Orders</span>
          </nav>
          <h1 className="m-0 font-page-title">Orders</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Track orders, payments, and fulfillment from one workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void doExport()}>
            <Download size={14} />
            Export
          </Button>
          <div ref={moreRef} className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-white hover:bg-wash"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 z-30 w-[200px] animate-panel-in rounded-xl border border-line glass-menu p-1.5 shadow-popover"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    void list.refetch();
                    void summary.refetch();
                    toast('Refreshed');
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13px] hover:bg-wash"
                >
                  <RefreshCw size={14} className="text-muted" />
                  Refresh data
                </button>
              </div>
            )}
          </div>
          <Button
            disabled={!canWrite}
            onClick={() => setCreating(true)}
            title={canWrite ? undefined : 'You need write access to create orders'}
          >
            <Plus size={14} />
            Create Order
          </Button>
        </div>
      </header>

      <OrderKpis
        summary={summary.data}
        loading={summary.isPending}
        error={summary.isError && !summary.data}
        periodLabel={periodLabel}
        onRetry={() => summary.refetch()}
      />
      <OrdersToolbar
        filters={filters}
        search={search}
        sort={sort}
        dir={dir}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onFilters={patchFilters}
        onClear={clearAll}
        onSort={onSort}
      />

      {selected.size > 0 && (
        <OrderBulkBar
          count={selected.size}
          canWrite={canWrite}
          busy={m.bulk.isPending}
          onClear={() => setSelected(new Set())}
          onStatus={bulk}
          onExport={() => void doExport(ids)}
        />
      )}

      <OrdersTable
        orders={orders}
        total={list.data?.meta.total ?? 0}
        page={page}
        pageSize={ORDER_PAGE_SIZE}
        state={state}
        errorMessage={list.error?.message}
        fetching={list.isFetching && !list.isPending}
        filtered={filtered}
        selected={selected}
        activeId={null}
        sort={sort}
        dir={dir}
        canWrite={canWrite}
        now={now}
        onSort={headerSort}
        onPage={setPage}
        onOpen={openOrder}
        onExport={(o) => void doExport([o.id])}
        onOpenConversation={openConversation}
        onToggle={(id) =>
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onTogglePage={() =>
          setSelected((s) =>
            orders.every((o) => s.has(o.id)) ? new Set() : new Set(orders.map((o) => o.id)),
          )
        }
        onRetry={() => list.refetch()}
        onClearFilters={clearAll}
        onCreate={() => setCreating(true)}
      />

      {creating && (
        <CreateOrderDialog
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            const o = await m.create.mutateAsync(body);
            setCreating(false);
            toast(`Order #${o.number} created`);
            router.push(`/orders/${o.id}`);
          }}
        />
      )}
    </div>
  );
}
