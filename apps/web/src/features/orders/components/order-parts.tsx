import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  Package,
  Smartphone,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { METHOD_LABEL, STATUS_INFO } from '../constants';
import { formatMoney } from '../money';
import type { OrderDetail, OrderStatus } from '../types';

const STEPS = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED'] as const;

/**
 * The order's lifecycle as a stepper. Only moments the order really stores are timestamped: when it was created, completed or
 * cancelled. The in-between steps carry no time because the order does not record one, and none is invented.
 */
export function OrderProgress({
  order,
  fmt,
}: {
  order: Pick<OrderDetail, 'status' | 'createdAt' | 'completedAt' | 'cancelledAt'>;
  fmt: (iso: string) => string;
}) {
  const cancelled = order.status === 'CANCELLED';
  const at = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const stamp = (s: OrderStatus): string | null =>
    s === 'PENDING' ? order.createdAt : s === 'COMPLETED' ? order.completedAt : null;
  const items: {
    key: string;
    label: string;
    state: 'done' | 'current' | 'todo' | 'cancelled';
    time: string | null;
  }[] = STEPS.map((s, i) => ({
    key: s,
    label: STATUS_INFO[s].label,
    state: cancelled
      ? i === 0
        ? 'done'
        : 'todo'
      : i < at
        ? 'done'
        : i === at
          ? s === 'COMPLETED'
            ? 'done'
            : 'current'
          : 'todo',
    time: cancelled && i > 0 ? null : stamp(s),
  }));
  if (cancelled)
    items.push({
      key: 'CANCELLED',
      label: 'Cancelled',
      state: 'cancelled',
      time: order.cancelledAt,
    });
  return (
    <ol
      aria-label="Order progress"
      className="m-0 flex list-none items-start rounded-card border border-line bg-white p-0 px-3 py-3.5 sm:px-5"
    >
      {items.map((s, i) => (
        <li
          key={s.key}
          aria-current={s.state === 'current' ? 'step' : undefined}
          className="relative flex min-w-0 flex-1 flex-col items-center text-center"
        >
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute right-1/2 top-[13px] h-0.5 w-full',
                s.state === 'done' || s.state === 'current'
                  ? 'bg-primary'
                  : s.state === 'cancelled'
                    ? 'bg-[#F1B5B5]'
                    : 'bg-line',
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              'relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
              s.state === 'done' && 'border-primary bg-primary text-white',
              s.state === 'current' &&
                'border-primary bg-white text-primary ring-4 ring-primary/15',
              s.state === 'todo' && 'border-line bg-white text-faint',
              s.state === 'cancelled' && 'border-danger bg-danger text-white',
            )}
          >
            {s.state === 'done' ? (
              <Check size={14} strokeWidth={3} />
            ) : s.state === 'cancelled' ? (
              <X size={14} strokeWidth={3} />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={cn(
              'mt-1.5 text-[12.5px] leading-tight',
              s.state === 'current' || s.state === 'cancelled'
                ? 'font-semibold text-ink'
                : s.state === 'done'
                  ? 'font-medium text-ink'
                  : 'text-faint',
              s.state === 'cancelled' && 'text-danger',
            )}
          >
            {s.label}
          </span>
          {s.time && (
            <time dateTime={s.time} className="mt-0.5 hidden text-[11px] text-muted sm:block">
              {fmt(s.time)}
            </time>
          )}
        </li>
      ))}
    </ol>
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
            <tr key={i.id} className="align-top">
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
