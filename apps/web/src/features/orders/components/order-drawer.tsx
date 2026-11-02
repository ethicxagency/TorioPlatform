'use client';

import {
  Ban,
  CreditCard,
  Download,
  ExternalLink,
  MessageSquare,
  Pencil,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  editBlockReason,
  fulfillmentBlockReason,
  paymentBlockReason,
  statusBlockReason,
} from '@torio/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { fmtAgo } from '@/features/inbox/format';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime } from '@/lib/datetime';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { CHANNEL_LABEL, METHOD_LABEL, NEXT_STATUS } from '../constants';
import { formatMoney } from '../money';
import { useOrder, useOrderMutations, type OrderStatusTarget } from '../queries';
import type { OrderDetail, OrderItem } from '../types';
import { FulfillmentBadge, OrderStatusBadge, PaymentBadge, SampleTag } from './badges';
import { EditOrderDialog, FulfillmentDialog, PaymentDialog } from './order-dialogs';

interface Props {
  summary: OrderItem;
  canWrite: boolean;
  canPayments: boolean;
  onClose: () => void;
  onExport: (o: OrderItem) => void;
  onOpenConversation: (id: string) => void;
}

const heading = 'm-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint';
const safeHref = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={strong ? 'flex justify-between font-semibold' : 'flex justify-between text-muted'}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function OrderDrawer({
  summary,
  canWrite,
  canPayments,
  onClose,
  onExport,
  onOpenConversation,
}: Props) {
  const { toast, registerEscape } = useShell();
  const { workspaceId: ws } = useWorkspace();
  const { user } = useAuth();
  const tz = useTimeZone();
  const fmtFull = (iso: string) => fmtDateTime(iso, tz);
  const q = useOrder(ws, summary.id);
  const m = useOrderMutations(ws);
  const o: OrderDetail | undefined = q.data;
  const [dialog, setDialog] = useState<'pay' | 'ship' | 'edit' | null>(null);
  const [confirm, setConfirm] = useState<'cancel' | null>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);

  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
  const head = o ?? summary;
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

  const setStatus = (status: OrderStatusTarget, ok: string) =>
    m.setStatus.mutate({ id: summary.id, status }, { onSuccess: () => toast(ok), onError: err });

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[rgba(13,37,61,0.25)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Order #${head.number}`}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[560px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
              Order #{head.number}
              {head.isSample && <SampleTag />}
            </h2>
            <div className="text-[13px] text-muted">
              {fmtFull(head.createdAt)} · {head.customer.name}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <OrderStatusBadge status={head.status} />
              <PaymentBadge status={head.paymentStatus} />
              <FulfillmentBadge status={head.fulfillmentStatus} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close order details"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>

        {q.isPending && (
          <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading order">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full bg-wash-2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        )}
        {q.isError && (
          <div role="alert" className="p-6 text-center text-sm text-muted">
            Couldn&apos;t load this order.
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {o && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-4 flex flex-wrap gap-2">
              {next && canWrite && (
                <Button
                  size="sm"
                  disabled={!!nextBlock || m.setStatus.isPending}
                  title={nextBlock ?? undefined}
                  onClick={() => setStatus(next.to, `Order ${next.to.toLowerCase()}`)}
                >
                  {next.label}
                </Button>
              )}
              {canPayments && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!payBlock}
                  title={payBlock ?? undefined}
                  onClick={() => setDialog('pay')}
                >
                  <CreditCard size={13} />
                  Record payment
                </Button>
              )}
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!shipBlock}
                  title={shipBlock ?? undefined}
                  onClick={() => setDialog('ship')}
                >
                  <Truck size={13} />
                  Fulfillment
                </Button>
              )}
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!editBlock}
                  title={editBlock ?? editBlockReason(o) ?? undefined}
                  onClick={() => setDialog('edit')}
                >
                  <Pencil size={13} />
                  Edit
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onExport(summary)}>
                <Download size={13} />
                Export
              </Button>
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-danger"
                  disabled={!!cancelBlock}
                  title={cancelBlock ?? undefined}
                  onClick={() => setConfirm('cancel')}
                >
                  <Ban size={13} />
                  Cancel order
                </Button>
              )}
            </div>
            {!canPayments && (
              <p className="mb-3 mt-0 text-xs text-faint">
                Recording payments needs an Owner or Admin role.
              </p>
            )}

            <section className="mb-5" aria-label="Items">
              <h3 className={heading}>Items</h3>
              <ul className="m-0 list-none rounded-xl border border-line p-0">
                {o.items.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-start justify-between gap-3 border-b border-line-subtle px-3 py-2.5 text-[13px] last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="block text-xs text-faint">
                        {i.sku ? `SKU ${i.sku} · ` : ''}
                        {i.quantity} × {formatMoney(i.unitPriceMinor, o.currency)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(i.lineTotalMinor, o.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-5" aria-label="Summary">
              <h3 className={heading}>Summary</h3>
              <div className="flex flex-col gap-1 rounded-xl bg-wash p-3 text-[13px]">
                <Row label="Subtotal" value={formatMoney(o.subtotalMinor, o.currency)} />
                <Row label="Discount" value={formatMoney(-o.discountMinor, o.currency)} />
                <Row label="Shipping" value={formatMoney(o.shippingMinor, o.currency)} />
                <Row label="Tax" value={formatMoney(o.taxMinor, o.currency)} />
                <div className="my-1 border-t border-line" />
                <Row strong label="Total" value={formatMoney(o.totalMinor, o.currency)} />
                <Row label="Amount paid" value={formatMoney(o.paidMinor, o.currency)} />
                <Row label="Amount refunded" value={formatMoney(0, o.currency)} />
                <Row
                  strong
                  label="Outstanding"
                  value={formatMoney(o.outstandingMinor, o.currency)}
                />
                <div className="text-[11.5px] text-faint">
                  Refunds aren&apos;t supported: Torio has no payment provider.
                </div>
              </div>
            </section>

            <section className="mb-5" aria-label="Customer">
              <h3 className={heading}>Customer</h3>
              <div className="rounded-xl border border-line p-3 text-[13px]">
                <Link
                  href={`/customers?customer=${o.customer.id}`}
                  className="inline-flex items-center gap-1 font-medium text-primary"
                >
                  {o.customer.name}
                  <ExternalLink size={12} aria-hidden />
                </Link>
                <div className="text-muted">{o.customer.email ?? 'No email'}</div>
                <div className="text-muted">{o.customer.phone ?? 'No phone'}</div>
                <div className="mt-1.5 text-xs text-faint">
                  Channel: {CHANNEL_LABEL[o.channel]}
                  {o.createdBy && ` · Created by ${o.createdBy.name}`}
                </div>
                {o.shippingAddress && (
                  <div className="mt-1.5 whitespace-pre-wrap text-muted">
                    <span className="text-xs text-faint">Ship to </span>
                    {o.shippingAddress}
                  </div>
                )}
                {o.customerConversations.length > 0 && (
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                    {o.customerConversations.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onOpenConversation(c.id)}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-wash"
                        >
                          <MessageSquare size={12} className="shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate">
                            {CHANNEL_LABEL[c.provider]} · {c.preview || 'Conversation'}
                            {c.id === o.conversation?.id && ' (linked)'}
                          </span>
                          <span className="text-faint">{fmtAgo(c.lastMessageAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mb-5" aria-label="Payments">
              <h3 className={heading}>Payments</h3>
              {o.payments.length === 0 ? (
                <p className="m-0 text-[13px] text-muted">No payments recorded yet.</p>
              ) : (
                <ul className="m-0 list-none rounded-xl border border-line p-0">
                  {o.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex justify-between gap-3 border-b border-line-subtle px-3 py-2.5 text-[13px] last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{METHOD_LABEL[p.method]}</span>
                        <span className="block truncate text-xs text-faint">
                          {fmtFull(p.paidAt)}
                          {p.reference ? ` · Ref ${p.reference}` : ''}
                          {p.recordedBy ? ` · by ${p.recordedBy.name}` : ''}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatMoney(p.amountMinor, o.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mb-0 mt-1.5 text-[11.5px] text-faint">
                Manual records entered by staff, not provider transactions.
              </p>
            </section>

            <section className="mb-5" aria-label="Fulfillment">
              <h3 className={heading}>Fulfillment and shipping</h3>
              <div className="rounded-xl border border-line p-3 text-[13px]">
                <FulfillmentBadge status={o.fulfillmentStatus} />
                {o.shippingMethod || o.carrier || o.trackingNumber || o.shippedAt ? (
                  <dl className="m-0 mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[13px]">
                    {o.shippingMethod && (
                      <>
                        <dt className="text-faint">Method</dt>
                        <dd className="m-0">{o.shippingMethod}</dd>
                      </>
                    )}
                    {o.carrier && (
                      <>
                        <dt className="text-faint">Carrier</dt>
                        <dd className="m-0">{o.carrier}</dd>
                      </>
                    )}
                    {o.trackingNumber && (
                      <>
                        <dt className="text-faint">Tracking</dt>
                        <dd className="m-0">
                          {safeHref(o.trackingUrl) ? (
                            <a
                              href={safeHref(o.trackingUrl)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {o.trackingNumber}
                            </a>
                          ) : (
                            o.trackingNumber
                          )}
                        </dd>
                      </>
                    )}
                    {o.shippedAt && (
                      <>
                        <dt className="text-faint">Shipped</dt>
                        <dd className="m-0">{fmtFull(o.shippedAt)}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="mb-0 mt-2 text-muted">No shipment details yet.</p>
                )}
                <p className="mb-0 mt-2 text-[11.5px] text-faint">
                  Entered by staff. Torio isn&apos;t connected to a carrier.
                </p>
              </div>
            </section>

            <section className="mb-5" aria-label="Internal notes">
              <h3 className={heading}>Internal notes</h3>
              <p className="m-0 mb-2 text-[11.5px] text-faint">
                Only your team sees these. They are never sent to the customer.
              </p>
              {canWrite && (
                <form
                  className="mb-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = note.trim();
                    if (!body) return;
                    m.addNote.mutate(
                      { id: o.id, body },
                      { onSuccess: () => setNote(''), onError: err },
                    );
                  }}
                >
                  <input
                    aria-label="Add an internal note"
                    value={note}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note…"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-[13px]"
                  />
                  <Button size="md" disabled={!note.trim() || m.addNote.isPending}>
                    Add
                  </Button>
                </form>
              )}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {o.notes.map((n) => {
                  const mine = n.author?.id === user?.id;
                  return (
                    <li key={n.id} className="rounded-xl bg-[#FFFBEB] px-3 py-2 text-[13px]">
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
                            className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]"
                          />
                          <Button size="sm">Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <>
                          <div className="whitespace-pre-wrap">{n.body}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-faint">
                            {n.author?.name ?? 'Someone'} · {fmtAgo(n.createdAt)}
                            {canWrite && mine && (
                              <button
                                type="button"
                                aria-label="Edit note"
                                onClick={() => setEditing({ id: n.id, body: n.body })}
                                className="cursor-pointer text-muted hover:text-ink"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            {canWrite && (mine || canPayments) && (
                              <button
                                type="button"
                                aria-label="Delete note"
                                onClick={() =>
                                  m.removeNote.mutate(
                                    { id: o.id, noteId: n.id },
                                    { onSuccess: () => toast('Note deleted'), onError: err },
                                  )
                                }
                                className="cursor-pointer text-muted hover:text-danger"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
                {o.notes.length === 0 && <li className="text-[13px] text-muted">No notes yet.</li>}
              </ul>
            </section>

            <section aria-label="Timeline">
              <h3 className={heading}>Timeline</h3>
              <ol className="m-0 list-none border-l border-line p-0 pl-4">
                {o.events.map((e) => (
                  <li key={e.id} className="relative pb-3 text-[13px]">
                    <span
                      aria-hidden
                      className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary"
                    />
                    <div>{e.description}</div>
                    <div className="text-xs text-faint">
                      {e.actor?.name ?? 'System'} · {fmtFull(e.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>

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
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await m.setFulfillment.mutateAsync({ id: o.id, body });
            toast('Fulfillment updated');
          }}
        />
      )}
      {o && dialog === 'edit' && (
        <EditOrderDialog
          order={o}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await m.update.mutateAsync({ id: o.id, body });
            toast('Order updated');
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
    </>
  );
}
