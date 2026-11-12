'use client';

import {
  ArrowLeft,
  Ban,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Check,
  Circle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  StickyNote,
  Trash2,
  Truck,
} from 'lucide-react';
import {
  editBlockReason,
  fulfillmentBlockReason,
  paymentBlockReason,
  statusBlockReason,
} from '@torio/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { AREA, CONTROL } from '@/components/ui/input';
import { ActionMenu } from '@/components/ui/menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime } from '@/lib/datetime';
import { useBrain } from '@/features/brain/queries';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CHANNEL_LABEL, NEXT_STATUS } from '../constants';
import { formatMoney } from '../money';
import {
  downloadInvoice,
  downloadOrdersCsv,
  printInvoice,
  useOrder,
  useOrderMutations,
  type OrderStatusTarget,
  type UpdateOrderBody,
} from '../queries';
import { EMPTY_ORDER_FILTERS, type OrderDetail } from '../types';
import { FulfillmentBadge, OrderStatusBadge, PaymentBadge, SampleTag } from './badges';
import { FulfillmentDialog, PaymentDialog } from './order-dialogs';
import {
  LinesEditor,
  parsePricing,
  PricingFields,
  TotalsSummary,
  validateLines,
} from './order-fields';
import { CourierMark, ItemsTable, OrderProgress, PaymentRow } from './order-parts';
import { UnsavedActionDialog } from './unsaved-action-dialog';
import { CLEAN, dirtyOf, draftFromOrder, type Draft } from '../order-draft';
import { useUnsavedGuard } from '../use-unsaved-guard';

const safeHref = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

function Row({
  label,
  value,
  strong,
  faint,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  faint?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        strong ? 'font-semibold text-ink' : faint ? 'text-faint' : 'text-muted',
        warn && 'text-[#92580A]',
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function UnsavedTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#9AA0AB]" />
      Unsaved
    </span>
  );
}

