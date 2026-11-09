import { cn } from '@/lib/utils';
import { FULFILLMENT_INFO, PAYMENT_INFO, STATUS_INFO } from '../constants';
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from '../types';

const TONE = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  neutral: 'bg-wash-2 text-muted',
  info: 'bg-[#EFF6FF] text-[#2563EB]',
} as const;

/** Compact semantic badge with a small status dot. */
function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium',
        TONE[tone],
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <Pill tone={STATUS_INFO[status].tone}>{STATUS_INFO[status].label}</Pill>
);
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => (
  <Pill tone={PAYMENT_INFO[status].tone}>{PAYMENT_INFO[status].label}</Pill>
);
export const FulfillmentBadge = ({ status }: { status: FulfillmentStatus }) => (
  <Pill tone={FULFILLMENT_INFO[status].tone}>{FULFILLMENT_INFO[status].label}</Pill>
);
export const SampleTag = () => (
  <span className="rounded-md bg-wash-2 px-1.5 py-0.5 text-[11px] text-faint">Sample</span>
);
