'use client';

import { usePageSize } from '@/lib/table-prefs';
import { Download, MoreHorizontal, Plus, RefreshCw, Upload } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useMembers } from '@/features/inbox/queries';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useNow } from '@/features/inbox/use-now';
import { useWorkspace } from '@/lib/workspace';
import { PAGE_SIZE } from '../constants';
import {
  ApiRequestError,
  downloadLeadsCsv,
  useLead,
  useLeadMutations,
  useLeads,
  useLeadSummary,
} from '../queries';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  type Lead,
  type LeadFilters,
  type LeadSortField,
  type LeadStage,
} from '../types';
import { BulkBar } from './bulk-bar';
import { ImportDialog } from './import-dialog';
import { KpiCards } from './kpi-cards';
import { LeadDrawer } from './lead-drawer';
import { LeadFormDialog } from './lead-form-dialog';
import { LeadsTable } from './leads-table';
import { LeadsToolbar, type View } from './leads-toolbar';
import { PipelineBoard } from './pipeline-board';
import { useDebounced } from '../use-debounced';

type Confirm = { kind: 'one'; lead: Lead } | { kind: 'bulk' } | null;

export function LeadsPage() {
  const { toast, mobile } = useShell();
  const router = useRouter();
  const now = useNow();
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const canWrite = can('leads:write');
  const canDelete = can('leads:delete');

  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [sort, setSort] = useState<LeadSortField>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openState, setOpenLead] = useState<Lead | null>(null);
  // Deep link from other pages (e.g. the Inbox customer panel): /leads?lead=<id> opens that lead.
  const linkedId = useSearchParams().get('lead');
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const linked = useLead(ws, linkedId && linkedId !== dismissedId ? linkedId : null);
  const openLead =
    openState ?? (linkedId && linkedId !== dismissedId ? (linked.data ?? null) : null);
  const [form, setForm] = useState<{ lead: Lead | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, moreOpen, () => setMoreOpen(false));

  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const [tableSize, setPageSize] = usePageSize('leads', PAGE_SIZE);
  const pageSize = view === 'pipeline' ? 100 : tableSize;
  const list = useLeads(ws, {
    filters: effective,
    sort,
    dir,
    page: view === 'pipeline' ? 1 : page,
    pageSize,
  });
  const summary = useLeadSummary(ws);
  const members = useMembers(ws);
  const m = useLeadMutations(ws);
  const owners = useMemo(
    () => (members.data ?? []).map((x) => ({ id: x.userId, name: x.name })),
    [members.data],
  );
  const leads = useMemo(() => list.data?.data ?? [], [list.data]);
  const tags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))].sort(), [leads]);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');

  const patchFilters = useCallback((p: Partial<LeadFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
    setSelected(new Set());
  }, []);
  const clearAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
    setSelected(new Set());
  }, []);
  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const onSort = (s: LeadSortField, d: 'asc' | 'desc') => {
    setSort(s);
    setDir(d);
    setPage(1);
  };
  const headerSort = (f: LeadSortField) =>
    f === sort
      ? onSort(f, dir === 'asc' ? 'desc' : 'asc')
      : onSort(f, f === 'name' ? 'asc' : 'desc');
  const closeDrawer = useCallback(() => {
    setOpenLead(null);
    setDismissedId(linkedId);
  }, [linkedId]);
  const openConversation = (l: Lead) =>
    l.conversationId && router.push(`/inbox?conversation=${l.conversationId}`);

  const doExport = async (ids?: string[]) => {
    if (!ws) return;
    try {
      await downloadLeadsCsv(ws, effective, ids);
      toast(ids ? `Exported ${ids.length} selected leads` : 'Export started');
    } catch (e) {
      err(e);
    }
  };

  const submitForm = async (
    values: Parameters<React.ComponentProps<typeof LeadFormDialog>['onSubmit']>[0],
    lead: Lead | null,
  ) => {
    if (lead) {
      const r = await m.update.mutateAsync({
        id: lead.id,
        body: {
          name: values.name,
          email: values.email ?? null,
          phone: values.phone ?? null,
          company: values.company ?? null,
          jobTitle: values.jobTitle ?? null,
          source: values.source,
          stage: values.stage,
          ownerId: values.ownerId ?? null,
          tags: values.tags,
          dealValue: values.dealValue ?? null,
          notes: values.notes,
        },
      });
      setOpenLead((cur) => (cur?.id === r.id ? r : cur));
      toast('Lead updated');
    } else {
      await m.create.mutateAsync(values);
      toast('Lead added');
    }
  };

  const bulk = (body: Parameters<typeof m.bulk.mutate>[0], ok: string) =>
    m.bulk.mutate(body, {
      onSuccess: (r) => {
        toast(`${ok} · ${r.updated} lead${r.updated === 1 ? '' : 's'}`);
      },
      onError: err,
    });
  const ids = [...selected];

  const confirmDelete = () => {
    if (!confirm) return;
    if (confirm.kind === 'one')
      m.remove.mutate(confirm.lead.id, {
        onSuccess: () => {
          toast('Lead deleted');
          setOpenLead((c) => (c?.id === (confirm as { lead: Lead }).lead.id ? null : c));
          setConfirm(null);
        },
        onError: (e) => {
          err(e);
          setConfirm(null);
        },
      });
    else
      m.bulk.mutate(
        { ids, action: 'DELETE' },
        {
          onSuccess: (r) => {
            toast(`Deleted ${r.updated} leads`);
            setSelected(new Set());
            setConfirm(null);
          },
          onError: (e) => {
            err(e);
            setConfirm(null);
          },
        },
      );
  };

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('leads:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Leads in this workspace.
      </div>
    );

  const state = list.isPending ? 'loading' : list.isError && !list.data ? 'error' : 'ready';
  const filtered = activeFilterCount(filters) > 0 || !!q;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            CRM / <span className="text-muted">Leads</span>
          </nav>
          <h1 className="m-0 font-page-title">Leads</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Manage prospects, track opportunities, and turn conversations into customers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!canWrite}
            onClick={() => setImporting(true)}
            title={canWrite ? undefined : 'You need write access to import'}
          >
            <Upload size={14} />
            {!mobile && 'Import'}
          </Button>
          <Button variant="outline" onClick={() => void doExport()}>
            <Download size={14} />
            {!mobile && 'Export'}
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
            onClick={() => setForm({ lead: null })}
            title={canWrite ? undefined : 'You need write access to add leads'}
          >
            <Plus size={14} />
            Add Lead
          </Button>
        </div>
      </header>

      <KpiCards
        summary={summary.data}
        loading={summary.isPending}
        error={summary.isError && !summary.data}
        onRetry={() => summary.refetch()}
      />

      <LeadsToolbar
        filters={filters}
        search={search}
        sort={sort}
        dir={dir}
        view={view}
        owners={owners}
        tags={tags}
        onSearch={onSearch}
        onFilters={patchFilters}
        onClear={clearAll}
        onSort={onSort}
        onView={(v) => {
          setView(v);
          setSelected(new Set());
        }}
      />

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          owners={owners}
          canWrite={canWrite}
          canDelete={canDelete}
          busy={m.bulk.isPending}
          onClear={() => setSelected(new Set())}
          onAssign={(ownerId) =>
            bulk({ ids, action: 'ASSIGN', ownerId }, ownerId ? 'Assigned' : 'Unassigned')
          }
          onStage={(stage) => bulk({ ids, action: 'SET_STAGE', stage }, 'Status updated')}
          onTags={(t) => bulk({ ids, action: 'ADD_TAGS', tags: t }, 'Tag added')}
          onExport={() => void doExport(ids)}
          onDelete={() => setConfirm({ kind: 'bulk' })}
        />
      )}

      {view === 'list' ? (
        <LeadsTable
          leads={leads}
          total={list.data?.meta.total ?? 0}
          page={page}
          pageSize={tableSize}
          state={state}
          errorMessage={list.error?.message}
          fetching={list.isFetching && !list.isPending}
          filtered={filtered}
          selected={selected}
          activeId={openLead?.id ?? null}
          sort={sort}
          dir={dir}
          canWrite={canWrite}
          canDelete={canDelete}
          now={now}
          onSort={headerSort}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onOpen={setOpenLead}
          onEdit={(l) => setForm({ lead: l })}
          onDelete={(l) => setConfirm({ kind: 'one', lead: l })}
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
              leads.every((l) => s.has(l.id)) ? new Set() : new Set(leads.map((l) => l.id)),
            )
          }
          onRetry={() => list.refetch()}
          onClearFilters={clearAll}
          onAdd={() => setForm({ lead: null })}
        />
      ) : state === 'ready' ? (
        <PipelineBoard
          leads={leads}
          total={list.data?.meta.total ?? 0}
          canWrite={canWrite}
          now={now}
          onOpen={setOpenLead}
          onMove={(l, stage: LeadStage) =>
            m.update.mutate(
              { id: l.id, body: { stage } },
              {
                onSuccess: () =>
                  toast(`Moved ${l.name} to ${stage.charAt(0) + stage.slice(1).toLowerCase()}`),
                onError: (e) =>
                  toast.error(
                    `Couldn't move ${l.name}: ${e instanceof Error ? e.message : 'failed'}`,
                  ),
              },
            )
          }
        />
      ) : (
        <LeadsTable
          leads={[]}
          total={0}
          page={1}
          pageSize={tableSize}
          state={state}
          errorMessage={list.error?.message}
          fetching={false}
          filtered={false}
          selected={selected}
          activeId={null}
          sort={sort}
          dir={dir}
          canWrite={canWrite}
          canDelete={canDelete}
          now={now}
          onSort={headerSort}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onOpen={setOpenLead}
          onEdit={() => undefined}
          onDelete={() => undefined}
          onOpenConversation={openConversation}
          onToggle={() => undefined}
          onTogglePage={() => undefined}
          onRetry={() => list.refetch()}
          onClearFilters={clearAll}
          onAdd={() => undefined}
        />
      )}

      {openLead && !form && (
        <LeadDrawer
          lead={openLead}
          owners={owners}
          canWrite={canWrite}
          canDelete={canDelete}
          onClose={closeDrawer}
          onEdit={(l) => setForm({ lead: l })}
          onDelete={(l) => setConfirm({ kind: 'one', lead: l })}
          onOpenConversation={openConversation}
        />
      )}
      {form && (
        <LeadFormDialog
          lead={form.lead}
          owners={owners}
          onClose={() => setForm(null)}
          onSubmit={submitForm}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImport={(rows) => m.importRows.mutateAsync(rows)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'one'
              ? `Delete ${confirm.lead.name}?`
              : `Delete ${selected.size} lead${selected.size === 1 ? '' : 's'}?`
          }
          body="This permanently removes the lead and its activity history. Linked Inbox conversations are not affected."
          confirmLabel="Delete"
          busy={m.remove.isPending || m.bulk.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

export { ApiRequestError };
