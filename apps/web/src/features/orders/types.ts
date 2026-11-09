import type { ApiSchemas } from '@torio/api-client';
import type { DATE_RANGES } from '@/features/leads/constants';

export type OrderItem = ApiSchemas['OrderListDto']['data'][number];
export type OrderDetail = ApiSchemas['OrderDetailDto'];
export type OrderSummary = ApiSchemas['OrderSummaryDto'];
export type OrderStatus = OrderItem['status'];
export type PaymentStatus = OrderItem['paymentStatus'];
export type FulfillmentStatus = OrderItem['fulfillmentStatus'];
export type OrderChannel = OrderItem['channel'];
export type PaymentMethod = OrderDetail['payments'][number]['method'];
export type OrderSort = 'createdAt' | 'total';
export type OrderRange = '' | (typeof DATE_RANGES)[number]['key'];

export interface OrderFilters {
  q: string;
  status: OrderStatus[];
  paymentStatus: PaymentStatus[];
  fulfillmentStatus: FulfillmentStatus[];
  channel: '' | OrderChannel;
  method: '' | PaymentMethod;
  /** Applies to both the KPI cards and the list. */
  range: OrderRange;
  /** Major-unit text; converted to minor units when querying. */
  min: string;
  max: string;
}

export const EMPTY_ORDER_FILTERS: OrderFilters = {
  q: '',
  status: [],
  paymentStatus: [],
  fulfillmentStatus: [],
  channel: '',
  method: '',
  range: '',
  min: '',
  max: '',
};

/** Filters that live in the popover (everything except the always-visible search). */
export const activeOrderFilterCount = (f: OrderFilters) =>
  [
    !!f.range,
    f.status.length > 0,
    f.paymentStatus.length > 0,
    f.fulfillmentStatus.length > 0,
    !!f.channel,
    !!f.method,
    !!f.min,
    !!f.max,
  ].filter(Boolean).length;
