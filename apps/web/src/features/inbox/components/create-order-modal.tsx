'use client';

import { currencyDef, MAX_ORDER_LINES } from '@torio/contracts';
import { Loader2, Minus, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog';
import { useBrain } from '@/features/brain/queries';
import { DEFAULT_CURRENCY, orderCurrencies } from '@/features/orders/constants';
import { formatMoney, parseMinor } from '@/features/orders/money';
import {
  newLine,
  parsePricing,
  previewTotals,
  validateLines,
  type Line,
} from '@/features/orders/components/order-fields';
import type { CreateOrderBody } from '@/features/orders/queries';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { initialsOf } from '../format';
import type { Conversation } from '../types';
import { ChannelBadge } from './channel-badge';

interface Props {
  c: Conversation;
  /** Offer to put an order summary into the reply draft. */
  offerSummary: boolean;
  onClose: () => void;
  onCreate: (body: CreateOrderBody, opts: { addSummary: boolean }) => Promise<unknown>;
}

type Product = {
  id: string;
  name: string;
  price: string;
  category: string;
  stock: string;
  options: { label: string; values: string[] }[];
};

const split = (s: string) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** Brain prices are free text ("1450", "৳1,450"); only a plain amount becomes a price, otherwise the agent types it. */
const priceOf = (text: string) => parseMinor(text.replace(/[^\d.,]/g, ''));

const input =
  'h-10 w-full rounded-[var(--radius-input)] border border-line-input bg-white px-3 text-[14px] text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 aria-[invalid=true]:border-danger';
const label = 'mb-1.5 block font-label text-ink';
const optional = <span className="font-normal text-faint"> · Optional</span>;

/**
 * Create order from a conversation, as a centered modal (near full screen on phones). The customer and
 * conversation come from the chat. Items come from the Brain product catalogue or are typed by hand;
 * the order is saved through the existing Orders API, which computes the final totals.
 */
export function CreateOrderModal({ c, offerSummary, onClose, onCreate }: Props) {
  const { workspaceId: ws, workspace } = useWorkspace();
  const brain = useBrain(ws);
  const titleId = useId();
  const currencyChoices = orderCurrencies(workspace?.defaultCurrency);
  const [currency, setCurrency] = useState<string>(currencyChoices[0] ?? DEFAULT_CURRENCY);
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [picking, setPicking] = useState<{ p: Product; choice: Record<string, string> } | null>(
    null,
  );
  const [description, setDescription] = useState('');
  const [extras, setExtras] = useState(false);
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [addSummary, setAddSummary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // One key per drawer session: a retry after a network failure can't create a second order.
  const requestId = useRef(crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);

  // Capture the opener before the search field takes focus, and hand focus back to it on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    // Deferred: closing from an outside mousedown would otherwise be followed by the browser moving focus to <body>.
    return () => {
      setTimeout(() => prev?.focus(), 0);
    };
  }, []);
  /** Anything typed or picked that an accidental outside click would throw away. */
  const dirty =
    lines.some((l) => l.name.trim() || l.price.trim()) ||
    !!description.trim() ||
    !!discount.trim() ||
    !!shipping.trim();

  const products: Product[] = useMemo(
    () =>
      (brain.data?.config.products ?? [])
        .filter((p) => p.name.trim())
        .map((p) => ({
          id: p.id,
          name: p.name.trim(),
          price: p.price,
          category: p.category,
          stock: p.stock,
          options: [
            { label: 'Variant', values: split(p.variants) },
            { label: 'Size', values: split(p.sizes) },
            { label: 'Colour', values: split(p.colors) },
          ].filter((o) => o.values.length > 0),
        })),
    [brain.data],
  );
  const q = query.trim().toLowerCase();
  const matches = q
    ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q)).slice(0, 8)
    : products.slice(0, 8);

  // A nameless manual line still needs a name for the order; it is saved as "Custom item".
  const named = lines.map((l) => (l.name.trim() ? l : { ...l, name: 'Custom item' }));
  const v = validateLines(named);
  const pr = parsePricing({ discount, shipping, tax: '' });
  const totals = previewTotals(v.items, pr);
  const totalsError = totals && 'error' in totals ? totals.error : '';
  const valid = v.items.length > 0 && Object.keys(pr.errors).length === 0 && !totalsError && !busy;

  const patch = (key: string, p: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addLine = (l: Line) =>
    setLines((ls) => {
      // Replace the untouched starter line instead of leaving an empty row above the product.
      const [first] = ls;
      const blank = ls.length === 1 && first && !first.name.trim() && !first.price.trim();
      return blank ? [l] : [...ls, l].slice(0, MAX_ORDER_LINES);
    });

  const addProduct = (p: Product, choice: Record<string, string>) => {
    const picked = p.options.map((o) => choice[o.label]).filter(Boolean);
    const minor = priceOf(p.price);
    addLine({
      ...newLine(),
      name: (picked.length ? `${p.name} (${picked.join(', ')})` : p.name).slice(0, 160),
      price: minor !== null ? (minor / 100).toFixed(2) : '',
    });
    setPicking(null);
    setQuery('');
    setSearchOpen(false);
  };
  const choose = (p: Product) => {
    if (p.options.length) {
      setPicking({ p, choice: Object.fromEntries(p.options.map((o) => [o.label, o.values[0]!])) });
      setSearchOpen(false);
    } else addProduct(p, {});
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(
        {
          customerId: c.customer.id,
          conversationId: c.id,
          currency: currency as CreateOrderBody['currency'],
          items: v.items,
          discountMinor: pr.discount,
          shippingMinor: pr.shipping,
          taxMinor: 0,
          ...(description.trim() && { note: description.trim() }),
          requestId: requestId.current,
        },
        { addSummary: offerSummary && addSummary },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the order');
      setBusy(false);
    }
  };

  const symbol = currencyDef(currency)?.symbol ?? currency;
  const money = (minor: number) => formatMoney(minor, currency);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center glass-scrim sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // An outside click only closes straight away when nothing would be lost.
        if (e.target !== e.currentTarget || busy) return;
        if (dirty) setConfirmDiscard(true);
        else onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Escape closes only the modal (the search results first); it doesn't reach the Inbox's own handler.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          if (searchOpen) setSearchOpen(false);
          else if (!busy) onClose();
        }}
        className="flex h-[calc(100dvh-32px)] w-full animate-modal-in flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-popover motion-reduce:animate-none sm:h-auto sm:max-h-[min(720px,calc(100dvh-48px))] sm:max-w-[560px] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line-subtle px-5 py-3.5">
          <h2 id={titleId} className="m-0 flex-1 font-section-title text-ink">
            Create order
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="-mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-wash hover:text-ink disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {/* Customer from the active conversation. */}
          <div className="flex items-center gap-3 py-3">
            <span className="relative shrink-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-line-subtle text-[14px] font-semibold text-muted">
                {initialsOf(c.customer.name)}
              </span>
              <span className="absolute -bottom-0.5 -left-0.5">
                <ChannelBadge provider={c.channel.provider} />
              </span>
            </span>
            <div className="min-w-0">
              <div className="truncate font-card-title text-ink">{c.customer.name}</div>
              {(c.customer.phone || c.customer.email) && (
                <div className="truncate text-xs text-muted tabular-nums">
                  {c.customer.phone || c.customer.email}
                </div>
              )}
            </div>
          </div>

          {/* Catalogue: the products saved in Brain. */}
          <div className="relative mt-3">
            <label htmlFor={`${titleId}-search`} className={label}>
              Search catalog
            </label>
            <div className="relative">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                id={`${titleId}-search`}
                ref={searchRef}
                type="search"
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls={`${titleId}-results`}
                autoComplete="off"
                placeholder="Search products"
                value={query}
                onClick={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) {
                    e.preventDefault();
                    choose(matches[0]);
                  }
                }}
                className={cn(input, 'pl-9')}
              />
            </div>
            {searchOpen && (
              <div
                id={`${titleId}-results`}
                role="listbox"
                aria-label="Products"
                className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 animate-panel-in overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-popover"
              >
                {brain.isPending ? (
                  <div className="flex items-center gap-2 p-3 text-[13px] text-muted">
                    <Loader2 size={14} className="animate-spin" aria-hidden /> Loading products…
                  </div>
                ) : brain.isError ? (
                  <p className="m-0 p-3 text-[13px] text-danger">
                    Couldn&apos;t load the catalog. Enter the item by hand below.
                  </p>
                ) : products.length === 0 ? (
                  <p className="m-0 p-3 text-[13px] text-muted">
                    No products in the catalog yet. Products are added in Brain.
                  </p>
                ) : matches.length === 0 ? (
                  <p className="m-0 p-3 text-[13px] text-muted">
                    No products match &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : (
                  matches.map((p) => {
                    const minor = priceOf(p.price);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(p)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left hover:bg-wash"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wash-2 text-faint">
                          <Package size={16} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-ink">
                            {p.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {[p.category, p.stock].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums">
                          {minor !== null ? money(minor) : p.price || '—'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            {searchOpen && (
              // Closes the results when clicking anywhere else in the drawer.
              <div className="fixed inset-0 z-[5]" onClick={() => setSearchOpen(false)} />
            )}
            <button
              type="button"
              onClick={() => addLine(newLine())}
              className="mt-2 cursor-pointer text-[13px] font-medium text-primary hover:underline"
            >
              Or enter details manually
            </button>
          </div>

          {picking && (
            <div className="mt-3 rounded-xl border border-line bg-wash p-3">
              <div className="mb-2 text-[13px] font-semibold text-ink">{picking.p.name}</div>
              <div className="grid grid-cols-2 gap-2">
                {picking.p.options.map((o) => (
                  <label key={o.label} className="text-xs text-muted">
                    {o.label}
                    <select
                      value={picking.choice[o.label]}
                      onChange={(e) =>
                        setPicking({
                          ...picking,
                          choice: { ...picking.choice, [o.label]: e.target.value },
                        })
                      }
                      className={cn(input, 'mt-1 h-9 text-[13px]')}
                    >
                      {o.values.map((val) => (
                        <option key={val}>{val}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPicking(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => addProduct(picking.p, picking.choice)}>
                  Add to order
                </Button>
              </div>
            </div>
          )}

          {/* Items: one card per line; the order model supports several. */}
          <div className="mt-5 flex flex-col gap-3">
            {lines.map((l, i) => {
              // Show a line's problem once its amount has been typed; until then the button stays disabled.
              const err = l.price.trim() ? v.errors[l.key] : undefined;
              return (
                <fieldset
                  key={l.key}
                  className="m-0 rounded-xl border border-line p-3.5"
                  aria-label={`Item ${i + 1}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <legend className="contents text-xs font-semibold uppercase tracking-[0.05em] text-faint">
                      Item {lines.length > 1 ? i + 1 : ''}
                    </legend>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove item ${i + 1}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <label className={label}>
                    Product name{optional}
                    <input
                      value={l.name}
                      maxLength={160}
                      placeholder="Add a product name"
                      onChange={(e) => patch(l.key, { name: e.target.value })}
                      className={cn(input, 'mt-1.5 font-normal')}
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                    <label className={label}>
                      Amount
                      <span className="relative mt-1.5 block">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-normal text-muted">
                          {symbol}
                        </span>
                        <input
                          inputMode="decimal"
                          aria-label={`Item ${i + 1} amount`}
                          aria-invalid={!!err}
                          value={l.price}
                          placeholder="0.00"
                          onChange={(e) => patch(l.key, { price: e.target.value })}
                          className={cn(input, 'pl-8 font-normal tabular-nums')}
                        />
                      </span>
                    </label>
                    <div>
                      <span className={label}>Qty</span>
                      <div className="flex h-10 items-center rounded-[var(--radius-input)] border border-line-input">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of item ${i + 1}`}
                          disabled={Number(l.quantity) <= 1}
                          onClick={() =>
                            patch(l.key, { quantity: String(Math.max(1, Number(l.quantity) - 1)) })
                          }
                          className="flex h-full w-9 cursor-pointer items-center justify-center text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          inputMode="numeric"
                          aria-label={`Item ${i + 1} quantity`}
                          value={l.quantity}
                          onChange={(e) =>
                            patch(l.key, {
                              quantity: e.target.value.replace(/\D/g, '').slice(0, 5),
                            })
                          }
                          className="h-full w-10 border-none bg-transparent text-center text-[14px] tabular-nums text-ink focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Increase quantity of item ${i + 1}`}
                          onClick={() =>
                            patch(l.key, {
                              quantity: String(Math.min(10_000, Number(l.quantity || 0) + 1)),
                            })
                          }
                          className="flex h-full w-9 cursor-pointer items-center justify-center text-muted hover:text-ink"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                  {err && (
                    <p role="alert" className="m-0 mt-2 text-xs text-danger">
                      {err}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_140px] gap-3">
            <label className={label}>
              Description{optional}
              <textarea
                rows={2}
                maxLength={2000}
                value={description}
                placeholder="Add description"
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 block w-full resize-y rounded-[var(--radius-input)] border border-line-input bg-white px-3 py-2 text-[14px] font-normal text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15"
              />
              <span className="mt-1 block text-xs font-normal text-faint">
                Saved as an internal note on the order.
              </span>
            </label>
            <label className={label}>
              Currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={cn(input, 'mt-1.5 font-normal')}
              >
                {currencyChoices.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {extras ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(
                [
                  ['Discount', discount, setDiscount, pr.errors.discount],
                  ['Delivery charge', shipping, setShipping, pr.errors.shipping],
                ] as const
              ).map(([name, val, set, err]) => (
                <label key={name} className={label}>
                  {name}
                  {optional}
                  <span className="relative mt-1.5 block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-normal text-muted">
                      {symbol}
                    </span>
                    <input
                      inputMode="decimal"
                      aria-invalid={!!err}
                      value={val}
                      placeholder="0.00"
                      onChange={(e) => set(e.target.value)}
                      className={cn(input, 'pl-8 font-normal tabular-nums')}
                    />
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExtras(true)}
              className="mt-3 cursor-pointer text-[13px] font-medium text-primary hover:underline"
            >
              Add a discount or delivery charge
            </button>
          )}

          {totals && !('error' in totals) && (
            <dl className="m-0 mt-5 rounded-xl bg-wash p-3.5 text-[13px]">
              {[
                ['Subtotal', totals.subtotalMinor],
                ...(pr.discount ? [['Discount', -pr.discount] as const] : []),
                ...(pr.shipping ? [['Delivery', pr.shipping] as const] : []),
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between py-0.5 text-muted">
                  <dt>{k}</dt>
                  <dd className="m-0 tabular-nums">
                    {Number(val) < 0 ? `−${money(-Number(val))}` : money(Number(val))}
                  </dd>
                </div>
              ))}
              <div className="mt-1.5 flex justify-between border-t border-line pt-2 font-semibold text-ink">
                <dt>Total</dt>
                <dd className="m-0 tabular-nums">{money(totals.totalMinor)}</dd>
              </div>
            </dl>
          )}
          {totalsError && (
            <p role="alert" className="m-0 mt-3 text-xs text-danger">
              {totalsError}
            </p>
          )}

          {offerSummary && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={addSummary}
                onChange={(e) => setAddSummary(e.target.checked)}
                className="mt-0.5 accent-[var(--color-primary)]"
              />
              <span>
                Add an order summary to my reply
                <span className="block text-xs text-muted">
                  It goes into the message box; nothing is sent until you press Send.
                </span>
              </span>
            </label>
          )}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
            >
              {error}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-line-subtle bg-white px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
          <Button disabled={!valid} loading={busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create order'}
          </Button>
        </footer>
      </div>
      {confirmDiscard && (
        <ConfirmDialog
          title="Discard this order?"
          body="You have items or details that haven't been saved. Closing now will lose them."
          confirmLabel="Discard order"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
        />
      )}
    </div>
  );
}