function SectionAction({
  dirty,
  canEdit,
  onEdit,
}: {
  dirty: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (dirty) return <UnsavedTag />;
  if (!canEdit) return null;
  return (
    <button
      type="button"
      onClick={onEdit}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[12.5px] font-medium text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary print:hidden"
    >
      <Pencil size={12} aria-hidden />
      Edit
    </button>
  );
}

/** Neutral, never error-styled: unsaved edits are normal work in progress. */
function SaveState({ saving, dirty, saved }: { saving: boolean; dirty: boolean; saved: boolean }) {
  if (saving)
    return (
      <span
        role="status"
        className="inline-flex animate-fade-in items-center gap-1.5 text-xs text-muted"
      >
        <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
        Saving...
      </span>
    );
  if (dirty)
    return (
      <span
        role="status"
        className="inline-flex animate-fade-in items-center gap-1.5 text-xs text-muted"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#9AA0AB]" />
        Unsaved changes
      </span>
    );
  if (saved)
    return (
      <span
        role="status"
        className="inline-flex animate-fade-in items-center gap-1.5 text-xs text-success"
      >
        <Check size={12} aria-hidden />
        All changes saved
      </span>
    );
  return null;
}

const EVENT_TITLE: Record<string, string> = {
  created: 'Order created',
  payment: 'Payment recorded',
  status: 'Status changed',
  fulfillment: 'Fulfillment updated',
  note: 'Note added',
  updated: 'Order updated',
};
const EVENT_PREVIEW = 6;

const EVENT_ICON: Record<string, typeof Circle> = {
  created: Plus,
  payment: CreditCard,
  status: RefreshCw,
  fulfillment: Truck,
  note: StickyNote,
  updated: Pencil,
};

/** Full-page order details (Shopify-style): main column for items, payments and history, context column for totals. */
export function OrderDetailsPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { toast } = useShell();
  const { workspaceId: ws, can, isLoading: wsLoading } = useWorkspace();
  const canWrite = can('orders:write');
  const canPayments = can('orders:payments');
  const { user } = useAuth();
  const tz = useTimeZone();
  const fmtFull = (iso: string) => fmtDateTime(iso, tz);
  const q = useOrder(ws, orderId);
  const m = useOrderMutations(ws);
  // The store's enabled couriers, offered when adding shipment details. Quietly absent if the user cannot read the Brain.
  const brain = useBrain(ws);
  const couriers = brain.data?.config.shipping.providers ?? [];
  const o: OrderDetail | undefined = q.data;
  const [dialog, setDialog] = useState<'pay' | 'ship' | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | null>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [actionGuard, setActionGuard] = useState<{ label: string; run: () => void } | null>(null);
  const base = useMemo(() => (o ? draftFromOrder(o) : null), [o]);
  const d = draft && base ? dirtyOf(base, draft) : CLEAN;
  const dirty = d.any;
  const saving = m.update.isPending;
  const guard = useUnsavedGuard(dirty);
  const itemsLocked = o ? editBlockReason(o) : null;
  const v = draft ? validateLines(draft.lines) : null;
  const pr = draft ? parsePricing(draft.pricing) : null;
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(t);
  }, [justSaved]);
  const openConversation = (id: string) =>
    guard.attempt(() => router.push(`/inbox?conversation=${id}`));
  /** Actions that run on the saved order: with edits pending they first ask what to do with them. */
  const act = (label: string, run: () => void) => (dirty ? setActionGuard({ label, run }) : run());
  const startEdit = () => {
    if (!o) return;
    setDraft(draftFromOrder(o));
    setTouched(false);
    setSaveError('');
  };
  const stopEditing = () => {
    setDraft(null);
    setTouched(false);
    setSaveError('');
  };
  const save = async (): Promise<boolean> => {
    if (!o || !draft || !dirty || !v || !pr) return true;
    setTouched(true);
    const valid =
      !!itemsLocked ||
      (v.items.length === draft.lines.length && Object.keys(pr.errors).length === 0);
    if (!valid) {
      setSaveError('Fix the highlighted fields, then save again.');
      requestAnimationFrame(() => {
        const el =
          document.querySelector<HTMLElement>('[aria-invalid="true"]') ??
          document.querySelector<HTMLElement>('[data-line-error]');
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el?.focus?.();
      });
      return false;
    }
    // Pricing fields are saved together with the items so the server recomputes the total once.
    const body: UpdateOrderBody = {};
    if (!itemsLocked && (d.items || d.pricing))
      Object.assign(body, {
        items: v.items,
        discountMinor: pr.discount,
        shippingMinor: pr.shipping,
        taxMinor: pr.tax,
      });
    if (d.ship) {
      body.shippingAddress = draft.address.trim() || null;
      body.shippingMethod = draft.method.trim() || null;
    }
    if (!Object.keys(body).length) return true;
    setSaveError('');
    try {
      await m.update.mutateAsync({ id: o.id, body });
      stopEditing();
      setJustSaved(true);
      toast('Order changes saved');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save the changes';
      setSaveError(msg);
      toast.error(msg);
      return false;
    }
  };
  const exportOrder = async () => {
    if (!ws) return;
    try {
      await downloadOrdersCsv(ws, EMPTY_ORDER_FILTERS, [orderId]);
      toast('Export started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    }
  };
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  /** The invoice is rendered by the server from this order; only that document is printed or saved. */
  const invoiceAction = async (kind: 'print' | 'download') => {
    if (!ws || invoiceBusy) return;
    setInvoiceBusy(true);
    try {
      if (kind === 'print') await printInvoice(ws, orderId);
      else {
        await downloadInvoice(ws, orderId);
        toast('Invoice downloaded');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the invoice');
    } finally {
      setInvoiceBusy(false);
    }
  };
  /** Back to the list as the user left it: the list restores its own search, filters and page. */
  const back = () => guard.attempt(() => router.push('/orders'));

  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const next = o ? NEXT_STATUS[o.status] : undefined;
  const nextBlock = o && next ? statusBlockReason(o, next.to) : null;
  const cancelBlock = o ? statusBlockReason(o, 'CANCELLED') : null;
  const payBlock = o ? paymentBlockReason(o) : null;
  const shipBlock = o ? fulfillmentBlockReason(o, 'FULFILLED') : null;
  const editBlock = o
    ? o.status === 'CANCELLED' || o.status === 'COMPLETED'
      ? `A ${o.status.toLowerCase()} order can’t be edited`
      : null
    : null;

  const primaryIsPay =
    !!canPayments && !payBlock && !!o && o.outstandingMinor > 0 && !(canWrite && next);
  const [allEvents, setAllEvents] = useState(false);
  const shownEvents = o ? (allEvents ? o.events : o.events.slice(0, EVENT_PREVIEW)) : [];
  const hasShipment = !!(
    o &&
    (o.shippingMethod ||
      o.carrier ||
      o.trackingNumber ||
      o.shippedAt ||
      o.completedAt ||
      o.cancelledAt)
  );
  const submitNote = () => {
    const body = note.trim();
    if (!o || !body || m.addNote.isPending) return;
    m.addNote.mutate({ id: o.id, body }, { onSuccess: () => setNote(''), onError: err });
  };

  const setStatus = (status: OrderStatusTarget, ok: string) =>
    m.setStatus.mutate({ id: orderId, status }, { onSuccess: () => toast(ok), onError: err });

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!can('orders:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Orders in this workspace.
      </div>
    );
  const notFound = q.isError && /404|not found/i.test(q.error.message);

  return (
    <>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-10 pt-5 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-[13px]">
          <button
            type="button"
            onClick={back}
            className="inline-flex cursor-pointer items-center gap-1 rounded border-none bg-transparent p-0 text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to Orders
          </button>
        </nav>

        {q.isPending && (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading order">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full bg-wash-2" />
            <Skeleton className="h-56 w-full bg-wash-2" />
          </div>
        )}
        {q.isError && (
          <div
            role="alert"
            className="rounded-card border border-line bg-white px-6 py-14 text-center"
          >
            <div className="text-[15px] font-semibold text-ink">
              {notFound ? 'Order not found' : 'Couldn’t load this order'}
            </div>
            <div className="mx-auto mb-4 mt-1 max-w-[360px] text-[13px] text-muted">
              {notFound ? 'It may have been removed, or the link is wrong.' : q.error.message}
            </div>
            <div className="flex justify-center gap-2">
              {!notFound && (
                <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
                  Try again
                </Button>
              )}
              <Button size="sm" onClick={back}>
                Back to Orders
              </Button>
            </div>
          </div>
        )}

        {o && (
          <>
            <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="min-w-0">
                <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-page-title">
                  Order #{o.number}
                  {o.isSample && <SampleTag />}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <OrderStatusBadge status={o.status} />
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
                    Payment <PaymentBadge status={o.paymentStatus} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
                    Fulfillment <FulfillmentBadge status={o.fulfillmentStatus} />
                  </span>
                  <SaveState saving={saving} dirty={dirty} saved={justSaved} />
                </div>
                <p className="mb-0 mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted">
                  <time dateTime={o.createdAt}>{fmtFull(o.createdAt)}</time>
                  <span aria-hidden>·</span>
                  <span>{o.customer.name}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <ChannelIcon channel={o.channel} size={13} />
                    {CHANNEL_LABEL[o.channel]}
                  </span>
                  {o.createdBy && (
                    <>
                      <span aria-hidden>·</span>
                      <span>created by {o.createdBy.name}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 print:hidden lg:shrink-0 lg:flex-nowrap lg:justify-end">
                <Button
                  variant="outline"
                  loading={invoiceBusy}
                  onClick={() => void invoiceAction('print')}
                >
                  <Printer size={14} />
                  Print invoice
                </Button>
                {canPayments && !primaryIsPay && (
                  <Button
                    variant="outline"
                    disabled={!!payBlock}
                    title={payBlock ?? undefined}
                    onClick={() => act('Recording a payment', () => setDialog('pay'))}
                  >
                    <CreditCard size={14} />
                    Record payment
                  </Button>
                )}
                {canWrite && (
                  <Button
                    variant="outline"
                    aria-pressed={!!draft}
                    disabled={!!editBlock || saving || (!!draft && dirty)}
                    title={
                      editBlock ??
                      (draft && dirty ? 'Save or discard your changes first' : undefined)
                    }
                    onClick={() => (draft ? stopEditing() : startEdit())}
                  >
                    <Pencil size={14} />
                    {draft ? 'Editing' : 'Edit'}
                  </Button>
                )}
                {canWrite && !editBlock && draft && (
                  <>
                    {dirty && (
                      <Button variant="ghost" disabled={saving} onClick={stopEditing}>
                        Discard
                      </Button>
                    )}
                    <Button
                      loading={saving}
                      disabled={!dirty}
                      onClick={() => void save()}
                      className="disabled:bg-wash-2 disabled:text-faint disabled:opacity-100 disabled:shadow-none"
                    >
                      {saving ? 'Saving...' : 'Save changes'}
                    </Button>
                  </>
                )}
                {primaryIsPay ? (
                  <Button onClick={() => act('Recording a payment', () => setDialog('pay'))}>
                    <CreditCard size={14} />
                    Record payment
                  </Button>
                ) : (
                  next &&
                  canWrite && (
                    <Button
                      disabled={!!nextBlock || m.setStatus.isPending || saving}
                      title={nextBlock ?? undefined}
                      onClick={() =>
                        act(next.label, () => setStatus(next.to, `Order ${next.to.toLowerCase()}`))
                      }
                    >
                      {m.setStatus.isPending ? 'Updating…' : next.label}
                    </Button>
                  )
                )}
                <ActionMenu
                  label="More actions"
                  width={220}
                  items={[
                    canWrite && {
                      label: 'Update fulfillment',
                      icon: Truck,
                      disabled: !!shipBlock,
                      title: shipBlock ?? undefined,
                      onSelect: () => act('Updating fulfillment', () => setDialog('ship')),
                    },
                    {
                      label: 'Download invoice (PDF)',
                      icon: FileText,
                      onSelect: () => void invoiceAction('download'),
                    },
                    {
                      label: 'Export order (CSV)',
                      icon: Download,
                      onSelect: () => void exportOrder(),
                    },
                    canWrite && {
                      label: 'Cancel order',
                      icon: Ban,
                      danger: true,
                      disabled: !!cancelBlock,
                      title: cancelBlock ?? undefined,
                      onSelect: () => act('Cancelling', () => setConfirm('cancel')),
                    },
                  ]}
                />
              </div>
            </header>
            <OrderProgress order={o} fmt={fmtFull} />
            {saveError && (
              <div
                role="alert"
                className="rounded-lg border border-[#F4C7C7] bg-danger-soft px-3 py-2 text-[13px] text-[#8F2424]"
              >
                {saveError} Your edits are still here.
              </div>
            )}
            {!canPayments && (
              <p className="m-0 text-xs text-faint">
                Recording payments needs an Owner or Admin role.
              </p>
            )}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]">
              {/* Main column */}
              <div className="flex min-w-0 flex-col gap-5">
                <section
                  aria-label="Financial overview"
                  className="grid grid-cols-3 divide-x divide-line-subtle rounded-card border border-line bg-white lg:hidden"
                >
                  {(
                    [
                      ['Total', o.totalMinor, ''],
                      ['Paid', o.paidMinor, o.paidMinor > 0 ? 'text-success' : ''],
                      [
                        'Due',
                        o.outstandingMinor,
                        o.outstandingMinor > 0 && o.status !== 'CANCELLED' ? 'text-[#92580A]' : '',
                      ],
                    ] as const
                  ).map(([label, v, tone]) => (
                    <div key={label} className="min-w-0 px-3 py-2.5">
                      <div className="text-[11.5px] text-muted">{label}</div>
                      <div
                        className={cn(
                          'truncate text-[15px] font-semibold tabular-nums text-ink',
                          tone,
                        )}
                      >
                        {formatMoney(v, o.currency)}
                      </div>
                    </div>
                  ))}
                </section>

                <Card as="section" aria-label="Items">
                  <CardHeader
                    as="h2"
                    title="Items"
                    description={`${o.items.length} line${o.items.length === 1 ? '' : 's'} · ${o.items.reduce((n, i) => n + i.quantity, 0)} unit${o.items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}`}
                    action={
                      <SectionAction
                        dirty={d.items || d.pricing}
                        canEdit={canWrite && !editBlock && !draft}
                        onEdit={startEdit}
                      />
                    }
                    className="mb-3"
                  />
                  {draft && itemsLocked && (
                    <p className="mb-3 mt-0 rounded-lg bg-wash px-2.5 py-2 text-xs text-muted">
                      {itemsLocked}. Shipping details can still be edited below.
                    </p>
                  )}
                  {draft && !itemsLocked && v && pr ? (
                    <fieldset
                      disabled={saving}
                      className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
                    >
                      <LinesEditor
                        lines={draft.lines}
                        currency={o.currency}
                        errors={touched ? v.errors : {}}
                        onChange={(lines) => setDraft({ ...draft, lines })}
                      />
                      <PricingFields
                        value={draft.pricing}
                        currency={o.currency}
                        errors={touched ? pr.errors : {}}
                        onChange={(pricing) => setDraft({ ...draft, pricing })}
                      />
                      <TotalsSummary items={v.items} pricing={pr} currency={o.currency} />
                    </fieldset>
                  ) : o.items.length === 0 ? (
                    <p className="m-0 text-[13px] text-muted">This order has no items.</p>
                  ) : (
                    <ItemsTable order={o} />
                  )}
                </Card>

                <Card as="section" aria-label="Payments">
                  <CardHeader
                    as="h2"
                    icon={<CreditCard size={16} />}
                    title="Payments"
                    action={<PaymentBadge status={o.paymentStatus} />}
                    className="mb-3"
                  />
                  {o.status !== 'CANCELLED' && o.totalMinor > 0 && (
                    <div className="mb-4">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px] text-muted">
                        <span>
                          <b className="font-semibold tabular-nums text-ink">
                            {formatMoney(o.paidMinor, o.currency)}
                          </b>{' '}
                          paid of {formatMoney(o.totalMinor, o.currency)}
                        </span>
                        {o.outstandingMinor > 0 && (
                          <span className="tabular-nums text-[#92580A]">
                            {formatMoney(o.outstandingMinor, o.currency)} due
                          </span>
                        )}
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Amount paid"
                        aria-valuemin={0}
                        aria-valuemax={o.totalMinor}
                        aria-valuenow={Math.min(o.paidMinor, o.totalMinor)}
                        className="h-1.5 overflow-hidden rounded-full bg-wash-2"
                      >
                        <div
                          className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
                          style={{
                            width: `${Math.min(100, (o.paidMinor / o.totalMinor) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {o.payments.length === 0 ? (
                    <p className="m-0 text-[13px] text-muted">
                      No payments recorded yet.
                      {o.outstandingMinor > 0 && o.status !== 'CANCELLED' && (
                        <> {formatMoney(o.outstandingMinor, o.currency)} is still pending.</>
                      )}
                    </p>
                  ) : (
                    <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                      {o.payments.map((p) => (
                        <PaymentRow
                          key={p.id}
                          payment={p}
                          currency={o.currency}
                          when={fmtFull(p.paidAt)}
                        />
                      ))}
                    </ul>
                  )}
                  {o.payments.length > 0 && (
                    <p className="mb-0 mt-3 flex items-center gap-1.5 text-xs text-faint">
                      <Info size={12} aria-hidden className="shrink-0" />
                      Recorded manually by staff, not provider transactions.
                    </p>
                  )}
                </Card>

                <Card as="section" aria-label="Fulfillment">
                  <CardHeader
                    as="h2"
                    icon={<Truck size={16} />}
                    title="Shipping & delivery"
                    action={
                      <span className="flex items-center gap-2">
                        {d.ship && <UnsavedTag />}
                        {canWrite && !editBlock && !draft && (
                          <SectionAction dirty={false} canEdit onEdit={startEdit} />
                        )}
                        <FulfillmentBadge status={o.fulfillmentStatus} />
                      </span>
                    }
                    className="mb-3"
                  />
                  {draft && (
                    <fieldset
                      disabled={saving}
                      className="m-0 mb-3 flex min-w-0 flex-col gap-3 border-0 p-0"
                    >
                      <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                        Shipping address
                        <textarea
                          aria-label="Shipping address"
                          value={draft.address}
                          maxLength={500}
                          rows={2}
                          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                          className="rounded-[10px] border border-line bg-white p-2.5 text-[13px] text-ink focus-visible:border-primary"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11.5px] text-faint">
                        Shipping method
                        <input
                          aria-label="Shipping method"
                          value={draft.method}
                          maxLength={120}
                          onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                          className={CONTROL}
                        />
                      </label>
                      <p className="m-0 text-xs text-faint">
                        Carrier, tracking and fulfillment status are saved on their own through
                        &quot;Update fulfillment&quot; in the More menu.
                      </p>
                    </fieldset>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-line-subtle bg-wash/50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted">
                        <MapPin size={12} aria-hidden /> Ship to
                      </div>
                      {o.shippingAddress ? (
                        <>
                          <div className="text-[13.5px] font-medium text-ink">
                            {o.customer.name}
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-snug text-muted">
                            {o.shippingAddress}
                          </div>
                          {o.customer.phone && (
                            <a
                              href={`tel:${o.customer.phone}`}
                              className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] tabular-nums text-muted no-underline hover:text-primary"
                            >
                              <Phone size={12} aria-hidden />
                              {o.customer.phone}
                            </a>
                          )}
                        </>
                      ) : (
                        <div className="text-[13px] text-muted">No shipping address added.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-line-subtle bg-wash/50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted">
                        <Truck size={12} aria-hidden /> Courier
                      </div>
                      {o.shippingMethod || o.carrier || o.trackingNumber ? (
                        <div className="flex items-start gap-3">
                          {o.carrier && <CourierMark name={o.carrier} />}
                          <dl className="m-0 flex min-w-0 flex-1 flex-col gap-1 text-[13.5px]">
                            {o.carrier && <div className="font-medium text-ink">{o.carrier}</div>}
                            {o.shippingMethod && (
                              <div className="text-muted">{o.shippingMethod}</div>
                            )}
                            {o.trackingNumber && (
                              <div className="break-all">
                                <span className="text-muted">Tracking </span>
                                {safeHref(o.trackingUrl) ? (
                                  <a
                                    href={safeHref(o.trackingUrl)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    {o.trackingNumber}
                                    <ExternalLink size={11} aria-hidden />
                                  </a>
                                ) : (
                                  <span className="tabular-nums text-ink">{o.trackingNumber}</span>
                                )}
                              </div>
                            )}
                          </dl>
                        </div>
                      ) : (
                        <div className="text-[13px] text-muted">No courier or tracking yet.</div>
                      )}
                    </div>
                  </div>
                  {(o.shippedAt || o.completedAt || o.cancelledAt) && (
                    <dl className="m-0 mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
                      {o.shippedAt && (
                        <div className="flex gap-1.5">
                          <dt className="text-muted">Shipped</dt>
                          <dd className="m-0 tabular-nums text-ink">{fmtFull(o.shippedAt)}</dd>
                        </div>
                      )}
                      {o.completedAt && (
                        <div className="flex gap-1.5">
                          <dt className="text-muted">Completed</dt>
                          <dd className="m-0 tabular-nums text-ink">{fmtFull(o.completedAt)}</dd>
                        </div>
                      )}
                      {o.cancelledAt && (
                        <div className="flex gap-1.5">
                          <dt className="text-muted">Cancelled</dt>
                          <dd className="m-0 tabular-nums text-ink">{fmtFull(o.cancelledAt)}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {canWrite && !hasShipment && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      disabled={!!shipBlock}
                      title={shipBlock ?? undefined}
                      onClick={() => act('Updating fulfillment', () => setDialog('ship'))}
                    >
                      <Truck size={14} />
                      Add shipment details
                    </Button>
                  )}
                  <p className="mb-0 mt-3 text-xs text-faint">
                    Entered by staff. Torio isn&apos;t connected to a carrier.
                  </p>
                </Card>

                <Card as="section" aria-label="Timeline">
                  <CardHeader
                    as="h2"
                    icon={<History size={16} />}
                    title="Timeline"
                    description={
                      o.events.length
                        ? `${o.events.length} event${o.events.length === 1 ? '' : 's'}`
                        : undefined
                    }
                    className="mb-4"
                  />
                  {o.events.length === 0 ? (
                    <p className="m-0 text-[13px] text-muted">
                      Order activity will appear here as it happens.
                    </p>
                  ) : (
                    <>
                      <ol className="m-0 list-none p-0">
                        {shownEvents.map((e, idx) => {
                          const Icon = EVENT_ICON[e.type] ?? Circle;
                          return (
                            <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                              {idx < shownEvents.length - 1 && (
                                <span
                                  aria-hidden
                                  className="absolute bottom-0 left-[13px] top-7 w-px bg-line"
                                />
                              )}
                              <span
                                aria-hidden
                                className="z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-muted"
                              >
                                <Icon size={13} />
                              </span>
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                  <span className="text-[11.5px] font-medium uppercase tracking-wide text-faint">
                                    {EVENT_TITLE[e.type] ?? 'Activity'}
                                  </span>
                                  <time
                                    dateTime={e.createdAt}
                                    className="text-xs tabular-nums text-faint"
                                  >
                                    {fmtFull(e.createdAt)}
                                  </time>
                                </div>
                                {e.description.trim().toLowerCase() !==
                                  (EVENT_TITLE[e.type] ?? '').toLowerCase() && (
                                  <div className="text-[13.5px] text-ink">{e.description}</div>
                                )}
                                <div className="text-xs text-muted">
                                  {e.actor?.name ?? 'System'}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      {o.events.length > EVENT_PREVIEW && (
                        <button
                          type="button"
                          onClick={() => setAllEvents((v) => !v)}
                          className="mt-3 cursor-pointer rounded border-none bg-transparent p-0 text-[13px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {allEvents ? 'Show fewer' : `Show all ${o.events.length} events`}
                        </button>
                      )}
                    </>
                  )}
                </Card>

                <Card as="section" aria-label="Internal notes">
                  <CardHeader
                    as="h2"
                    icon={<StickyNote size={16} />}
                    title="Internal notes"
                    description="Only your team can see these notes."
                    action={
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF5E4] px-1.5 py-0.5 text-[11px] font-medium text-[#92560A]">
                        <Lock size={10} aria-hidden />
                        Team only
                      </span>
                    }
                    className="mb-3"
                  />
                  {canWrite && (
                    <form
                      className="mb-4 flex flex-col gap-2 print:hidden"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitNote();
                      }}
                    >
                      <textarea
                        aria-label="Add an internal note"
                        value={note}
                        rows={3}
                        maxLength={2000}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            submitNote();
                          }
                        }}
                        placeholder="Write an internal note..."
                        className={AREA}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="hidden text-xs text-faint sm:block">
                          {note.length > 0 ? `${note.length}/2000 · ` : ''}Ctrl or ⌘ + Enter to add
                        </span>
                        <Button
                          size="md"
                          className="max-sm:w-full sm:ml-auto"
                          disabled={!note.trim() || m.addNote.isPending}
                        >
                          {m.addNote.isPending ? 'Adding…' : 'Add note'}
                        </Button>
                      </div>
                    </form>
                  )}
                  <ul className="m-0 flex list-none flex-col divide-y divide-line-subtle p-0">
                    {o.notes.map((n) => {
                      const mine = n.author?.id === user?.id;
                      return (
                        <li key={n.id} className="py-3 text-[14px] first:pt-0 last:pb-0">
                          {editing?.id === n.id ? (
                            <form
                              className="flex gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!editing.body.trim()) return;
                                m.updateNote.mutate(
                                  { id: o.id, noteId: n.id, body: editing.body.trim() },
                                  { onSuccess: () => setEditing(null), onError: err },
                                );
                              }}
                            >
                              <input
                                aria-label="Edit note"
                                value={editing.body}
                                maxLength={2000}
                                onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                                className={`${CONTROL} min-w-0 flex-1`}
                              />
                              <Button size="sm">Save</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                                Cancel
                              </Button>
                            </form>
                          ) : (
                            <div className="flex gap-3">
                              <span
                                aria-hidden
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11.5px] font-semibold text-primary"
                              >
                                {initialsOf(n.author?.name ?? 'Someone')}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                                  <b className="font-semibold text-ink">
                                    {n.author?.name ?? 'Someone'}
                                  </b>
                                  <span className="text-muted">{fmtAgo(n.createdAt)}</span>
                                  <span className="ml-auto flex items-center gap-1">
                                    {canWrite && mine && (
                                      <button
                                        type="button"
                                        aria-label="Edit note"
                                        title="Edit note"
                                        onClick={() => setEditing({ id: n.id, body: n.body })}
                                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                    {canWrite && (mine || canPayments) && (
                                      <button
                                        type="button"
                                        aria-label="Delete note"
                                        title="Delete note"
                                        onClick={() =>
                                          m.removeNote.mutate(
                                            { id: o.id, noteId: n.id },
                                            {
                                              onSuccess: () => toast('Note deleted'),
                                              onError: err,
                                            },
                                          )
                                        }
                                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-primary"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </span>
                                </div>
                                <div className="mt-1 whitespace-pre-wrap break-words rounded-xl rounded-tl-sm bg-wash px-3 py-2 text-[13.5px] leading-snug text-ink">
                                  {n.body}
                                </div>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {o.notes.length === 0 && (
                    <p className="m-0 text-[13px] text-muted">
                      No notes yet. Notes you add are visible to your team only.
                    </p>
                  )}
                </Card>
              </div>

              {/* Context column: part of the page, sticky under the fixed 56px header on desktop. */}
              <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[72px]">
                <Card as="section" aria-label="Summary">
                  <CardHeader as="h2" title="Order summary" className="mb-3" />
                  <div className="flex flex-col gap-1.5 text-[13.5px]">
                    <Row label="Subtotal" value={formatMoney(o.subtotalMinor, o.currency)} />
                    <Row
                      label="Discount"
                      faint={o.discountMinor === 0}
                      value={formatMoney(-o.discountMinor, o.currency)}
                    />
                    <Row
                      label="Shipping"
                      faint={o.shippingMinor === 0}
                      value={formatMoney(o.shippingMinor, o.currency)}
                    />
                    <Row
                      label="Tax"
                      faint={o.taxMinor === 0}
                      value={formatMoney(o.taxMinor, o.currency)}
                    />
                    <div className="my-1 border-t border-line-subtle" />
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-semibold text-ink">Total</span>
                      <span className="text-[18px] font-semibold tabular-nums text-ink">
                        {formatMoney(o.totalMinor, o.currency)}
                      </span>
                    </div>
                    <Row label="Amount paid" value={formatMoney(o.paidMinor, o.currency)} />
                  </div>
                  <div
                    className={cn(
                      'mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5',
                      o.outstandingMinor > 0 && o.status !== 'CANCELLED'
                        ? 'bg-[#FFF5E4] text-[#92560A]'
                        : 'bg-success-soft text-success',
                    )}
                  >
                    <span className="text-[13px] font-semibold">
                      {o.outstandingMinor > 0 && o.status !== 'CANCELLED'
                        ? 'Outstanding'
                        : o.status === 'CANCELLED'
                          ? 'Outstanding'
                          : 'Paid in full'}
                    </span>
                    <span className="text-[16px] font-semibold tabular-nums">
                      {formatMoney(o.outstandingMinor, o.currency)}
                    </span>
                  </div>
                  {o.paidMinor > 0 && (
                    <p className="mb-0 mt-3 flex items-start gap-1.5 text-xs text-faint">
                      <Info size={13} aria-hidden className="mt-px shrink-0" />
                      Refunds aren&apos;t supported: Torio has no payment provider.
                    </p>
                  )}
                </Card>

                <Card as="section" aria-label="Customer">
                  <CardHeader as="h2" title="Customer" className="mb-3" />
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary"
                    >
                      {initialsOf(o.customer.name)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/customers?customer=${o.customer.id}`}
                        title="View customer profile"
                        className="inline-flex max-w-full items-center gap-1 text-[14px] font-medium text-ink no-underline hover:text-primary"
                      >
                        <span className="truncate">{o.customer.name}</span>
                        <ExternalLink size={12} aria-hidden className="shrink-0 text-faint" />
                      </Link>
                      <Link
                        href={`/customers?customer=${o.customer.id}`}
                        className="mt-0.5 block w-fit text-xs text-primary no-underline hover:underline"
                      >
                        View profile
                      </Link>
                    </div>
                  </div>
                  {o.customer.email || o.customer.phone ? (
                    <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-[13px]">
                      {o.customer.email && (
                        <li className="flex items-center gap-2.5 px-1 py-1">
                          <Mail size={14} aria-hidden className="shrink-0 text-faint" />
                          <a
                            href={`mailto:${o.customer.email}`}
                            title="Send an email"
                            className="min-w-0 break-all text-ink no-underline hover:text-primary"
                          >
                            {o.customer.email}
                          </a>
                        </li>
                      )}
                      {o.customer.phone && (
                        <li className="flex items-center gap-2.5 px-1 py-1">
                          <Phone size={14} aria-hidden className="shrink-0 text-faint" />
                          <a
                            href={`tel:${o.customer.phone}`}
                            title="Call"
                            className="tabular-nums text-ink no-underline hover:text-primary"
                          >
                            {o.customer.phone}
                          </a>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="m-0 mt-3 text-[13px] text-muted">
                      No contact details on the customer profile yet.
                    </p>
                  )}
                  {o.customerConversations.length > 0 && (
                    <div className="mt-3 border-t border-line-subtle pt-3">
                      <div className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-faint">
                        Conversations
                      </div>
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {o.customerConversations.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => openConversation(c.id)}
                              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2 py-2 text-left transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                            >
                              <ChannelIcon channel={c.provider} size={18} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12.5px] font-medium text-ink">
                                  {CHANNEL_LABEL[c.provider]}
                                  {c.id === o.conversation?.id && (
                                    <span className="font-normal text-faint"> · linked</span>
                                  )}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {c.preview || 'Conversation'}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs text-faint">
                                {fmtAgo(c.lastMessageAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>

      {o && dialog === 'pay' && (
        <PaymentDialog
          order={o}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await m.recordPayment.mutateAsync({ id: o.id, body });
            toast('Payment recorded');
          }}
        />
      )}
      {o && dialog === 'ship' && (
        <FulfillmentDialog
          order={o}
          providers={couriers}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await m.setFulfillment.mutateAsync({ id: o.id, body });
            toast('Fulfillment updated');
          }}
        />
      )}
      {o && confirm === 'cancel' && (
        <ConfirmDialog
          title={`Cancel order #${o.number}?`}
          body={
            o.paidMinor > 0
              ? `${formatMoney(o.paidMinor, o.currency)} is recorded as paid. Cancelling doesn’t refund it: Torio can’t process refunds, so return the money outside Torio. This can’t be undone.`
              : 'The order is closed and can’t be reopened. This can’t be undone.'
          }
          confirmLabel="Cancel order"
          busy={m.setStatus.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            m.setStatus.mutate(
              { id: o.id, status: 'CANCELLED' },
              {
                onSuccess: () => {
                  toast('Order cancelled');
                  setConfirm(null);
                },
                onError: (e) => {
                  err(e);
                  setConfirm(null);
                },
              },
            )
          }
        />
      )}
      {actionGuard && (
        <UnsavedActionDialog
          action={actionGuard.label}
          saving={saving}
          onKeep={() => setActionGuard(null)}
          onDiscard={() => {
            const run = actionGuard.run;
            setActionGuard(null);
            stopEditing();
            run();
          }}
          onSave={async () => {
            const run = actionGuard.run;
            if (await save()) {
              setActionGuard(null);
              run();
            } else setActionGuard(null);
          }}
        />
      )}
      {guard.leaving && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have changes that haven't been saved. If you leave now, those changes will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onCancel={guard.keepEditing}
          onConfirm={guard.confirmLeave}
        />
      )}
    </>
  );
}
