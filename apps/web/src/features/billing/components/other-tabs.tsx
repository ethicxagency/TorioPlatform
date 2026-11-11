'use client';

import { CreditCard, Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useTimeZone } from '@/features/settings/queries';
import { cn } from '@/lib/utils';
import { useBillingMutations, useBillingProfile, useCards, useInvoice, useUsage } from '../queries';
import type { Overview, SavedCard } from '../types';
import { Card, fmtDate, InvoiceBadge, LEVEL_TEXT, money, Notice, Progress } from './bits';

// ---------- Usage ----------

export function UsageTab({ ws, go }: { ws: string; o?: Overview; go: (t: string) => void }) {
  const q = useUsage(ws);
  const tz = useTimeZone();
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <Notice tone="bad">Couldn&apos;t load usage.</Notice>;
  const u = q.data;
  const pressed = u.data.some(
    (d) => d.level === 'approaching' || d.level === 'near' || d.level === 'reached',
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs text-muted">
        {fmtDate(u.periodStart, tz)} – {fmtDate(u.periodEnd, tz)} · counted from your real data ·
        limits are warnings only; usage isn&apos;t blocked.
      </p>
      {pressed && (
        <Notice tone="warn">
          Some usage is at or near your plan&apos;s limits.{' '}
          <button
            type="button"
            onClick={() => go('plans')}
            className="cursor-pointer font-semibold underline"
          >
            Upgrade plan
          </button>
        </Notice>
      )}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
        {u.data.map((d) => (
          <li key={d.metric} className="rounded-card border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{d.label}</span>
              <span
                className={cn(
                  'text-xs font-medium',
                  d.level === 'reached'
                    ? 'text-danger'
                    : d.level === 'near' || d.level === 'approaching'
                      ? 'text-warning'
                      : 'text-faint',
                )}
              >
                {LEVEL_TEXT[d.level]}
              </span>
            </div>
            <div className="mt-2 text-[19px] font-semibold tabular-nums">
              {d.used.toLocaleString()}
              <span className="text-[13px] font-normal text-faint">
                {' '}
                / {d.limit < 0 ? 'unlimited' : d.limit.toLocaleString()}
              </span>
            </div>
            <div className="mt-2">
              <Progress percent={d.percent} level={d.level} label={d.label} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-faint">
              <span>{d.limit < 0 ? 'No limit' : `${d.percent}% used`}</span>
              <span>{d.limit < 0 ? '' : `${d.remaining.toLocaleString()} remaining`}</span>
            </div>
          </li>
        ))}
      </ul>
      <Card title="Not tracked yet">
        <p className="m-0 text-[13px] text-muted">
          {u.notTracked.join(', ')}: the application doesn&apos;t measure these yet, so no number is
          shown rather than an invented one.
        </p>
      </Card>
    </div>
  );
}

// ---------- Payment methods ----------

