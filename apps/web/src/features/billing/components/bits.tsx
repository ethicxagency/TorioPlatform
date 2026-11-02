'use client';

import { formatMoney } from '@torio/contracts';
import { Pill } from '@/features/brain/components/bits';
import { cn } from '@/lib/utils';
import type { InvoiceStatus, Overview } from '../types';

export const money = formatMoney;

type SubStatus = NonNullable<Overview['subscription']>['status'];
const SUB: Record<SubStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' }> =
  {
    ACTIVE: { label: 'Active', tone: 'ok' },
    TRIALING: { label: 'Trialing', tone: 'info' },
    PAST_DUE: { label: 'Past due', tone: 'bad' },
    CANCELED: { label: 'Canceled', tone: 'neutral' },
    EXPIRED: { label: 'Expired', tone: 'neutral' },
  };
export function SubscriptionBadge({ o }: { o: Overview }) {
  if (!o.subscription) return <Pill tone="neutral">Free plan</Pill>;
  if (o.subscription.cancelAtPeriodEnd) return <Pill tone="warn">Cancels at period end</Pill>;
  const s = SUB[o.subscription.status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const INV: Record<
  InvoiceStatus,
  { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' }
> = {
  PAID: { label: 'Paid', tone: 'ok' },
  PENDING: { label: 'Pending', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
  VOID: { label: 'Void', tone: 'neutral' },
};
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => (
  <Pill tone={INV[status].tone}>{INV[status].label}</Pill>
);

export const PlaceholderTag = () => (
  <span
    title="Pricing hasn’t been configured yet. Edit the plan catalog and provider prices before selling."
    className="rounded bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warning"
  >
    Placeholder pricing
  </span>
);

export function Progress({
  percent,
  level,
  label,
}: {
  percent: number;
  level: string;
  label: string;
}) {
  const color =
    level === 'reached'
      ? 'bg-danger'
      : level === 'near'
        ? 'bg-[#D97706]'
        : level === 'approaching'
          ? 'bg-warning'
          : 'bg-primary';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 overflow-hidden rounded-full bg-wash-2"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] motion-reduce:transition-none',
          color,
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export const LEVEL_TEXT: Record<string, string> = {
  unlimited: 'Unlimited',
  ok: 'Within limit',
  approaching: 'Approaching limit',
  near: 'Near limit',
  reached: 'Limit reached',
};

export const fmtDate = (iso: string | null | undefined, tz?: string) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        dateStyle: 'medium',
        ...(tz && { timeZone: tz }),
      })
    : '—';

export function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-card border border-line bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[14.5px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Notice = ({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'bad';
  children: React.ReactNode;
}) => (
  <div
    role={tone === 'bad' ? 'alert' : 'status'}
    className={cn(
      'rounded-xl px-3.5 py-2.5 text-[13px]',
      tone === 'bad' && 'bg-danger-soft text-[#8F2424]',
      tone === 'warn' && 'bg-warning-soft text-warning',
      tone === 'info' && 'bg-wash text-muted',
    )}
  >
    {children}
  </div>
);
