'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminAction,
  useAdminList,
  useAdminOne,
  type CustomerDetail,
  type CustomerList,
  type Dashboard,
  type WorkspaceDetail,
  type WorkspaceList,
} from '../queries';
import {
  Drawer,
  Empty,
  fmtDate,
  Loading,
  money,
  Notice,
  PageHead,
  Pager,
  Panel,
  ReasonDialog,
  SearchBox,
  Status,
  td,
  th,
  useDebounce,
  input,
} from './common';
import { useAdminShell } from './admin-shell';

// ---------- Dashboard ----------

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-white p-3.5">
      <div className="truncate text-[12.5px] font-medium text-muted">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-[-0.02em]">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-faint">{sub}</div>
    </div>
  );
}

function RevenueChart({ d }: { d: Dashboard }) {
  const [cur, setCur] = useState(d.revenue[0]?.currency ?? '');
  const series = d.revenue.find((r) => r.currency === cur) ?? d.revenue[0];
  if (!series) return <Empty>No paid invoices in the last 6 months.</Empty>;
  const max = Math.max(1, ...series.months.map((m) => m.amountMinor));
  return (
    <div>
      {d.revenue.length > 1 && (
        <select
          aria-label="Currency"
          value={series.currency}
          onChange={(e) => setCur(e.target.value)}
          className={`${input} mb-2`}
        >
          {d.revenue.map((r) => (
            <option key={r.currency}>{r.currency}</option>
          ))}
        </select>
      )}
      <ul
        className="m-0 flex h-36 list-none items-end gap-2 p-0"
        aria-label={`Paid invoices per month in ${series.currency}`}
      >
        {series.months.map((m) => (
          <li
            key={m.month}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={`${m.month}: ${money(m.amountMinor, series.currency)}`}
          >
            <span className="text-[10.5px] tabular-nums text-faint">
              {m.amountMinor ? money(m.amountMinor, series.currency) : ''}
            </span>
            <span
              className="w-full rounded-t-md bg-primary"
              style={{
                height: `${Math.max(2, (m.amountMinor / max) * 96)}px`,
                opacity: m.amountMinor ? 1 : 0.2,
              }}
            />
            <span className="text-[10.5px] text-faint">{m.month.slice(5)}</span>
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-2 text-xs text-faint">
        Total of paid invoices per month, from real invoice records.
      </p>
    </div>
  );
}

export function DashboardPage() {
  const q = useAdminOne<Dashboard>('/dashboard');
  const d = q.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Dashboard"
        description="Platform overview from real customer, subscription and invoice data."
      />
      {q.isError && <Notice tone="bad">Couldn&apos;t load the dashboard. {q.error.message}</Notice>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {q.isPending ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : d ? (
          <>
            <Stat
              label="Total customers"
              value={d.customers.total}
              sub={`${d.customers.newLast30Days} new in 30 days · ${d.customers.suspended} suspended`}
            />
            <Stat
              label="Active workspaces"
              value={d.workspaces.active}
              sub={`${d.workspaces.suspended} suspended`}
            />
            <Stat
              label="Active subscriptions"
              value={d.subscriptions.active}
              sub={`${d.subscriptions.trialing} trialing · ${d.subscriptions.pastDue} past due`}
            />
            <Stat
              label="Monthly recurring revenue"
              value={
                d.mrr.byCurrency.length
                  ? d.mrr.byCurrency.map((m) => money(m.amountMinor, m.currency)).join(' · ')
                  : '—'
              }
              sub={
                d.mrr.unpricedSubscriptions
                  ? `${d.mrr.unpricedSubscriptions} subscription(s) have no recorded price and aren’t counted`
                  : 'Paying provider subscriptions, yearly ÷ 12'
              }
            />
          </>
        ) : null}
      </div>
      {d && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Revenue overview">
              <RevenueChart d={d} />
            </Panel>
            <Panel title="Failed payments">
              {d.failedPayments.length === 0 ? (
                <Empty>No failed payments.</Empty>
              ) : (
                <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                  {d.failedPayments.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.workspace}</span>
                        <span className="text-xs text-faint">
                          {f.number ?? 'Invoice'} · {fmtDate(f.issuedAt)}
                        </span>
                      </span>
                      <span className="tabular-nums text-danger">
                        {money(f.totalMinor, f.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Recent customers"
              action={
                <Link href="/admin/customers" className="text-xs">
                  View all
                </Link>
              }
            >
              {d.recentCustomers.length === 0 ? (
                <Empty>No customers yet.</Empty>
              ) : (
                <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                  {d.recentCustomers.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-faint">{c.email}</span>
                      </span>
                      <span className="text-xs text-faint">{fmtDate(c.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              title="Recent subscriptions"
              action={
                <Link href="/admin/subscriptions" className="text-xs">
                  View all
                </Link>
              }
            >
              {d.recentSubscriptions.length === 0 ? (
                <Empty>No subscriptions yet.</Empty>
              ) : (
                <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                  {d.recentSubscriptions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.workspace}</span>
                        <span className="text-xs capitalize text-faint">
                          {s.planKey} · {fmtDate(s.createdAt)}
                        </span>
                      </span>
                      <Status value={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Quick actions">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/customers">Find a customer</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/subscriptions?status=PAST_DUE">Past-due subscriptions</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/plans">Manage plans</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/activity">View audit log</Link>
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

// ---------- Customers ----------

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [status, setStatus] = useState('');
  const [sub, setSub] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useAdminList<CustomerList>('/customers', {
    q: q || undefined,
    status: status || undefined,
    subscription: sub || undefined,
    page,
  });
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  return (
    <div>
      <PageHead title="Customers" description="Every customer account on the platform." />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={reset(setSearch)} label="Search by name or email" />
        <select
          aria-label="Account status"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
          className={input}
        >
          <option value="">Any account status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Suspended</option>
        </select>
        <select
          aria-label="Subscription status"
          value={sub}
          onChange={(e) => reset(setSub)(e.target.value)}
          className={input}
        >
          <option value="">Any subscription</option>
          <option value="NONE">Free plan</option>
          {['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED'].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        {list.isPending ? (
          <Loading />
        ) : list.isError && !list.data ? (
          <Notice tone="bad">Couldn&apos;t load customers. {list.error.message}</Notice>
        ) : list.data!.data.length === 0 ? (
          <Empty>No customers match.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {[
                    'Customer',
                    'Email',
                    'Registered',
                    'Workspaces',
                    'Plan',
                    'Subscription',
                    'Account',
                    '',
                  ].map((h, i) => (
                    <th key={i} scope="col" className={th}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data!.data.map((c) => (
                  <tr key={c.id} className="border-b border-line-subtle last:border-0">
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={`${td} text-muted`}>{c.email}</td>
                    <td className={td}>{fmtDate(c.createdAt)}</td>
                    <td className={`${td} tabular-nums`}>{c.workspaceCount}</td>
                    <td className={td}>{c.planName}</td>
                    <td className={td}>
                      <Status value={c.subscriptionStatus} />
                    </td>
                    <td className={td}>
                      <Status value={c.status} />
                    </td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen(c.id)}
                        aria-label={`View ${c.name}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      {open && <CustomerDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useAdminShell();
  const q = useAdminOne<CustomerDetail>(`/customers/${id}`);
  const suspend = useAdminAction<CustomerDetail, { reason: string }>(
    'POST',
    `/customers/${id}/suspend`,
  );
  const reactivate = useAdminAction<CustomerDetail, { reason: string }>(
    'POST',
    `/customers/${id}/reactivate`,
  );
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);
  const c = q.data;
  return (
    <Drawer title={c?.name ?? 'Customer'} onClose={onClose}>
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load this customer.</Notice>}
      {c && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-muted">
              {c.email} {c.emailVerified ? '· verified' : '· unverified'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Status value={c.status} />
              <Status value={c.subscriptionStatus} />
              <span className="text-xs text-faint">Registered {fmtDate(c.createdAt)}</span>
            </div>
            {c.status === 'DISABLED' && (
              <div className="mt-3">
                <Notice tone="bad">
                  Suspended {fmtDate(c.suspendedAt)}: {c.suspendedReason}
                </Notice>
              </div>
            )}
            <div className="mt-3">
              {c.status === 'ACTIVE' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-danger"
                  onClick={() => setDialog('suspend')}
                >
                  Suspend customer
                </Button>
              ) : (
                <Button size="sm" onClick={() => setDialog('reactivate')}>
                  Reactivate customer
                </Button>
              )}
            </div>
          </div>
          <section aria-label="Workspaces">
            <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
              Workspaces
            </h3>
            <ul className="m-0 list-none divide-y divide-line-subtle rounded-xl border border-line p-0">
              {c.workspaces.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="font-medium">{w.name}</span>{' '}
                    <span className="text-xs text-faint">
                      {w.role.toLowerCase()} · {w.planKey}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Status value={w.subscriptionStatus} />
                    {w.status === 'SUSPENDED' && <Status value="SUSPENDED" />}
                  </span>
                </li>
              ))}
              {c.workspaces.length === 0 && (
                <li className="px-3 py-3 text-muted">No workspaces.</li>
              )}
            </ul>
          </section>
          <section aria-label="Billing history">
            <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
              Billing history
            </h3>
            {c.invoices.length === 0 ? (
              <p className="m-0 text-muted">No invoices.</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-line-subtle rounded-xl border border-line p-0">
                {c.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {i.number ?? 'Invoice'}{' '}
                      <span className="text-xs text-faint">
                        {i.workspace} · {fmtDate(i.issuedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{money(i.totalMinor, i.currency)}</span>
                      <Status value={i.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Recent activity">
            <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
              Recent account activity
            </h3>
            {c.activity.length === 0 ? (
              <p className="m-0 text-muted">No recorded activity.</p>
            ) : (
              <ul className="m-0 list-none p-0 text-muted">
                {c.activity.map((a, i) => (
                  <li key={i} className="py-0.5">
                    <code className="text-xs">{a.action}</code>{' '}
                    <span className="text-xs text-faint">{fmtDate(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="m-0 text-xs text-faint">
            Conversations, messages and customer contact data are never shown here.
          </p>
        </div>
      )}
      {dialog === 'suspend' && c && (
        <ReasonDialog
          title={`Suspend ${c.name}?`}
          danger
          confirmLabel="Suspend customer"
          body="They are signed out everywhere and can’t sign in or use any workspace until you reactivate them. Their data is kept."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await suspend.mutateAsync({ reason });
            toast('Customer suspended');
          }}
        />
      )}
      {dialog === 'reactivate' && c && (
        <ReasonDialog
          title={`Reactivate ${c.name}?`}
          confirmLabel="Reactivate customer"
          body="They can sign in again."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await reactivate.mutateAsync({ reason });
            toast('Customer reactivated');
          }}
        />
      )}
    </Drawer>
  );
}

// ---------- Workspaces ----------

export function WorkspacesPage() {
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useAdminList<WorkspaceList>('/workspaces', {
    q: q || undefined,
    status: status || undefined,
    page,
  });
  return (
    <div>
      <PageHead title="Workspaces" description="Every workspace, its owner, size and plan." />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search workspaces"
        />
        <select
          aria-label="Workspace status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={input}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>
      <Panel>
        {list.isPending ? (
          <Loading />
        ) : list.isError && !list.data ? (
          <Notice tone="bad">Couldn&apos;t load workspaces. {list.error.message}</Notice>
        ) : list.data!.data.length === 0 ? (
          <Empty>No workspaces match.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {[
                    'Workspace',
                    'Owner',
                    'Members',
                    'Channels',
                    'Plan',
                    'Created',
                    'Status',
                    '',
                  ].map((h, i) => (
                    <th key={i} scope="col" className={th}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data!.data.map((w) => (
                  <tr key={w.id} className="border-b border-line-subtle last:border-0">
                    <td className={`${td} font-medium`}>{w.name}</td>
                    <td className={`${td} text-muted`}>{w.owner ? `${w.owner.name}` : '—'}</td>
                    <td className={`${td} tabular-nums`}>{w.members}</td>
                    <td className={`${td} tabular-nums`}>{w.channels}</td>
                    <td className={td}>{w.planName}</td>
                    <td className={td}>{fmtDate(w.createdAt)}</td>
                    <td className={td}>
                      <Status value={w.status} />
                    </td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen(w.id)}
                        aria-label={`View ${w.name}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
      {open && <WorkspaceDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function WorkspaceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useAdminShell();
  const q = useAdminOne<WorkspaceDetail>(`/workspaces/${id}`);
  const suspend = useAdminAction<WorkspaceDetail, { reason: string }>(
    'POST',
    `/workspaces/${id}/suspend`,
  );
  const reactivate = useAdminAction<WorkspaceDetail, { reason: string }>(
    'POST',
    `/workspaces/${id}/reactivate`,
  );
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);
  const w = q.data;
  return (
    <Drawer title={w?.name ?? 'Workspace'} onClose={onClose}>
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load this workspace.</Notice>}
      {w && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Status value={w.status} />
            <code className="text-xs text-faint">{w.slug}</code>
          </div>
          {w.status === 'SUSPENDED' && (
            <Notice tone="bad">
              Suspended {fmtDate(w.suspendedAt)}: {w.suspendedReason}
            </Notice>
          )}
          <dl className="m-0 grid grid-cols-[130px_1fr] gap-x-3 gap-y-2">
            <dt className="text-faint">Owner</dt>
            <dd className="m-0">{w.owner ? `${w.owner.name} · ${w.owner.email}` : '—'}</dd>
            <dt className="text-faint">Team members</dt>
            <dd className="m-0">{w.members}</dd>
            <dt className="text-faint">Connected channels</dt>
            <dd className="m-0">{w.channels}</dd>
            <dt className="text-faint">Created</dt>
            <dd className="m-0">{fmtDate(w.createdAt)}</dd>
            <dt className="text-faint">Plan</dt>
            <dd className="m-0">
              {w.planName} <Status value={w.subscriptionStatus} />
            </dd>
            {w.subscription && (
              <>
                <dt className="text-faint">Billing</dt>
                <dd className="m-0">
                  {w.subscription.interval === 'YEAR' ? 'Yearly' : 'Monthly'} ·{' '}
                  <Status value={w.subscription.source} />
                  {w.subscription.renewsAt && ` · renews ${fmtDate(w.subscription.renewsAt)}`}
                </dd>
              </>
            )}
          </dl>
          <div className="flex gap-2">
            {w.status === 'ACTIVE' ? (
              <Button
                size="sm"
                variant="outline"
                className="text-danger"
                onClick={() => setDialog('suspend')}
              >
                Suspend workspace
              </Button>
            ) : (
              <Button size="sm" onClick={() => setDialog('reactivate')}>
                Reactivate workspace
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/subscriptions">Subscriptions</Link>
            </Button>
          </div>
          <p className="m-0 text-xs text-faint">
            Only administrative data is shown. Conversations, customers and messages inside the
            workspace are private.
          </p>
        </div>
      )}
      {dialog && w && (
        <ReasonDialog
          title={dialog === 'suspend' ? `Suspend ${w.name}?` : `Reactivate ${w.name}?`}
          danger={dialog === 'suspend'}
          confirmLabel={dialog === 'suspend' ? 'Suspend workspace' : 'Reactivate workspace'}
          body={
            dialog === 'suspend'
              ? 'All members lose access to this workspace immediately. Data is kept.'
              : 'Members get access again.'
          }
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await (dialog === 'suspend' ? suspend : reactivate).mutateAsync({ reason });
            toast(dialog === 'suspend' ? 'Workspace suspended' : 'Workspace reactivated');
          }}
        />
      )}
    </Drawer>
  );
}