export function CardsTab({ ws, o, canManage }: { ws: string; o: Overview; canManage: boolean }) {
  const { toast } = useShell();
  const q = useCards(ws);
  const m = useBillingMutations(ws);
  const [removing, setRemoving] = useState<SavedCard | null>(null);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const off = !o.providerConfigured
    ? 'Payments aren’t connected yet'
    : !canManage
      ? 'Only the workspace owner can manage payment methods'
      : undefined;
  return (
    <Card
      title="Payment methods"
      action={
        <Button
          size="sm"
          disabled={!!off || m.cardSession.isPending}
          title={off}
          onClick={() =>
            m.cardSession.mutate(undefined, {
              onSuccess: (r) => window.location.assign(r.url),
              onError: err,
            })
          }
        >
          <CreditCard size={13} /> Add payment method
        </Button>
      }
    >
      <p className="m-0 mb-3 text-xs text-faint">
        Cards are entered on the payment provider&apos;s page. Torio keeps only the brand, last four
        digits and expiry.
      </p>
      {q.isPending && <Skeleton className="h-20 w-full" />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load payment methods.</Notice>}
      {q.data && q.data.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          No saved payment methods.
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="m-0 list-none divide-y divide-line-subtle rounded-xl border border-line p-0">
          {q.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3 text-[13px]">
              <CreditCard size={18} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium capitalize">{c.brand}</span> •••• {c.last4}
                <span className="block text-xs text-faint">
                  Expires {String(c.expMonth).padStart(2, '0')}/{c.expYear}
                </span>
              </span>
              {c.isDefault && (
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary-hover">
                  Default
                </span>
              )}
              {!c.isDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!off || m.makeDefault.isPending}
                  title={off}
                  onClick={() =>
                    m.makeDefault.mutate(c.id, {
                      onSuccess: () => toast('Default payment method updated'),
                      onError: err,
                    })
                  }
                >
                  Make default
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-danger"
                disabled={!!off}
                title={off}
                onClick={() => setRemoving(c)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.brand} •••• ${removing.last4}?`}
          body="The card is removed from your account at the payment provider. Future charges can’t use it."
          confirmLabel="Remove"
          busy={m.removeCard.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            m.removeCard.mutate(removing.id, {
              onSuccess: () => {
                toast('Payment method removed');
                setRemoving(null);
              },
              onError: (e) => {
                err(e);
                setRemoving(null);
              },
            })
          }
        />
      )}
    </Card>
  );
}

// ---------- Invoice details ----------

export function InvoiceDrawer({
  ws,
  id,
  onClose,
  onDownload,
}: {
  ws: string;
  id: string;
  onClose: () => void;
  onDownload: (n: string) => void;
}) {
  const { registerEscape } = useShell();
  const tz = useTimeZone();
  const q = useInvoice(ws, id);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);
  const i = q.data;
  const c = i?.customer;
  return (
    <>
      <div className="fixed inset-0 z-[70] glass-scrim" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Invoice details"
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[520px]"
      >
        <header className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <h2 className="m-0 flex-1 text-base font-semibold">Invoice {i?.number ?? ''}</h2>
          {i && <InvoiceBadge status={i.status} />}
          <button
            ref={closeRef}
            type="button"
            aria-label="Close invoice"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          {q.isPending && <Skeleton className="h-40 w-full" />}
          {q.isError && <Notice tone="bad">Couldn&apos;t load this invoice.</Notice>}
          {i && c && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-faint">From</div>
                  <div className="font-medium">{i.seller.name}</div>
                  <div className="text-xs text-muted">{i.seller.note}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Bill to</div>
                  <div className="font-medium">
                    {c.companyName ?? c.contactName ?? 'No billing details saved'}
                  </div>
                  <div className="text-xs text-muted">
                    {[c.addressLine, c.city, c.state, c.postalCode, c.country]
                      .filter(Boolean)
                      .join(', ')}
                    {c.billingEmail && <div>{c.billingEmail}</div>}
                    {c.taxId && <div>Tax ID: {c.taxId}</div>}
                  </div>
                </div>
              </div>
              <dl className="m-0 mb-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-faint">Invoice date</dt>
                <dd className="m-0">{fmtDate(i.issuedAt, tz)}</dd>
                <dt className="text-faint">Billing period</dt>
                <dd className="m-0">
                  {i.periodStart
                    ? `${fmtDate(i.periodStart, tz)} – ${fmtDate(i.periodEnd, tz)}`
                    : '—'}
                </dd>
                <dt className="text-faint">Plan</dt>
                <dd className="m-0 capitalize">{i.planKey ?? '—'}</dd>
                <dt className="text-faint">Payment</dt>
                <dd className="m-0">
                  {i.paymentSummary ?? (i.status === 'PAID' ? 'Paid' : 'Not paid')}
                </dd>
              </dl>
              <table className="mb-3 w-full border-collapse">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-xs text-faint">
                    <th className="py-1.5 font-medium">Item</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {i.lines.map((l, k) => (
                    <tr key={k} className="border-b border-line-subtle">
                      <td className="py-2">
                        {l.quantity} × {l.description}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(l.amountMinor, i.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ml-auto flex w-[220px] flex-col gap-1">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{money(i.subtotalMinor, i.currency)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Tax</span>
                  <span className="tabular-nums">{money(i.taxMinor, i.currency)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(i.totalMinor, i.currency)}</span>
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <Button onClick={() => onDownload(i.number ?? 'invoice')}>
                  <Download size={14} /> Download PDF
                </Button>
                {i.hostedUrl && (
                  <Button asChild variant="outline">
                    <a href={i.hostedUrl} target="_blank" rel="noopener noreferrer">
                      Open provider invoice
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------- Billing information ----------

const FIELDS = [
  ['companyName', 'Business / company name', 'organization'],
  ['contactName', 'Contact name', 'name'],
  ['billingEmail', 'Billing email', 'email'],
  ['phone', 'Phone number', 'tel'],
  ['country', 'Country (2-letter code)', 'country'],
  ['state', 'State / region', 'address-level1'],
  ['city', 'City', 'address-level2'],
  ['addressLine', 'Street address', 'street-address'],
  ['postalCode', 'Postal code', 'postal-code'],
  ['taxId', 'VAT / Tax ID (optional)', 'off'],
] as const;
type FieldKey = (typeof FIELDS)[number][0];

export function InfoTab({ ws, canManage }: { ws: string; canManage: boolean }) {
  const { toast } = useShell();
  const q = useBillingProfile(ws);
  const m = useBillingMutations(ws);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const p = q.data;
  const start = () => {
    setForm(Object.fromEntries(FIELDS.map(([k]) => [k, p?.[k] ?? ''])) as Record<FieldKey, string>);
    setErrs({});
    setEditing(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (m.saveProfile.isPending) return;
    const next: Record<string, string> = {};
    if (form.billingEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.billingEmail))
      next.billingEmail = 'Enter a valid email address';
    if (form.country && !/^[A-Za-z]{2}$/.test(form.country))
      next.country = 'Use a 2-letter code, e.g. BD';
    setErrs(next);
    if (Object.keys(next).length) return;
    m.saveProfile.mutate(Object.fromEntries(FIELDS.map(([k]) => [k, form[k].trim()])) as never, {
      onSuccess: () => {
        setEditing(false);
        toast('Billing information saved');
      },
      onError: (er) => {
        const d = (er as { details?: { path: string; message: string }[] }).details ?? [];
        setErrs({ form: er.message, ...Object.fromEntries(d.map((x) => [x.path, x.message])) });
      },
    });
  };
  return (
    <Card
      title="Billing information"
      action={
        !editing && (
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || !p}
            title={canManage ? undefined : 'Only the workspace owner can edit billing information'}
            onClick={start}
          >
            Edit billing information
          </Button>
        )
      }
    >
      {q.isPending && <Skeleton className="h-48 w-full" />}
      {q.isError && <Notice tone="bad">Couldn&apos;t load billing information.</Notice>}
      {p && !editing && (
        <dl className="m-0 grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-[13px]">
          {FIELDS.map(([k, label]) => (
            <div key={k} className="contents">
              <dt className="text-faint">{label}</dt>
              <dd className="m-0">{p[k] ?? <span className="text-faint">Not set</span>}</dd>
            </div>
          ))}
        </dl>
      )}
      {p && editing && (
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, label, ac]) => (
            <label key={k} className="flex flex-col gap-1 text-[12.5px] font-medium">
              {label}
              <input
                value={form[k] ?? ''}
                autoComplete={ac}
                aria-invalid={!!errs[k]}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [k]: e.target.value }));
                  setErrs((x) => ({ ...x, [k]: '' }));
                }}
                className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] font-normal aria-[invalid=true]:border-danger"
              />
              {errs[k] && (
                <span role="alert" className="text-xs font-normal text-danger">
                  {errs[k]}
                </span>
              )}
            </label>
          ))}
          {errs.form && (
            <div className="sm:col-span-2">
              <Notice tone="bad">{errs.form}</Notice>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={m.saveProfile.isPending}>
              {m.saveProfile.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={m.saveProfile.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
