import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  Package,
  Route,
  Truck,
  Smartphone,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { SHIPPING_CATALOG } from '@/features/brain/components/service-cards';
import { cn } from '@/lib/utils';
import { FULFILLMENT_INFO, METHOD_LABEL, STATUS_INFO } from '../constants';
import { formatMoney } from '../money';
import type { OrderDetail, OrderStatus } from '../types';
import { OrderStatusBadge } from './badges';

const STEPS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED'] as const;
type StepKey = (typeof STEPS)[number];
type NodeState = 'done' | 'current' | 'todo' | 'cancelled';

/**
 * When each status was really reached. The order stores three moments itself (created, completed, cancelled). The in-between
 * steps come from the order's own history: the server writes "Status changed from X to Y" for every change, and the latest
 * such entry per target status is its time. A step with no record has no time; nothing is estimated.
 */
export function statusTimes(
  order: Pick<OrderDetail, 'createdAt' | 'completedAt' | 'cancelledAt' | 'events'>,
): Partial<Record<OrderStatus, string>> {
  const t: Partial<Record<OrderStatus, string>> = { PENDING: order.createdAt };
  for (const e of order.events) {
    const m =
      /^Status changed from .+? to (Pending|Confirmed|Processing|Completed|Cancelled)\b/.exec(
        e.description,
      );
    if (!m) continue;
    const key = m[1]!.toUpperCase() as OrderStatus;
    if (!t[key] || e.createdAt > t[key]!) t[key] = e.createdAt;
  }
  if (order.completedAt) t.COMPLETED = order.completedAt;
  if (order.cancelledAt) t.CANCELLED = order.cancelledAt;
  return t;
}

const CONTEXT: Record<StepKey, (o: Pick<OrderDetail, 'fulfillmentStatus'>) => string | null> = {
  PENDING: () => 'Awaiting confirmation',
  CONFIRMED: () => 'Ready to be processed',
  PROCESSING: (o) => `Fulfillment: ${FULFILLMENT_INFO[o.fulfillmentStatus].label.toLowerCase()}`,
  COMPLETED: () => null,
};

/**
 * The order journey, drawn from the order's real status. A completed order has every step done; a cancelled one keeps the steps
 * it did reach, leaves the rest muted and ends in a red Cancelled step (it is never shown as completed). Horizontal from the
 * small breakpoint up, a vertical timeline on phones.
 */
