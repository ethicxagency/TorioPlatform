'use client';

import { Download, MoreHorizontal, Plus, RefreshCw, Upload } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { CsvImportDialog } from '@/components/shared/csv-import-dialog';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useMembers } from '@/features/inbox/queries';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useNow } from '@/features/inbox/use-now';
import { useDebounced } from '@/features/leads/use-debounced';
import { useWorkspace } from '@/lib/workspace';
import {
  applyCustomerMapping,
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_IMPORT_LABELS,
  guessCustomerMapping,
} from '../csv';
import { CUSTOMER_PAGE_SIZE } from '../constants';
import {
  downloadCustomersCsv,
  useCustomer,
  useCustomerMutations,
  useCustomers,
  useCustomerSummary,
} from '../queries';
import {
  activeCustomerFilterCount,
  EMPTY_CUSTOMER_FILTERS,
  type CustomerFilters,
  type CustomerItem,
  type CustomerSort,
} from '../types';
import { CustomerBulkBar } from './bulk-bar';
import { CustomerDrawer } from './customer-drawer';
import { CustomerFormDialog } from './customer-form-dialog';
import { CustomerKpis } from './kpi-cards';
import { CustomersTable } from './customers-table';
import { CustomersToolbar } from './customers-toolbar';

type Confirm = CustomerItem | null;

