import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  editBlockReason,
  fulfillmentBlockReason,
  paymentBlockReason,
  paymentStatusOf,
  setFulfillmentSchema,
  statusBlockReason,
  type OrderLike,
} from './orders';

const order = (p: Partial<OrderLike> = {}): OrderLike => ({
  status: 'PENDING',
  paymentStatus: 'UNPAID',
  fulfillmentStatus: 'UNFULFILLED',
  totalMinor: 10_000,
  paidMinor: 0,
  ...p,
});

describe('order totals', () => {
  it('computes subtotal − discount + shipping + tax', () => {
    const r = computeTotals(
      [
        { quantity: 2, unitPriceMinor: 1_500 },
        { quantity: 1, unitPriceMinor: 700 },
      ],
      200,
      500,
      100,
    );
    expect(r).toEqual({
      ok: true,
      totals: { lineTotals: [3_000, 700], subtotalMinor: 3_700, totalMinor: 4_100 },
    });
  });
  it('rejects a discount above the subtotal and oversized amounts', () => {
    expect(computeTotals([{ quantity: 1, unitPriceMinor: 100 }], 101, 0, 0).ok).toBe(false);
    expect(computeTotals([{ quantity: 10_000, unitPriceMinor: 100_000_000 }], 0, 0, 0).ok).toBe(
      false,
    );
  });
  it('derives payment status from the amount paid', () => {
    expect(paymentStatusOf(100, 0)).toBe('UNPAID');
    expect(paymentStatusOf(100, 40)).toBe('PARTIALLY_PAID');
    expect(paymentStatusOf(100, 100)).toBe('PAID');
  });
});

describe('order rules', () => {
  it('only allows forward status transitions', () => {
    expect(statusBlockReason(order(), 'CONFIRMED')).toBeNull();
    expect(statusBlockReason(order(), 'COMPLETED')).toMatch(/can’t go from/);
    expect(statusBlockReason(order({ status: 'CANCELLED' }), 'CONFIRMED')).toMatch(/cancelled/);
    expect(statusBlockReason(order({ status: 'CONFIRMED' }), 'CONFIRMED')).toMatch(/already/);
  });
  it('completion needs fulfillment and full payment; fulfilled orders cannot be cancelled', () => {
    const p = order({ status: 'PROCESSING' });
    expect(statusBlockReason(p, 'COMPLETED')).toMatch(/fulfilled/);
    const f = { ...p, fulfillmentStatus: 'FULFILLED' as const };
    expect(statusBlockReason(f, 'COMPLETED')).toMatch(/payment/);
    expect(statusBlockReason({ ...f, paymentStatus: 'PAID' }, 'COMPLETED')).toBeNull();
    expect(statusBlockReason(f, 'CANCELLED')).toMatch(/can’t be cancelled/);
  });
  it('fulfillment needs a confirmed order and only moves forward', () => {
    expect(fulfillmentBlockReason(order(), 'FULFILLED')).toMatch(/Confirm/);
    const c = order({ status: 'CONFIRMED' });
    expect(fulfillmentBlockReason(c, 'PROCESSING')).toBeNull();
    expect(
      fulfillmentBlockReason({ ...c, fulfillmentStatus: 'FULFILLED' }, 'PROCESSING'),
    ).not.toBeNull();
  });
  it('blocks payments on cancelled or settled orders and edits after payment', () => {
    expect(paymentBlockReason(order({ status: 'CANCELLED' }))).toMatch(/cancelled/);
    expect(paymentBlockReason(order({ paidMinor: 10_000 }))).toMatch(/fully paid/);
    expect(paymentBlockReason(order())).toBeNull();
    expect(editBlockReason(order())).toBeNull();
    expect(editBlockReason(order({ paidMinor: 1 }))).toMatch(/locked/);
    expect(editBlockReason(order({ status: 'CONFIRMED' }))).toMatch(/Pending/);
  });
  it('accepts only http(s) tracking links', () => {
    const base = { status: 'FULFILLED' as const };
    expect(
      setFulfillmentSchema.safeParse({ ...base, trackingUrl: 'https://x.co/t/1' }).success,
    ).toBe(true);
    expect(
      setFulfillmentSchema.safeParse({ ...base, trackingUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
});
