'use client';

import { Plus, Trash2 } from 'lucide-react';
import { computeTotals, MAX_ORDER_LINES } from '@torio/contracts';
import { Button } from '@/components/ui/button';
import { formatMoney, parseMinor, toMajor } from '../money';
import type { OrderDetail } from '../types';

export interface Line {
  key: string;
  name: string;
  sku: string;
  quantity: string;
  price: string;
}
export interface Pricing {
  discount: string;
  shipping: string;
  tax: string;
}

let seq = 0;
export const newLine = (): Line => ({
  key: `l${++seq}`,
  name: '',
  sku: '',
  quantity: '1',
  price: '',
});
export const linesFromOrder = (items: OrderDetail['items']): Line[] =>
  items.map((i) => ({
    key: `l${++seq}`,
    name: i.name,
    sku: i.sku ?? '',
    quantity: String(i.quantity),
    price: toMajor(i.unitPriceMinor),
  }));
export const pricingFromOrder = (o: OrderDetail): Pricing => ({
  discount: o.discountMinor ? toMajor(o.discountMinor) : '',
  shipping: o.shippingMinor ? toMajor(o.shippingMinor) : '',
  tax: o.taxMinor ? toMajor(o.taxMinor) : '',
});

const field =
  'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink aria-[invalid=true]:border-danger';

export type ParsedItems = {
  name: string;
  sku?: string;
  quantity: number;
  unitPriceMinor: number;
}[];

/** Per-line problems keyed by line key, plus the parsed items (empty when anything is invalid). */
export function validateLines(lines: Line[]) {
  const errors: Record<string, string> = {};
  const items: ParsedItems = [];
  for (const l of lines) {
    const qty = /^\d{1,5}$/.test(l.quantity.trim()) ? Number(l.quantity) : 0;
    const price = parseMinor(l.price);
    if (!l.name.trim()) errors[l.key] = 'Enter an item name';
    else if (qty < 1) errors[l.key] = 'Quantity must be a whole number, 1 or more';
    else if (price === null || price > 100_000_000)
      errors[l.key] = 'Enter a valid unit price, like 12.50';
    else
      items.push({
        name: l.name.trim(),
        ...(l.sku.trim() && { sku: l.sku.trim() }),
        quantity: qty,
        unitPriceMinor: price,
      });
  }
  return { errors, items: Object.keys(errors).length ? [] : items };
}

export function parsePricing(p: Pricing) {
  const get = (v: string) => (v.trim() ? parseMinor(v) : 0);
  const discount = get(p.discount);
  const shipping = get(p.shipping);
  const tax = get(p.tax);
  const errors: Partial<Record<keyof Pricing, string>> = {};
  if (discount === null) errors.discount = 'Enter an amount like 5.00';
  if (shipping === null) errors.shipping = 'Enter an amount like 5.00';
  if (tax === null) errors.tax = 'Enter an amount like 5.00';
  return { errors, discount: discount ?? 0, shipping: shipping ?? 0, tax: tax ?? 0 };
}

/** Display-only preview using the same rules as the server; the server computes and stores the real total. */
export function previewTotals(items: ParsedItems, pr: ReturnType<typeof parsePricing>) {
  if (!items.length) return null;
  const r = computeTotals(items, pr.discount, pr.shipping, pr.tax);
  return r.ok ? r.totals : { error: r.error };
}

export function LinesEditor({
  lines,
  currency,
  errors,
  onChange,
}: {
  lines: Line[];
  currency: string;
  errors: Record<string, string>;
  onChange: (l: Line[]) => void;
}) {
  const set = (key: string, p: Partial<Line>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">
        Torio has no product catalog yet, so items are entered by hand. Prices you type are stored
        on the order and never change later.
      </p>
      {lines.map((l, i) => (
        <div key={l.key} className="rounded-xl border border-line p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_120px]">
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">
              Item {i + 1}
              <input
                aria-label={`Item ${i + 1} name`}
                aria-invalid={!!errors[l.key] && !l.name.trim()}
                value={l.name}
                maxLength={160}
                onChange={(e) => set(l.key, { name: e.target.value })}
                placeholder="e.g. Linen sofa"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-faint max-sm:hidden">
              SKU (optional)
              <input
                aria-label={`Item ${i + 1} SKU`}
                value={l.sku}
                maxLength={60}
                onChange={(e) => set(l.key, { sku: e.target.value })}
                className={field}
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-[90px_1fr_auto] items-end gap-2">
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">
              Qty
              <input
                aria-label={`Item ${i + 1} quantity`}
                inputMode="numeric"
                value={l.quantity}
                onChange={(e) => set(l.key, { quantity: e.target.value.replace(/\D/g, '') })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">
              Unit price ({currency})
              <input
                aria-label={`Item ${i + 1} unit price`}
                inputMode="decimal"
                value={l.price}
                onChange={(e) => set(l.key, { price: e.target.value.replace(/[^\d.,]/g, '') })}
                placeholder="0.00"
                className={field}
              />
            </label>
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={15} />
            </button>
          </div>
          {errors[l.key] && (
            <div role="alert" className="mt-1.5 text-xs text-danger">
              {errors[l.key]}
            </div>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={lines.length >= MAX_ORDER_LINES}
        onClick={() => onChange([...lines, newLine()])}
      >
        <Plus size={13} />
        Add item
      </Button>
    </div>
  );
}

export function PricingFields({
  value,
  currency,
  errors,
  onChange,
}: {
  value: Pricing;
  currency: string;
  errors: Partial<Record<keyof Pricing, string>>;
  onChange: (p: Pricing) => void;
}) {
  const rows: { k: keyof Pricing; label: string; hint: string }[] = [
    { k: 'discount', label: 'Discount', hint: 'Amount taken off the subtotal' },
    { k: 'shipping', label: 'Shipping', hint: 'Delivery charge' },
    { k: 'tax', label: 'Tax', hint: 'Entered manually. Torio has no tax engine' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <label key={r.k} className="flex flex-col gap-1 text-[11.5px] text-faint">
          {r.label} ({currency})
          <input
            inputMode="decimal"
            aria-label={r.label}
            aria-invalid={!!errors[r.k]}
            value={value[r.k]}
            placeholder="0.00"
            onChange={(e) => onChange({ ...value, [r.k]: e.target.value.replace(/[^\d.,]/g, '') })}
            className={field}
          />
          <span className="text-[11px]">{errors[r.k] ?? r.hint}</span>
        </label>
      ))}
    </div>
  );
}

export function TotalsSummary({
  items,
  pricing,
  currency,
}: {
  items: ParsedItems;
  pricing: ReturnType<typeof parsePricing>;
  currency: string;
}) {
  const t = previewTotals(items, pricing);
  if (!t)
    return <div className="text-[12.5px] text-faint">Totals appear once the items are valid.</div>;
  if ('error' in t)
    return (
      <div role="alert" className="text-[12.5px] text-danger">
        {t.error}
      </div>
    );
  const row = (label: string, v: number, strong = false) => (
    <div
      className={strong ? 'flex justify-between font-semibold' : 'flex justify-between text-muted'}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatMoney(v, currency)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-wash p-3 text-[13px]">
      {row('Subtotal', t.subtotalMinor)}
      {row('Discount', -pricing.discount)}
      {row('Shipping', pricing.shipping)}
      {row('Tax', pricing.tax)}
      <div className="my-1 border-t border-line" />
      {row('Total', t.totalMinor, true)}
      <div className="text-[11.5px] text-faint">
        The server confirms the final total when you save.
      </div>
    </div>
  );
}
