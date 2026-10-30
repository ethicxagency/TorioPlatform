import { Pill } from '@/features/brain/components/bits';
import { FULFILLMENT_INFO, PAYMENT_INFO, STATUS_INFO } from '../constants';
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from '../types';

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
