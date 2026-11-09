import type { OrderDetail } from './types';
import {
  linesFromOrder,
  pricingFromOrder,
  type Line,
  type Pricing,
} from './components/order-fields';

/** The editable slice of an order while the page is in edit mode. Strings, exactly as typed. */
export interface Draft {
  lines: Line[];
  pricing: Pricing;
  address: string;
  method: string;
}

export const draftFromOrder = (o: OrderDetail): Draft => ({
  lines: linesFromOrder(o.items),
  pricing: pricingFromOrder(o),
  address: o.shippingAddress ?? '',
  method: o.shippingMethod ?? '',
});

/** "12", "12.0" and "12,00" are the same amount; an empty amount is zero. Anything unparseable stays as typed. */
const num = (s: string, empty: number | string = '') => {
  const t = s.trim().replace(',', '.');
  if (t === '') return empty;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

const itemsSig = (lines: Line[]) =>
  JSON.stringify(lines.map((l) => [l.name.trim(), l.sku.trim(), num(l.quantity), num(l.price)]));
const pricingSig = (p: Pricing) =>
  JSON.stringify([num(p.discount, 0), num(p.shipping, 0), num(p.tax, 0)]);
const shipSig = (d: Draft) => JSON.stringify([d.address.trim(), d.method.trim()]);

export interface DirtyState {
  items: boolean;
  pricing: boolean;
  ship: boolean;
  any: boolean;
}
export const CLEAN: DirtyState = { items: false, pricing: false, ship: false, any: false };

/** Compares the draft with the last server state, so restoring a value clears the dirty flag. */
export function dirtyOf(base: Draft, cur: Draft): DirtyState {
  const items = itemsSig(base.lines) !== itemsSig(cur.lines);
  const pricing = pricingSig(base.pricing) !== pricingSig(cur.pricing);
  const ship = shipSig(base) !== shipSig(cur);
  return { items, pricing, ship, any: items || pricing || ship };
}
