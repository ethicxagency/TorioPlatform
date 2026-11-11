'use client';

import type { LucideIcon } from 'lucide-react';
import { CardHeader } from '@/components/ui/card';
import { formatMoney } from '@torio/contracts';
import { Pill } from '@/features/brain/components/bits';
import { cn } from '@/lib/utils';
import type { InvoiceStatus, Overview } from '../types';
import { fmtDate as fmtWsDate } from '@/lib/datetime';

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

export const fmtDate = (iso: string | null | undefined, tz?: string) =>
  iso
    ? fmtWsDate(iso, {
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
      <CardHeader title={title} action={action} className="mb-3 items-center" />
      {children}
    </section>
  );
}

export const Notice = ({
  tone = 'info',
  icon: Icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad';
  icon?: LucideIcon;
  children: React.ReactNode;
}) => (
  <div
    role={tone === 'bad' ? 'alert' : 'status'}
    className={cn(
      'rounded-xl px-3.5 py-2.5 text-[13px]',
      Icon && 'flex items-start gap-2.5',
      tone === 'bad' && 'bg-danger-soft text-[#8F2424]',
      tone === 'warn' && 'bg-warning-soft text-warning',
      tone === 'info' && 'bg-wash text-muted',
    )}
  >
    {Icon && <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />}
    {Icon ? <div className="min-w-0">{children}</div> : children}
  </div>
);