export function CustomersPage() {
  const { toast, mobile } = useShell();
  const router = useRouter();
  const now = useNow();
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const canWrite = can('customers:update');
  const canDelete = can('customers:delete');

  const [filters, setFilters] = useState<CustomerFilters>(EMPTY_CUSTOMER_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [sort, setSort] = useState<CustomerSort>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openState, setOpen] = useState<CustomerItem | null>(null);
  // Deep link from other pages (e.g. an order): /customers?customer=<id> opens that customer's profile.
  const linkedId = useSearchParams().get('customer');
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const linked = useCustomer(ws, linkedId && linkedId !== dismissedId ? linkedId : null);
  const open = openState ?? (linkedId && linkedId !== dismissedId ? (linked.data ?? null) : null);
  const [form, setForm] = useState<{ customer: CustomerItem | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, moreOpen, () => setMoreOpen(false));

  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const list = useCustomers(ws, {
    filters: effective,
    sort,
    dir,
    page,
    pageSize: CUSTOMER_PAGE_SIZE,
  });
  const summary = useCustomerSummary(ws);
  const members = useMembers(ws);
  const m = useCustomerMutations(ws);
  const owners = useMemo(
    () => (members.data ?? []).map((x) => ({ id: x.userId, name: x.name })),
    [members.data],
  );
  const customers = useMemo(() => list.data?.data ?? [], [list.data]);
  const tags = useMemo(() => [...new Set(customers.flatMap((c) => c.tags))].sort(), [customers]);
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  const patchFilters = useCallback((p: Partial<CustomerFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
    setSelected(new Set());
  }, []);
  const clearAll = useCallback(() => {
    setFilters((f) => ({ ...EMPTY_CUSTOMER_FILTERS, segment: f.segment }));
    setSearch('');
    setPage(1);
    setSelected(new Set());
  }, []);
  const onSort = (s: CustomerSort, d: 'asc' | 'desc') => {
    setSort(s);
    setDir(d);
    setPage(1);
  };
  const headerSort = (f: CustomerSort) =>
    f === sort
      ? onSort(f, dir === 'asc' ? 'desc' : 'asc')
      : onSort(f, f === 'name' ? 'asc' : 'desc');
  const closeDrawer = useCallback(() => {
    setOpen(null);
    setDismissedId(linkedId);
  }, [linkedId]);
  const openConversation = (id: string) => router.push(`/inbox?conversation=${id}`);
  const ids = [...selected];

  const doExport = async (sel?: string[]) => {
    if (!ws) return;
    try {
      await downloadCustomersCsv(ws, effective, sel);
      toast(sel ? `Exported ${sel.length} selected customers` : 'Export started');
    } catch (e) {
      err(e);
    }
  };

  const submitForm = async (
    values: Parameters<React.ComponentProps<typeof CustomerFormDialog>['onSubmit']>[0],
    customer: CustomerItem | null,
  ) => {
    if (customer) {
      const r = await m.update.mutateAsync({
        id: customer.id,
        body: {
          name: values.name,
          email: values.email ?? null,
          phone: values.phone ?? null,
          company: values.company ?? null,
          address: values.address ?? null,
          source: values.source,
          status: values.status,
          ownerId: values.ownerId ?? null,
          tags: values.tags,
          notes: values.notes,
        },
      });
      setOpen((cur) => (cur?.id === r.id ? r : cur));
      toast('Customer updated');
    } else {
      await m.create.mutateAsync(values);
      toast('Customer added');
    }
  };

  const bulk = (body: Parameters<typeof m.bulk.mutate>[0], ok: string) =>
    m.bulk.mutate(body, {
      onSuccess: (r) => toast(`${ok} · ${r.updated} customer${r.updated === 1 ? '' : 's'}`),
      onError: err,
    });

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('customers:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Customers in this workspace.
      </div>
    );

  const state = list.isPending ? 'loading' : list.isError && !list.data ? 'error' : 'ready';
  const filtered = activeCustomerFilterCount(filters) > 0 || !!q || filters.segment !== 'all';

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            CRM / <span className="text-muted">Customers</span>
          </nav>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">Customers</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Understand your customers and build stronger relationships.
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
                className="absolute right-0 top-11 z-30 w-[200px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover"
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
            onClick={() => setForm({ customer: null })}
            title={canWrite ? undefined : 'You need write access to add customers'}
          >
            <Plus size={14} />
            Add Customer
          </Button>
        </div>
      </header>

      <CustomerKpis
        summary={summary.data}
        loading={summary.isPending}
        error={summary.isError && !summary.data}
        onRetry={() => summary.refetch()}
      />
      <CustomersToolbar
        filters={filters}
        search={search}
        sort={sort}
        dir={dir}
        owners={owners}
        tags={tags}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onFilters={patchFilters}
        onClear={clearAll}
        onSort={onSort}
      />

      {selected.size > 0 && (
        <CustomerBulkBar
          count={selected.size}
          owners={owners}
          canWrite={canWrite}
          busy={m.bulk.isPending}
          onClear={() => setSelected(new Set())}
          onAssign={(ownerId) =>
            bulk({ ids, action: 'ASSIGN', ownerId }, ownerId ? 'Assigned' : 'Unassigned')
          }
          onStatus={(status) => bulk({ ids, action: 'SET_STATUS', status }, 'Status updated')}
          onTags={(action, t) =>
            bulk({ ids, action, tags: t }, action === 'ADD_TAGS' ? 'Tag added' : 'Tag removed')
          }
          onExport={() => void doExport(ids)}
        />
      )}

      <CustomersTable
        customers={customers}
        total={list.data?.meta.total ?? 0}
        page={page}
        pageSize={CUSTOMER_PAGE_SIZE}
        state={state}
        errorMessage={list.error?.message}
        fetching={list.isFetching && !list.isPending}
        filtered={filtered}
        selected={selected}
        activeId={open?.id ?? null}
        sort={sort}
        dir={dir}
        canWrite={canWrite}
        canDelete={canDelete}
        now={now}
        onSort={headerSort}
        onPage={setPage}
        onOpen={setOpen}
        onEdit={(c) => setForm({ customer: c })}
        onDelete={setConfirm}
        onOpenConversation={(c) => c.conversationId && openConversation(c.conversationId)}
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
            customers.every((c) => s.has(c.id)) ? new Set() : new Set(customers.map((c) => c.id)),
          )
        }
        onRetry={() => list.refetch()}
        onClearFilters={clearAll}
        onAdd={() => setForm({ customer: null })}
      />

      {open && !form && (
        <CustomerDrawer
          customer={open}
          owners={owners}
          canWrite={canWrite}
          canDelete={canDelete}
          onClose={closeDrawer}
          onEdit={(c) => setForm({ customer: c })}
          onDelete={setConfirm}
          onOpenConversation={openConversation}
        />
      )}
      {form && (
        <CustomerFormDialog
          customer={form.customer}
          owners={owners}
          onClose={() => setForm(null)}
          onSubmit={submitForm}
        />
      )}
      {importing && (
        <CsvImportDialog
          entity="customers"
          fields={CUSTOMER_IMPORT_FIELDS}
          labels={CUSTOMER_IMPORT_LABELS}
          requiredField="name"
          guess={guessCustomerMapping}
          apply={(rows, mp) =>
            applyCustomerMapping(rows, mp as Parameters<typeof applyCustomerMapping>[1])
          }
          onClose={() => setImporting(false)}
          onImport={(rows) => m.importRows.mutateAsync(rows)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.name}?`}
          body="This permanently removes the customer record, notes and linked leads' references. Customers with conversations can't be deleted — mark them Inactive instead."
          confirmLabel="Delete"
          busy={m.remove.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            m.remove.mutate(confirm.id, {
              onSuccess: () => {
                toast('Customer deleted');
                setOpen((c) => (c?.id === confirm.id ? null : c));
                setConfirm(null);
              },
              onError: (e) => {
                err(e);
                setConfirm(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
