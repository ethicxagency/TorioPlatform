import {
  currencyInfo,
  DEFAULT_CURRENCY,
  ENABLED_CURRENCIES,
  isIsoCurrency,
} from '@torio/contracts';
import type {
  FulfillmentStatus,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './types';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

export const ORDER_PAGE_SIZE = 25;

export const STATUS_INFO: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const PAYMENT_INFO: Record<PaymentStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Unpaid', tone: 'warn' },
  PARTIALLY_PAID: { label: 'Partially paid', tone: 'info' },
  PAID: { label: 'Paid', tone: 'ok' },
};
export const FULFILLMENT_INFO: Record<FulfillmentStatus, { label: string; tone: Tone }> = {
  UNFULFILLED: { label: 'Unfulfilled', tone: 'neutral' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  FULFILLED: { label: 'Fulfilled', tone: 'ok' },
};
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  MOBILE_WALLET: 'Mobile wallet',
  CARD_EXTERNAL: 'Card (taken outside Torio)',
  OTHER: 'Other',
};
export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  MANUAL: 'Manual',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
};
/** Currencies a customer can pick for new orders. Old orders keep whatever currency they were created in. */
export const CURRENCIES = ENABLED_CURRENCIES;
export { DEFAULT_CURRENCY };

/**
 * Currencies offered on a new order: the workspace's default currency first (when orders can be priced in it),
 * then the platform's enabled ones. A default that can't be used for orders never silently becomes another one.
 */
export function orderCurrencies(defaultCurrency: string | null | undefined): string[] {
  const usable =
    defaultCurrency &&
    isIsoCurrency(defaultCurrency) &&
    currencyInfo(defaultCurrency).minorDigits === 2
      ? [defaultCurrency]
      : [];
  return [...new Set<string>([...usable, ...CURRENCIES])];
}

/** Status transitions offered as the primary "next step" in the UI, in order. Rules live in @torio/contracts. */
export const NEXT_STATUS: Partial<
  Record<OrderStatus, { to: Exclude<OrderStatus, 'PENDING' | 'CANCELLED'>; label: string }>
> = {
  PENDING: { to: 'CONFIRMED', label: 'Confirm order' },
  CONFIRMED: { to: 'PROCESSING', label: 'Start processing' },
  PROCESSING: { to: 'COMPLETED', label: 'Complete order' },
};
