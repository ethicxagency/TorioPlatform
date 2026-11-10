'use client';

import { DEFAULT_CURRENCY } from '@torio/contracts';
import { USAGE_LABEL, USAGE_METRICS } from '@torio/contracts';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import {
  useAdminAction,
  useAdminList,
  useAdminOne,
  type ActivityList,
  type AdminResult,
  type AdminSettings,
  type PlanItem,
  type SubscriptionDetail,
  type SubscriptionList,
} from '../queries';
import { useAdminShell } from './admin-shell';
import {
  Drawer,
  Empty,
  fmtDate,
  fmtDateTime,
  input,
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
} from './common';

// ---------- Subscriptions & billing ----------

export function SubscriptionsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const list = useAdminList<SubscriptionList>('/subscriptions', {
    status: status || undefined,
    q: q || undefined,
    page,
  });
  return (
    <div>
      <PageHead
        title="Subscriptions & Billing"
        description="Every workspace subscription, from the payment provider or granted manually."
        action={
          <Button variant="outline" onClick={() => setAssigning(true)}>
            Assign a plan
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search workspace or owner email"
        />
        <select
          aria-label="Subscription status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={input}
        >
          <option value="">All statuses</option>
          {['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'].map((s) => (
            <option key={s} value={s}>
              {s === 'PAST_DUE' ? 'Past due' : s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        {list.isPending ? (
          <Loading />
        ) : list.isError && !list.data ? (
          <Notice tone="bad">Couldn&apos;t load subscriptions. {list.error.message}</Notice>
        ) : list.data!.data.length === 0 ? (
          <Empty>No subscriptions match.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  {[
                    'Subscription',
                    'Customer',
                    'Workspace',
                    'Plan',
                    'Cycle',
                    'Amount',
                    'Status',
                    'Started',
                    'Renews',
                    '',
                  ].map((h, i) => (
                    <th key={i} scope="col" className={th}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data!.data.map((s) => (
                  <tr key={s.id} className="border-b border-line-subtle last:border-0">
                    <td className={`${td} font-mono text-xs`} title={s.providerSubscriptionId}>
                      {s.providerSubscriptionId.slice(0, 14)}…
                    </td>
                    <td className={td}>{s.customer?.name ?? '—'}</td>
                    <td className={td}>{s.workspace.name}</td>
                    <td className={td}>
                      {s.planName} {s.source === 'MANUAL' && <Status value="MANUAL" />}
                    </td>
                    <td className={td}>{s.interval === 'YEAR' ? 'Yearly' : 'Monthly'}</td>
                    <td className={`${td} tabular-nums`}>
                      {s.amountMinor < 0 || !s.currency ? '—' : money(s.amountMinor, s.currency)}
                    </td>
                    <td className={td}>
                      <Status value={s.status} />
                      {s.cancelAtPeriodEnd && (
                        <span className="ml-1 text-xs text-warning">ending</span>
                      )}
                    </td>
                    <td className={td}>{fmtDate(s.startedAt)}</td>
                    <td className={td}>{fmtDate(s.renewsAt)}</td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`View subscription for ${s.workspace.name}`}
                        onClick={() => setOpen(s.id)}
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
      {open && <SubscriptionDrawer id={open} onClose={() => setOpen(null)} />}
      {assigning && <AssignDialog onClose={() => setAssigning(false)} />}
    </div>
  );
}

function SubscriptionDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useAdminShell();
  const q = useAdminOne<SubscriptionDetail>(`/subscriptions/${id}`);
  const cancel = useAdminAction<AdminResult, { reason: string; atPeriodEnd: boolean }>(
    'POST',
    `/subscriptions/${id}/cancel`,
  );
  const resume = useAdminAction<AdminResult, { reason: string }>(
    'POST',
    `/subscriptions/${id}/resume`,
  );
  const [dialog, setDialog] = useState<'cancel' | 'resume' | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const s = q.data;
  const ended = s && ['CANCELED', 'EXPIRED'].includes(s.status);
  return (
    <Drawer title={s ? `${s.workspace.name} · ${s.planName}` : 'Subscription'} onClose={onClose}>
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load this subscription.</Notice>}
      {s && (
        <div className="flex flex-col gap-5">
          <dl className="m-0 grid grid-cols-[130px_1fr] gap-x-3 gap-y-2">
            <dt className="text-faint">Status</dt>
            <dd className="m-0">
              <Status value={s.status} />{' '}
              {s.cancelAtPeriodEnd && (
                <span className="text-xs text-warning">cancels at period end</span>
              )}
            </dd>
            <dt className="text-faint">Source</dt>
            <dd className="m-0">
              <Status value={s.source} />
              {s.grantReason && <span className="ml-1 text-xs text-muted">“{s.grantReason}”</span>}
            </dd>
            <dt className="text-faint">Customer</dt>
            <dd className="m-0">{s.customer ? `${s.customer.name} · ${s.customer.email}` : '—'}</dd>
            <dt className="text-faint">Billing</dt>
            <dd className="m-0">
              {s.interval === 'YEAR' ? 'Yearly' : 'Monthly'}
              {s.amountMinor >= 0 && s.currency ? ` · ${money(s.amountMinor, s.currency)}` : ''}
            </dd>
            <dt className="text-faint">Started</dt>
            <dd className="m-0">{fmtDate(s.startedAt)}</dd>
            <dt className="text-faint">{s.cancelAtPeriodEnd ? 'Ends' : 'Renews'}</dt>
            <dd className="m-0">{fmtDate(s.renewsAt)}</dd>
            <dt className="text-faint">Provider ID</dt>
            <dd className="m-0 font-mono text-xs">{s.providerSubscriptionId}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-danger"
              disabled={!!ended}
              title={ended ? 'Already ended' : undefined}
              onClick={() => setDialog('cancel')}
            >
              Cancel subscription
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!(s.source === 'PROVIDER' && s.cancelAtPeriodEnd && !ended)}
              title="Only a provider subscription scheduled to cancel can be reactivated"
              onClick={() => setDialog('resume')}
            >
              Reactivate
            </Button>
          </div>
          <section aria-label="Invoices">
            <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
              Invoices
            </h3>
            {s.invoices.length === 0 ? (
              <p className="m-0 text-muted">No invoices.</p>
            ) : (
              <ul className="m-0 list-none divide-y divide-line-subtle rounded-xl border border-line p-0">
                {s.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {i.number ?? 'Invoice'}{' '}
                      <span className="text-xs text-faint">{fmtDate(i.issuedAt)}</span>
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
          <section aria-label="Payment history">
            <h3 className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
              Payment events
            </h3>
            {s.payments.length === 0 ? (
              <p className="m-0 text-muted">No payment events.</p>
            ) : (
              <ul className="m-0 list-none p-0 text-muted">
                {s.payments.map((p, i) => (
                  <li key={i} className="py-0.5">
                    <code className="text-xs">{p.type}</code>{' '}
                    <span className="text-xs text-faint">
                      {p.outcome} · {fmtDateTime(p.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {dialog === 'cancel' && s && (
        <ReasonDialog
          title="Cancel this subscription?"
          danger
          confirmLabel={s.source === 'MANUAL' ? 'End manual plan' : 'Request cancellation'}
          body={
            s.source === 'MANUAL'
              ? 'This manually granted plan ends now. No payment provider is involved.'
              : 'The cancellation is requested from the payment provider. Torio shows it as cancelled only after the provider confirms.'
          }
          extra={
            s.source === 'PROVIDER' && (
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={atEnd}
                  onChange={(e) => setAtEnd(e.target.checked)}
                />{' '}
                Keep access until the end of the billing period
              </label>
            )
          }
          onClose={() => setDialog(null)}
          onConfirm={async (reason) =>
            toast(
              (
                await cancel.mutateAsync({
                  reason,
                  atPeriodEnd: s.source === 'MANUAL' ? true : atEnd,
                })
              ).message,
            )
          }
        />
      )}
      {dialog === 'resume' && (
        <ReasonDialog
          title="Reactivate this subscription?"
          confirmLabel="Request reactivation"
          body="The scheduled cancellation is withdrawn at the payment provider. It shows here once the provider confirms."
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => toast((await resume.mutateAsync({ reason })).message)}
        />
      )}
    </Drawer>
  );
}

function AssignDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useAdminShell();
  const ws = useAdminList<{
    data: { id: string; name: string; owner: { email: string } | null }[];
  }>('/workspaces', { pageSize: 100 });
  const plans = useAdminOne<{ data: PlanItem[] }>('/plans');
  const [wsId, setWsId] = useState('');
  const [planKey, setPlanKey] = useState('');
  const [interval, setInterval] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [endsAt, setEndsAt] = useState('');
  const act = useAdminAction<AdminResult, { id: string; body: object }>(
    'POST',
    (b) => `/workspaces/${b.id}/assign-plan`,
  );
  const usable = (plans.data?.data ?? []).filter((p) => p.status !== 'ARCHIVED');
  return (
    <ReasonDialog
      title="Assign a plan"
      confirmLabel="Assign plan"
      body="For a workspace with no paid provider subscription this grants a complimentary plan (no payment, excluded from revenue). For a paid subscription it asks the payment provider to change the plan, which is only shown once the provider confirms."
      extra={
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12.5px] font-medium sm:col-span-2">
            Workspace
            <select
              aria-label="Workspace"
              value={wsId}
              onChange={(e) => setWsId(e.target.value)}
              className={input}
            >
              <option value="">Choose…</option>
              {(ws.data?.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.owner ? ` (${w.owner.email})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Plan
            <select
              aria-label="Plan"
              value={planKey}
              onChange={(e) => setPlanKey(e.target.value)}
              className={input}
            >
              <option value="">Choose…</option>
              {usable.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.status === 'DISABLED' ? ' (disabled)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Billing cycle
            <select
              aria-label="Billing cycle"
              value={interval}
              onChange={(e) => setInterval(e.target.value as 'MONTH' | 'YEAR')}
              className={input}
            >
              <option value="MONTH">Monthly</option>
              <option value="YEAR">Yearly</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium sm:col-span-2">
            Grant ends (optional, complimentary plans only)
            <input
              type="date"
              aria-label="Grant ends"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className={input}
            />
          </label>
        </div>
      }
      onClose={onClose}
      onConfirm={async (reason) => {
        if (!wsId || !planKey) throw new Error('Choose a workspace and a plan.');
        const r = await act.mutateAsync({
          id: wsId,
          body: {
            planKey,
            interval,
            reason,
            ...(endsAt && { endsAt: new Date(`${endsAt}T23:59:59Z`).toISOString() }),
          },
        });
        toast(r.message);
      }}
    />
  );
}

// ---------- Plans ----------

const blank = {
  key: '',
  name: '',
  description: '',
  rank: 1,
  recommended: false,
  currency: DEFAULT_CURRENCY as string,
  monthly: '',
  yearly: '',
  placeholder: false,
  aiCredits: '',
  features: '',
  priceIdMonth: '',
  priceIdYear: '',
  limits: Object.fromEntries(USAGE_METRICS.map((m) => [m, ''])) as Record<string, string>,
};
type Form = typeof blank;
const toForm = (p: PlanItem): Form => ({
  key: p.key,
  name: p.name,
  description: p.description,
  rank: p.rank,
  recommended: p.recommended,
  currency: p.currency,
  monthly: (p.monthlyMinor / 100).toFixed(2),
  yearly: (p.yearlyMinor / 100).toFixed(2),
  placeholder: p.placeholderPricing,
  aiCredits: p.aiCredits < 0 ? '' : String(p.aiCredits),
  features: p.features.join('\n'),
  priceIdMonth: p.priceIdMonth ?? '',
  priceIdYear: p.priceIdYear ?? '',
  limits: Object.fromEntries(
    USAGE_METRICS.map((m) => [
      m,
      p.limits[m] === -1 || p.limits[m] === undefined ? '' : String(p.limits[m]),
    ]),
  ),
});
const minor = (v: string) =>
  /^\d+(\.\d{1,2})?$/.test(v.trim()) ? Math.round(Number(v) * 100) : null;

export function PlansPage() {
  const q = useAdminOne<{ data: PlanItem[] }>('/plans');
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null);
  const [status, setStatus] = useState<{
    plan: PlanItem;
    to: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  } | null>(null);
  const { toast } = useAdminShell();
  const act = useAdminAction<PlanItem, { key: string; status: string; reason: string }>(
    'POST',
    (b) => `/plans/${b.key}/status`,
  );
  return (
    <div>
      <PageHead
        title="Plans & Pricing"
        description="The plan catalog customers choose from."
        action={<Button onClick={() => setEditing('new')}>Create plan</Button>}
      />
      <Notice tone="warn">
        Editing a plan changes what <b>new</b> subscriptions and plan changes get. Existing
        subscribers keep the limits and features they signed up with. Prices here are for display:
        what is charged is the price configured at the payment provider.
      </Notice>
      <div className="mt-3">
        <Panel>
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <Notice tone="bad">Couldn&apos;t load plans.</Notice>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line-subtle">
                    {[
                      'Plan',
                      'Monthly',
                      'Yearly',
                      'Members',
                      'Channels',
                      'AI credits',
                      'Subscribers',
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
                  {q.data!.data.map((p) => (
                    <tr key={p.key} className="border-b border-line-subtle last:border-0">
                      <td className={`${td} font-medium`}>
                        {p.name} <span className="text-xs font-normal text-faint">{p.key}</span>
                        {p.placeholderPricing && (
                          <span className="ml-1 rounded bg-warning-soft px-1 text-[10.5px] text-warning">
                            placeholder
                          </span>
                        )}
                      </td>
                      <td className={`${td} tabular-nums`}>{money(p.monthlyMinor, p.currency)}</td>
                      <td className={`${td} tabular-nums`}>{money(p.yearlyMinor, p.currency)}</td>
                      <td className={`${td} tabular-nums`}>
                        {p.limits.members === -1 ? 'Unlimited' : p.limits.members}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {p.limits.channels === -1 ? 'Unlimited' : p.limits.channels}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {p.aiCredits < 0 ? '—' : p.aiCredits}
                      </td>
                      <td className={`${td} tabular-nums`}>{p.subscribers}</td>
                      <td className={td}>
                        <Status plan value={p.status} />
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {p.status !== 'ARCHIVED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setEditing(p)}
                          >
                            Edit
                          </Button>
                        )}{' '}
                        {p.status === 'DISABLED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Enable ${p.name}`}
                            onClick={() => setStatus({ plan: p, to: 'ACTIVE' })}
                          >
                            Enable
                          </Button>
                        )}
                        {p.status === 'ACTIVE' && p.key !== 'free' && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Disable ${p.name}`}
                            onClick={() => setStatus({ plan: p, to: 'DISABLED' })}
                          >
                            Disable
                          </Button>
                        )}{' '}
                        {p.status !== 'ARCHIVED' && p.key !== 'free' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            aria-label={`Archive ${p.name}`}
                            disabled={p.subscribers > 0}
                            title={p.subscribers > 0 ? 'In use by active subscriptions' : undefined}
                            onClick={() => setStatus({ plan: p, to: 'ARCHIVED' })}
                          >
                            Archive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {editing && (
        <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {status && (
        <ReasonDialog
          title={`${status.to === 'ACTIVE' ? 'Enable' : status.to === 'DISABLED' ? 'Disable' : 'Archive'} ${status.plan.name}?`}
          danger={status.to === 'ARCHIVED'}
          confirmLabel={
            status.to === 'ACTIVE'
              ? 'Enable plan'
              : status.to === 'DISABLED'
                ? 'Disable plan'
                : 'Archive plan'
          }
          body={
            status.to === 'ACTIVE'
              ? 'Customers can choose this plan.'
              : status.to === 'DISABLED'
                ? 'Nobody new can choose this plan. Existing subscribers are unaffected.'
                : 'The plan is retired permanently. Plans with active subscribers can’t be archived.'
          }
          onClose={() => setStatus(null)}
          onConfirm={async (reason) => {
            await act.mutateAsync({ key: status.plan.key, status: status.to, reason });
            toast(
              `${status.plan.name} ${status.to === 'ACTIVE' ? 'enabled' : status.to === 'DISABLED' ? 'disabled' : 'archived'}`,
            );
          }}
        />
      )}
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: PlanItem | null; onClose: () => void }) {
  const { toast } = useAdminShell();
  const [f, setF] = useState<Form>(plan ? toForm(plan) : blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = useAdminAction<PlanItem, object>('POST', '/plans');
  const update = useAdminAction<PlanItem, object>('PATCH', `/plans/${plan?.key ?? ''}`);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const monthlyMinor = minor(f.monthly);
    const yearlyMinor = minor(f.yearly);
    if (!f.name.trim()) return setError('Enter a plan name.');
    if (!plan && !/^[a-z][a-z0-9-]{1,29}$/.test(f.key))
      return setError('Key: 2–30 lowercase letters, digits or dashes, starting with a letter.');
    if (monthlyMinor === null || yearlyMinor === null) return setError('Enter prices like 19.00.');
    const limits: Record<string, number | null> = {};
    for (const m of USAGE_METRICS) {
      const v = f.limits[m]!.trim();
      if (v === '') limits[m] = null;
      else if (/^\d+$/.test(v)) limits[m] = Number(v);
      else
        return setError(`${USAGE_LABEL[m]}: enter a whole number, or leave empty for unlimited.`);
    }
    if (f.aiCredits.trim() && !/^\d+$/.test(f.aiCredits.trim()))
      return setError('AI credits must be a whole number.');
    const body = {
      name: f.name.trim(),
      description: f.description.trim(),
      rank: Number(f.rank),
      recommended: f.recommended,
      currency: f.currency,
      monthlyMinor,
      yearlyMinor,
      placeholderPricing: f.placeholder,
      limits,
      aiCredits: f.aiCredits.trim() ? Number(f.aiCredits) : null,
      features: f.features
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      priceIdMonth: f.priceIdMonth.trim() || null,
      priceIdYear: f.priceIdYear.trim() || null,
    };
    setBusy(true);
    setError('');
    try {
      if (plan) await update.mutateAsync(body);
      else await create.mutateAsync({ key: f.key, ...body });
      toast(
        plan
          ? 'Plan saved. Existing subscribers are unchanged.'
          : 'Plan created as disabled. Enable it when ready.',
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the plan');
      setBusy(false);
    }
  };
  const fld = 'flex flex-col gap-1 text-[12.5px] font-medium';
  return (
    <Modal
      title={plan ? `Edit ${plan.name}` : 'Create plan'}
      onClose={busy ? () => undefined : onClose}
      className="sm:max-w-[640px]"
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" noValidate onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={fld}>
          Name
          <input
            aria-label="Plan name"
            value={f.name}
            maxLength={60}
            onChange={(e) => set('name', e.target.value)}
            className={input}
          />
        </label>
        <label className={fld}>
          Key
          {plan ? (
            <span className="font-normal text-faint">{plan.key} (fixed)</span>
          ) : (
            <input
              aria-label="Plan key"
              value={f.key}
              maxLength={30}
              onChange={(e) => set('key', e.target.value)}
              className={input}
            />
          )}
        </label>
        <label className={`${fld} sm:col-span-2`}>
          Description
          <input
            aria-label="Description"
            value={f.description}
            maxLength={200}
            onChange={(e) => set('description', e.target.value)}
            className={input}
          />
        </label>
        <label className={fld}>
          Monthly price
          <input
            aria-label="Monthly price"
            inputMode="decimal"
            value={f.monthly}
            onChange={(e) => set('monthly', e.target.value)}
            className={input}
          />
        </label>
        <label className={fld}>
          Yearly price
          <input
            aria-label="Yearly price"
            inputMode="decimal"
            value={f.yearly}
            onChange={(e) => set('yearly', e.target.value)}
            className={input}
          />
        </label>
        <label className={fld}>
          Currency
          <select
            aria-label="Currency"
            value={f.currency}
            onChange={(e) => set('currency', e.target.value)}
            className={input}
          >
            {['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={fld}>
          Order (higher = bigger plan)
          <input
            aria-label="Rank"
            type="number"
            min={0}
            max={100}
            value={f.rank}
            onChange={(e) => set('rank', Number(e.target.value))}
            className={input}
          />
        </label>
        <fieldset className="m-0 grid gap-3 border-0 p-0 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-1 text-[12.5px] font-medium">Limits (empty = unlimited)</legend>
          {USAGE_METRICS.map((m) => (
            <label key={m} className={fld}>
              {USAGE_LABEL[m]}
              <input
                aria-label={USAGE_LABEL[m]}
                inputMode="numeric"
                value={f.limits[m]}
                onChange={(e) =>
                  setF((x) => ({ ...x, limits: { ...x.limits, [m]: e.target.value } }))
                }
                className={input}
              />
            </label>
          ))}
        </fieldset>
        <label className={fld}>
          AI credits (stored; not metered yet)
          <input
            aria-label="AI credits"
            inputMode="numeric"
            value={f.aiCredits}
            onChange={(e) => set('aiCredits', e.target.value)}
            className={input}
          />
        </label>
        <div className="flex flex-col justify-end gap-1.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.recommended}
              onChange={(e) => set('recommended', e.target.checked)}
            />{' '}
            Recommended
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.placeholder}
              onChange={(e) => set('placeholder', e.target.checked)}
            />{' '}
            Placeholder pricing
          </label>
        </div>
        <label className={`${fld} sm:col-span-2`}>
          Features (one per line)
          <textarea
            aria-label="Features"
            rows={3}
            value={f.features}
            onChange={(e) => set('features', e.target.value)}
            className="rounded-lg border border-line p-2.5 text-[13px] font-normal"
          />
        </label>
        <label className={fld}>
          Provider price ID, monthly
          <input
            aria-label="Provider price ID monthly"
            value={f.priceIdMonth}
            onChange={(e) => set('priceIdMonth', e.target.value)}
            className={input}
          />
        </label>
        <label className={fld}>
          Provider price ID, yearly
          <input
            aria-label="Provider price ID yearly"
            value={f.priceIdYear}
            onChange={(e) => set('priceIdYear', e.target.value)}
            className={input}
          />
        </label>
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ---------- Activity ----------

export function ActivityPage() {
  const [source, setSource] = useState<'admin' | 'payments'>('admin');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [page, setPage] = useState(1);
  const list = useAdminList<ActivityList>('/activity', { source, q: q || undefined, page });
  return (
    <div>
      <PageHead
        title="Activity & Logs"
        description="A read-only record of administrative actions and payment events."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Log source"
          className="inline-flex rounded-xl border border-line bg-white p-0.5"
        >
          {(['admin', 'payments'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => {
                setSource(s);
                setPage(1);
              }}
              className={`h-8 cursor-pointer rounded-[10px] px-3.5 text-[13px] ${source === s ? 'bg-primary-soft font-semibold text-primary-hover' : 'text-muted'}`}
            >
              {s === 'admin' ? 'Admin actions' : 'Payment events'}
            </button>
          ))}
        </div>
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search logs"
        />
      </div>
      <Panel>
        {list.isPending ? (
          <Loading />
        ) : list.isError && !list.data ? (
          <Notice tone="bad">Couldn&apos;t load the log.</Notice>
        ) : list.data!.data.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul className="m-0 list-none divide-y divide-line-subtle p-0">
            {list.data!.data.map((e) => (
              <li key={e.id} className="py-2.5 text-[13px]">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <code className="text-[12.5px] font-semibold">{e.action}</code>
                  {e.target && <span className="text-muted">→ {e.target}</span>}
                  <span className="ml-auto text-xs text-faint">{fmtDateTime(e.at)}</span>
                </div>
                <div className="text-xs text-faint">
                  {e.actor}
                  {e.reason ? ` · Reason: ${e.reason}` : ''}
                </div>
                {e.metadata && (
                  <div className="mt-0.5 break-all text-xs text-faint">
                    {JSON.stringify(e.metadata)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager meta={list.data?.meta} onPage={setPage} />
      </Panel>
    </div>
  );
}

// ---------- Settings ----------

export function SettingsPage() {
  const { toast, admin } = useAdminShell();
  const q = useAdminOne<AdminSettings>('/settings');
  const save = useAdminAction<AdminSettings, object>('PATCH', '/settings');
  const rename = useAdminAction<unknown, { name: string }>('PATCH', '/auth/profile');
  const pw = useAdminAction<unknown, { currentPassword: string; newPassword: string }>(
    'POST',
    '/auth/password',
  );
  const [b, setB] = useState<{
    productName: string;
    legalName: string;
    supportEmail: string;
    invoiceNote: string;
  } | null>(null);
  const [name, setName] = useState(admin.name);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const s = q.data;
  const brand = b ?? s?.branding;
  const field = (k: 'productName' | 'legalName' | 'supportEmail' | 'invoiceNote') => ({
    value: brand?.[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setB({ ...(brand as NonNullable<typeof b>), [k]: e.target.value }),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Settings"
        description="Branding, your profile, and the status of platform connections."
      />
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load settings.</Notice>}
      {s && brand && (
        <>
          <Panel title="Platform branding">
            <form
              noValidate
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr('');
                try {
                  await save.mutateAsync(brand);
                  setB(null);
                  toast('Branding saved');
                } catch (x) {
                  setErr(x instanceof Error ? x.message : 'Could not save');
                }
              }}
            >
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Product name
                <input aria-label="Product name" className={input} {...field('productName')} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Legal name (on invoices)
                <input aria-label="Legal name" className={input} {...field('legalName')} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Support email
                <input
                  aria-label="Support email"
                  type="email"
                  className={input}
                  {...field('supportEmail')}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Invoice note (address, tax ID…)
                <input aria-label="Invoice note" className={input} {...field('invoiceNote')} />
              </label>
              {err && (
                <div className="sm:col-span-2">
                  <Notice tone="bad">{err}</Notice>
                </div>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!b || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save branding'}
                </Button>
              </div>
            </form>
          </Panel>
          <Panel title="Platform configuration">
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                aria-label="Allow new customer registrations"
                checked={s.registrationOpen}
                disabled={save.isPending}
                onChange={(e) =>
                  save.mutate(
                    { registrationOpen: e.target.checked },
                    {
                      onSuccess: () =>
                        toast(e.target.checked ? 'Registrations opened' : 'Registrations closed'),
                      onError: (x) => toast.error(x.message),
                    },
                  )
                }
                className="mt-0.5"
              />
              <span>
                <b>Allow new customer registrations.</b> When off, the public sign-up is refused.
                Existing customers are unaffected.
              </span>
            </label>
          </Panel>
          <Panel title="Connections">
            <dl className="m-0 grid grid-cols-[170px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-faint">Payment provider</dt>
              <dd className="m-0">
                {s.paymentProvider.configured ? (
                  <>
                    <Status value="ACTIVE" /> {s.paymentProvider.provider} connected
                  </>
                ) : (
                  <>
                    <Status value="NONE" /> Not connected
                  </>
                )}
              </dd>
              <dt className="text-faint">Webhook secret</dt>
              <dd className="m-0">{s.paymentProvider.webhookSecretSet ? 'Set' : 'Not set'}</dd>
              <dt className="text-faint">Plans with prices</dt>
              <dd className="m-0">{s.paymentProvider.priceIdsConfigured} configured</dd>
              <dt className="text-faint">Last payment event</dt>
              <dd className="m-0">
                {s.paymentProvider.lastWebhookAt
                  ? fmtDateTime(s.paymentProvider.lastWebhookAt)
                  : 'None received'}
              </dd>
              <dt className="text-faint">Email provider</dt>
              <dd className="m-0">
                <Status value="NONE" /> {s.emailProvider.note}
              </dd>
            </dl>
            <p className="mb-0 mt-3 text-xs text-faint">
              Keys and secrets are set in the server environment and are never shown or returned by
              the API.
            </p>
          </Panel>
        </>
      )}
      <Panel title="Admin profile">
        <div className="grid gap-5 sm:grid-cols-2">
          <form
            noValidate
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await rename.mutateAsync({ name });
                toast('Profile saved');
              } catch (x) {
                toast.error(x instanceof Error ? x.message : 'Failed');
              }
            }}
          >
            <div className="text-xs text-faint">{admin.email}</div>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              Name
              <input
                aria-label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </label>
            <div>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || name === admin.name || rename.isPending}
              >
                Save name
              </Button>
            </div>
          </form>
          <form
            noValidate
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await pw.mutateAsync({ currentPassword: cur, newPassword: next });
                setCur('');
                setNext('');
                toast('Password changed. Other sessions were signed out.');
              } catch (x) {
                toast.error(x instanceof Error ? x.message : 'Failed');
              }
            }}
          >
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              Current password
              <input
                aria-label="Current password"
                type="password"
                autoComplete="current-password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              New password (12+ characters)
              <input
                aria-label="New password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={input}
              />
            </label>
            <div>
              <Button type="submit" size="sm" disabled={!cur || next.length < 12 || pw.isPending}>
                Change password
              </Button>
            </div>
          </form>
        </div>
      </Panel>
    </div>
  );
}