export function OrderProgress({
  order,
  fmt,
}: {
  order: Pick<
    OrderDetail,
    'status' | 'createdAt' | 'completedAt' | 'cancelledAt' | 'events' | 'fulfillmentStatus'
  >;
  fmt: (iso: string) => string;
}) {
  const cancelled = order.status === 'CANCELLED';
  const times = statusTimes(order);
  const at = STEPS.indexOf(order.status as StepKey);
  const nodes: {
    key: string;
    label: string;
    state: NodeState;
    time: string | null;
    note: string | null;
  }[] = STEPS.map((s, i) => {
    const reached = cancelled ? i === 0 || !!times[s] : i <= at;
    const state: NodeState = cancelled
      ? reached
        ? 'done'
        : 'todo'
      : i < at || (i === at && s === 'COMPLETED')
        ? 'done'
        : i === at
          ? 'current'
          : 'todo';
    return {
      key: s,
      label: STATUS_INFO[s].label,
      state,
      time: reached ? (times[s] ?? null) : null,
      note: state === 'current' ? CONTEXT[s](order) : null,
    };
  });
  if (cancelled)
    nodes.push({
      key: 'CANCELLED',
      label: 'Cancelled',
      state: 'cancelled',
      time: times.CANCELLED ?? null,
      note: null,
    });
  const last = nodes.length - 1;
  const doneCount = nodes.filter((n) => n.state === 'done').length;
  const currentIdx = nodes.findIndex((n) => n.state === 'current');
  // The filled part of the track runs to the current step, or to the last completed one.
  const reachedIdx = cancelled
    ? Math.max(0, nodes.map((n) => n.state).lastIndexOf('done'))
    : currentIdx >= 0
      ? currentIdx
      : doneCount - 1;
  const pct = last > 0 ? (reachedIdx / last) * 100 : 0;
  const stepText = cancelled
    ? `${doneCount} of ${STEPS.length} steps reached`
    : `${order.status === 'COMPLETED' ? STEPS.length : at + 1} of ${STEPS.length} steps`;

  return (
    <section
      aria-label="Order progress"
      className="rounded-card border border-line bg-white px-4 py-3.5 sm:px-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="m-0 flex items-center gap-2 font-card-title text-ink">
          <Route size={16} aria-hidden className="text-muted" />
          Order progress
        </h2>
        <div className="flex items-center gap-2.5 text-[12.5px] text-muted">
          <OrderStatusBadge status={order.status} />
          <span className="tabular-nums" aria-live="polite">
            {stepText}
          </span>
        </div>
      </div>
      <ol
        aria-label="Order steps"
        className="relative m-0 flex list-none flex-col gap-0 p-0 sm:grid sm:grid-flow-col sm:auto-cols-fr"
      >
        {/* Horizontal track: a neutral rail with a filled part that grows as the order moves on. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-[15px] hidden h-1 -translate-y-1/2 rounded-full bg-line sm:block"
          style={{ left: `${50 / nodes.length}%`, right: `${50 / nodes.length}%` }}
        >
          <span
            className="block h-full rounded-full bg-success transition-[width] duration-[250ms] ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </span>
        {nodes.map((n, i) => (
          <li
            key={n.key}
            aria-current={n.state === 'current' ? 'step' : undefined}
            className="group relative flex min-w-0 gap-3 pb-4 last:pb-0 sm:flex-col sm:items-center sm:gap-0 sm:pb-0 sm:text-center"
          >
            {/* Vertical connector (phones): one segment from this node down to the next. */}
            {i < last && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[13px] top-8 -bottom-0 w-0.5 rounded-full transition-colors duration-[250ms] motion-reduce:transition-none sm:hidden',
                  n.state === 'done' && nodes[i + 1]!.state !== 'todo' ? 'bg-success' : 'bg-line',
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 text-[11.5px] font-semibold transition-[transform,background-color,border-color,color] duration-[200ms] ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
                n.state === 'done' && 'border-success bg-success text-white',
                n.state === 'current' &&
                  'animate-ring-pulse border-primary bg-primary text-white motion-reduce:animate-none',
                n.state === 'todo' && 'border-line bg-white text-faint',
                n.state === 'cancelled' && 'border-danger bg-danger text-white',
              )}
            >
              {n.state === 'done' ? (
                <Check
                  size={15}
                  strokeWidth={3}
                  className="animate-badge-in motion-reduce:animate-none"
                />
              ) : n.state === 'cancelled' ? (
                <X
                  size={15}
                  strokeWidth={3}
                  className="animate-badge-in motion-reduce:animate-none"
                />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 sm:mt-2">
              <span
                className={cn(
                  'block text-[13px] leading-tight',
                  n.state === 'current' && 'font-semibold text-primary',
                  n.state === 'done' && 'font-medium text-ink',
                  n.state === 'todo' && 'text-faint',
                  n.state === 'cancelled' && 'font-semibold text-danger',
                )}
              >
                {n.label}
              </span>
              {n.time && (
                <time
                  dateTime={n.time}
                  className="mt-0.5 block text-[11.5px] tabular-nums text-muted"
                >
                  {fmt(n.time)}
                </time>
              )}
              {n.note && <span className="mt-0.5 block text-[11.5px] text-muted">{n.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Items as a table: long names wrap, numbers are right-aligned and tabular, and small screens show quantity × price under the name. */
export function ItemsTable({ order }: { order: OrderDetail }) {
  const money = (n: number) => formatMoney(n, order.currency);
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[320px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-wash text-left text-[11.5px] font-medium uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-2 font-medium sm:pl-5">
              Product
            </th>
            <th scope="col" className="w-16 px-2 py-2 text-right font-medium">
              Qty
            </th>
            <th scope="col" className="hidden w-28 px-2 py-2 text-right font-medium sm:table-cell">
              Unit price
            </th>
            <th scope="col" className="w-28 px-4 py-2 text-right font-medium sm:pr-5">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {order.items.map((i) => (
            <tr
              key={i.id}
              className="align-top transition-colors duration-150 hover:bg-wash/60 motion-reduce:transition-none"
            >
              <td className="px-4 py-3 sm:pl-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-subtle bg-wash text-faint"
                  >
                    <Package size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="break-words font-medium leading-snug text-ink">{i.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">
                      {i.sku ? `SKU ${i.sku}` : 'No SKU'}
                    </div>
                    <div className="mt-0.5 text-[12.5px] tabular-nums text-muted sm:hidden">
                      {money(i.unitPriceMinor)} each
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-2 py-3 text-right tabular-nums text-ink">{i.quantity}</td>
              <td className="hidden px-2 py-3 text-right tabular-nums text-muted sm:table-cell">
                {money(i.unitPriceMinor)}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums text-ink sm:pr-5">
                {money(i.lineTotalMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METHOD_ICON: Record<OrderDetail['payments'][number]['method'], LucideIcon> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  MOBILE_WALLET: Smartphone,
  CARD_EXTERNAL: CreditCard,
  OTHER: Wallet,
};

/** One recorded payment. Every recorded payment is money received; Torio has no failed or refunded payment records. */
export function PaymentRow({
  payment,
  currency,
  when,
}: {
  payment: OrderDetail['payments'][number];
  currency: string;
  when: string;
}) {
  const Icon = METHOD_ICON[payment.method];
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[14px] font-medium text-ink">{METHOD_LABEL[payment.method]}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
            <Check size={10} strokeWidth={3} aria-hidden /> Received
          </span>
        </span>
        <span className="block text-[12.5px] text-muted">
          {when}
          {payment.recordedBy ? ` · by ${payment.recordedBy.name}` : ''}
        </span>
        {payment.reference && (
          <span className="mt-1 inline-block max-w-full break-all rounded bg-wash px-1.5 py-0.5 font-mono text-[11.5px] text-muted">
            Ref {payment.reference}
          </span>
        )}
      </span>
      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">
        {formatMoney(payment.amountMinor, currency)}
      </span>
    </li>
  );
}

/**
 * The courier's mark: the official logo when Torio has one for that name (the same assets the Brain uses), otherwise a neutral
 * truck icon. Never a made-up logo.
 */
export function CourierMark({ name }: { name: string }) {
  const logo = SHIPPING_CATALOG.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
  )?.logo;
  return (
    <span className="flex h-9 min-w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white px-1.5">
      {logo ? (
        <Image
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          sizes="96px"
          className="object-contain"
          style={{ width: 'auto', height: 'auto', maxWidth: 72, maxHeight: 22 }}
        />
      ) : (
        <Truck size={16} aria-hidden className="text-muted" />
      )}
    </span>
  );
}
