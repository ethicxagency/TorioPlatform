'use client';

import {
  ArrowLeft,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Power,
  Search,
  Smartphone,
  Trash2,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { BrainConfig } from '@torio/contracts';
import Image from 'next/image';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ActionMenu } from '@/components/ui/menu';
import type { Toast } from '@/lib/toast';
import { areaCls } from './bits';

/**
 * Shipping providers and payment methods the store offers. The catalog (what Torio knows) is separate from the store's own
 * records (what it added, with an Active/Inactive state and customer-facing details), which live in the Brain document, so
 * every store has its own and a new store starts with none. There is no courier or payment-gateway connection behind them:
 * nothing here collects credentials or claims a "Connected" state. Official logos are used when an asset is supplied.
 */
export interface CatalogEntry {
  name: string;
  category: string;
  icon?: LucideIcon;
  /** An official logo asset stored in /public/brands, with its natural size. Never hotlinked, never redrawn or cropped. */
  logo?: Logo;
}
export interface Logo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export const SHIPPING_CATALOG: CatalogEntry[] = [
  {
    name: 'Pathao',
    category: 'Courier service',
    logo: {
      src: '/brands/pathao-courier.png',
      alt: 'Pathao Courier logo',
      width: 912,
      height: 325,
    },
  },
  {
    name: 'Steadfast',
    category: 'Courier service',
    logo: {
      src: '/brands/steadfast-courier.png',
      alt: 'Steadfast Courier logo',
      width: 640,
      height: 256,
    },
  },
  {
    name: 'RedX',
    category: 'Courier service',
    logo: { src: '/brands/redx.png', alt: 'REDX logo', width: 1024, height: 500 },
  },
  {
    name: 'eCourier',
    category: 'Courier service',
    logo: { src: '/brands/ecourier.png', alt: 'eCourier logo', width: 444, height: 90 },
  },
  {
    name: 'Paperfly',
    category: 'Courier service',
    logo: { src: '/brands/paperfly.png', alt: 'Paperfly logo', width: 1808, height: 412 },
  },
  {
    name: 'Sundarban',
    category: 'Courier service',
    logo: {
      src: '/brands/sundarban-courier.png',
      alt: 'Sundarban Courier logo',
      width: 447,
      height: 447,
    },
  },
];
export const PAYMENT_CATALOG: CatalogEntry[] = [
  {
    name: 'bKash',
    category: 'Mobile financial service',
    icon: Smartphone,
    logo: { src: '/brands/bkash.png', alt: 'bKash logo', width: 738, height: 354 },
  },
  {
    name: 'Nagad',
    category: 'Mobile financial service',
    icon: Smartphone,
    logo: { src: '/brands/nagad.png', alt: 'Nagad logo', width: 334, height: 132 },
  },
  {
    name: 'Rocket',
    category: 'Mobile financial service',
    icon: Smartphone,
    logo: { src: '/brands/rocket.png', alt: 'Rocket logo', width: 673, height: 430 },
  },
  {
    name: 'Upay',
    category: 'Mobile financial service',
    icon: Smartphone,
    logo: { src: '/brands/upay.png', alt: 'Upay logo', width: 272, height: 397 },
  },
  {
    name: 'Card',
    category: 'Card payments',
    icon: CreditCard,
    logo: { src: '/brands/card-payment.png', alt: 'Card payments icon', width: 512, height: 512 },
  },
  {
    name: 'Bank transfer',
    category: 'Bank payments',
    icon: Landmark,
    logo: { src: '/brands/bank-transfer.png', alt: 'Bank transfer icon', width: 512, height: 512 },
  },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const monogram = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/**
 * The brand slot. A real logo keeps its own aspect ratio (object-contain on white, 48px high, never stretched or recoloured);
 * an entry without a supplied logo shows a monogram or a Lucide icon in a square of the same height.
 */
function Tile({ entry, small }: { entry: CatalogEntry; small?: boolean }) {
  const Icon = entry.icon;
  const logo = entry.logo;
  const h = small ? 36 : 40;
  if (logo) {
    // Width follows the artwork (bounded), so wide logos are not forced into a square.
    const box = Math.max(
      h,
      Math.min(small ? 88 : 104, Math.round(((h - 16) * logo.width) / logo.height) + 16),
    );
    return (
      <span
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-white px-2"
        style={{ height: h, width: box }}
      >
        <Image
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          sizes="128px"
          className="object-contain"
          style={{
            height: h - 16,
            width: 'auto',
            maxWidth: '100%',
          }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{ height: h, width: h }}
      className="flex shrink-0 items-center justify-center rounded-[10px] border border-primary-line bg-primary-soft text-[13px] font-semibold text-primary-hover"
    >
      {Icon ? <Icon size={18} /> : monogram(entry.name)}
    </span>
  );
}

export interface ServiceKeys {
  list: 'providers' | 'payments';
  off: 'providersOff' | 'paymentsOff';
  notes: 'providerNotes' | 'paymentNotes';
}
export type ShippingState = Pick<BrainConfig['shipping'], ServiceKeys['list' | 'off' | 'notes']>;
type Commit = (fn: (c: BrainConfig) => void) => Promise<unknown>;

const MAX_ITEMS = 20;
const NOTE_MAX = 300;

type Flow =
  { t: 'pick' } | { t: 'form'; name: string; editing: boolean } | { t: 'remove'; name: string };

function Shell({
  label,
  onClose,
  alert,
  children,
}: {
  label: string;
  onClose: () => void;
  alert?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center glass-scrim p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex max-h-[min(600px,100vh-16px)] w-full max-w-[480px] animate-panel-in flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-popover motion-reduce:animate-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
          <h2 id={id} className="m-0 text-[15px] font-semibold">
            {label}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted hover:bg-wash"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Step 1: choose from the catalog (compact logo tiles) or name a custom one. Already-added entries cannot be added twice. */
function PickStep({
  catalog,
  has,
  full,
  customLabel,
  onPick,
}: {
  catalog: CatalogEntry[];
  has: (n: string) => boolean;
  full: boolean;
  customLabel: string;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const term = q.trim();
  const shown = useMemo(
    () => catalog.filter((c) => !term || c.name.toLowerCase().includes(term.toLowerCase())),
    [catalog, term],
  );
  const isCustom = term.length > 0 && !catalog.some((c) => same(c.name, term));
  const pick = (name: string) => {
    if (has(name)) return setError(`${name} is already added.`);
    if (full) return setError(`You can add up to ${MAX_ITEMS}. Remove one first.`);
    onPick(name);
  };
  return (
    <>
      <label className="m-3 mb-1 flex h-10 items-center gap-2 rounded-[var(--radius-input)] border border-line px-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
        <Search size={15} aria-hidden className="shrink-0 text-faint" />
        <input
          ref={input}
          aria-label="Search"
          placeholder="Search or type a name"
          value={q}
          maxLength={60}
          onChange={(e) => {
            setQ(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const first = shown.find((c) => !has(c.name));
            if (first) pick(first.name);
            else if (isCustom) pick(term);
          }}
          className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="m-0 px-4 pb-1 text-xs text-danger">
          {error}
        </p>
      )}
      <ul className="m-0 grid flex-1 list-none grid-cols-1 gap-1.5 overflow-y-auto p-3 sm:grid-cols-2">
        {shown.map((c) => {
          const added = has(c.name);
          return (
            <li key={c.name}>
              <button
                type="button"
                disabled={added}
                onClick={() => pick(c.name)}
                className="flex h-full w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-white p-2 text-left transition-colors duration-150 hover:border-primary hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-default disabled:opacity-55 disabled:hover:border-line disabled:hover:bg-white motion-reduce:transition-none"
              >
                <Tile entry={c} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {c.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {added ? 'Already added' : c.category}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {isCustom && (
          <li className="sm:col-span-2">
            <button
              type="button"
              onClick={() => pick(term)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-primary-line bg-white p-2 text-left transition-colors duration-150 hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary"
              >
                <Plus size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  Add “{term}”
                </span>
                <span className="block text-[11.5px] text-muted">{customLabel}</span>
              </span>
            </button>
          </li>
        )}
        {shown.length === 0 && !isCustom && (
          <li className="px-3 py-6 text-center text-[13px] text-muted sm:col-span-2">
            No matches.
          </li>
        )}
      </ul>
    </>
  );
}

/** Step 2 (and Edit): the details customers should hear. Saved through the Brain; the card appears only once the save succeeds. */
function FormStep({
  entry,
  initial,
  editing,
  noteLabel,
  notePlaceholder,
  noteHint,
  onBack,
  onSave,
}: {
  entry: CatalogEntry;
  initial: string;
  editing: boolean;
  noteLabel: string;
  notePlaceholder: string;
  noteHint: string;
  onBack?: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  useEffect(() => area.current?.focus(), []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (note.length > NOTE_MAX) return setError(`Keep it under ${NOTE_MAX} characters.`);
    setSaving(true);
    setError('');
    try {
      await onSave(note.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-3 rounded-xl border border-line-subtle bg-wash p-2.5">
          <Tile entry={entry} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink">{entry.name}</div>
            <div className="text-xs text-muted">{entry.category}</div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-[13px] font-medium">
            {noteLabel} <span className="font-normal text-faint">(optional)</span>
          </label>
          <textarea
            id={noteId}
            ref={area}
            rows={4}
            value={note}
            maxLength={NOTE_MAX + 40}
            placeholder={notePlaceholder}
            aria-invalid={note.length > NOTE_MAX || undefined}
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
            className={areaCls}
          />
          <div className="flex justify-between gap-3 text-xs text-faint">
            <span>{noteHint}</span>
            <span className={note.length > NOTE_MAX ? 'text-danger' : ''}>
              {note.length}/{NOTE_MAX}
            </span>
          </div>
        </div>
        {error && (
          <p role="alert" className="m-0 text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line-subtle px-4 py-3">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            <ArrowLeft aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={saving}>
          {editing ? 'Save details' : `Add ${entry.name}`}
        </Button>
      </div>
    </form>
  );
}

function RemoveStep({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="m-0 text-[13.5px] leading-relaxed text-muted">
        <b className="font-semibold text-ink">{name}</b> and its details will be removed from this
        store&apos;s Brain, and the AI will stop mentioning it. You can add it again later.
      </p>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onConfirm();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not remove. Try again.');
              setBusy(false);
            }
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * The store's own shipping providers or payment methods. Every change (add, edit details, enable or disable, remove) is saved
 * to the Brain on its own, against the last saved version, and the card shows only after the server accepts it. Disabling keeps
 * the details; the AI is only told about enabled entries.
 */
export function ServiceList({
  kind,
  keys,
  value,
  commit,
  canWrite,
  toast,
}: {
  kind: 'shipping' | 'payment';
  keys: ServiceKeys;
  value: ShippingState;
  commit: Commit;
  canWrite: boolean;
  toast: Toast;
}) {
  const ship = kind === 'shipping';
  const catalog = ship ? SHIPPING_CATALOG : PAYMENT_CATALOG;
  const title = ship ? 'Shipping Providers' : 'Payment Methods';
  const noun = ship ? 'shipping provider' : 'payment method';
  const HeaderIcon = ship ? Truck : Wallet;
  const [flow, setFlow] = useState<Flow | null>(null);
  const enabled = value[keys.list];
  const off = value[keys.off];
  const notes = value[keys.notes] as Record<string, string>;
  const all = [...enabled, ...off];
  const has = (n: string) => all.some((v) => same(v, n));
  const entryOf = (name: string): CatalogEntry =>
    catalog.find((c) => same(c.name, name)) ?? {
      name,
      category: ship ? 'Custom provider' : 'Custom payment method',
    };
  const noteOf = (name: string) =>
    notes[Object.keys(notes).find((k) => same(k, name)) ?? name] ?? '';

  const withNote = (c: BrainConfig, name: string, note: string) => {
    const n = c.shipping[keys.notes] as Record<string, string>;
    for (const k of Object.keys(n)) if (same(k, name)) delete n[k];
    if (note) n[name] = note;
  };
  const run = async (fn: (c: BrainConfig) => void, done: string) => {
    await commit(fn);
    toast.success(done);
  };
  const add = (name: string, note: string) =>
    run((c) => {
      if (c.shipping[keys.list].concat(c.shipping[keys.off]).some((v) => same(v, name))) return;
      c.shipping[keys.list].push(name);
      withNote(c, name, note);
    }, `${name} added.`);
  const edit = (name: string, note: string) =>
    run((c) => withNote(c, name, note), `${name} updated.`);
  const setOn = (name: string, on: boolean) =>
    run(
      (c) => {
        const s = c.shipping;
        const from = on ? s[keys.off] : s[keys.list];
        const to = on ? s[keys.list] : s[keys.off];
        const i = from.findIndex((v) => same(v, name));
        if (i >= 0) to.push(...from.splice(i, 1));
      },
      `${name} ${on ? 'enabled' : 'disabled'}.`,
    );
  const remove = (name: string) =>
    run((c) => {
      const s = c.shipping;
      s[keys.list] = s[keys.list].filter((v) => !same(v, name));
      s[keys.off] = s[keys.off].filter((v) => !same(v, name));
      withNote(c, name, '');
    }, `${name} removed.`);

  const notePlaceholder = ship
    ? 'e.g. Delivery time and booking notes for this courier'
    : 'e.g. How customers should pay and what to send you afterwards';
  const noteHint = ship
    ? 'Shown to the AI and customers. Never enter passwords or API keys.'
    : 'Shown to the AI and customers. Never enter card numbers, passwords or API keys.';

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary"
          >
            <HeaderIcon size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="m-0 text-[14px] font-semibold text-ink">{title}</h3>
              {all.length > 0 && (
                <span className="text-xs font-medium text-muted">{all.length} added</span>
              )}
            </div>
            <p className="m-0 text-[12.5px] text-muted">
              {ship
                ? 'Manage the courier services available to your store.'
                : 'Manage how your customers can pay for their orders.'}
            </p>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setFlow({ t: 'pick' })}>
            <Plus aria-hidden /> {ship ? 'Add Shipping Provider' : 'Add Payment Method'}
          </Button>
        )}
      </div>

      {all.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[13px] border border-dashed border-line bg-white px-4 py-8 text-center">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"
          >
            <HeaderIcon size={20} />
          </span>
          <div className="text-[14px] font-semibold text-ink">
            {ship ? 'No shipping providers added yet' : 'No payment methods added yet'}
          </div>
          <p className="m-0 max-w-sm text-[12.5px] text-muted">
            {ship
              ? 'Add your preferred courier service to start delivering orders.'
              : 'Add a payment method to start receiving payments from customers.'}
          </p>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => setFlow({ t: 'pick' })}
            >
              <Plus aria-hidden /> {ship ? 'Add Shipping Provider' : 'Add Payment Method'}
            </Button>
          )}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5 p-0">
          {all.map((name) => {
            const e = entryOf(name);
            const on = enabled.some((v) => same(v, name));
            const note = noteOf(name);
            return (
              <li key={name}>
                <div
                  className={`flex h-full flex-col gap-2 rounded-[13px] border border-line bg-white p-3 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none ${
                    on ? '' : 'bg-wash/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={on ? '' : 'opacity-60 grayscale'}>
                      <Tile entry={e} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
                      <div className="truncate text-xs text-muted">{e.category}</div>
                    </div>
                    {canWrite && (
                      <ActionMenu
                        label={`Actions for ${name}`}
                        width={190}
                        items={[
                          {
                            label: 'Edit details',
                            icon: Pencil,
                            onSelect: () => setFlow({ t: 'form', name, editing: true }),
                          },
                          {
                            label: on ? 'Disable' : 'Enable',
                            icon: Power,
                            onSelect: () =>
                              setOn(name, !on).catch((err: unknown) =>
                                toast.error(
                                  err instanceof Error ? err.message : 'Could not update.',
                                ),
                              ),
                          },
                          {
                            label: 'Remove',
                            icon: Trash2,
                            danger: true,
                            onSelect: () => setFlow({ t: 'remove', name }),
                          },
                        ]}
                      />
                    )}
                  </div>
                  {note && (
                    <p className="m-0 line-clamp-2 text-xs leading-snug text-muted">{note}</p>
                  )}
                  <div className="mt-auto flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                        on ? 'bg-[#EAF8EF] text-[#166534]' : 'bg-[#F1F2F5] text-[#62656D]'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-[#16A34A]' : 'bg-[#9A9DA6]'}`}
                      />
                      {on ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {flow?.t === 'pick' && (
        <Shell label={`Add ${noun}`} onClose={() => setFlow(null)}>
          <PickStep
            catalog={catalog}
            has={has}
            full={all.length >= MAX_ITEMS}
            customLabel={ship ? 'Add as a custom provider' : 'Add as a custom method'}
            onPick={(name) => setFlow({ t: 'form', name, editing: false })}
          />
        </Shell>
      )}
      {flow?.t === 'form' && (
        <Shell
          label={flow.editing ? `Edit ${flow.name}` : `Set up ${flow.name}`}
          onClose={() => setFlow(null)}
        >
          <FormStep
            key={flow.name}
            entry={entryOf(flow.name)}
            initial={flow.editing ? noteOf(flow.name) : ''}
            editing={flow.editing}
            noteLabel={ship ? 'Delivery details' : 'Payment instructions'}
            notePlaceholder={notePlaceholder}
            noteHint={noteHint}
            onBack={flow.editing ? undefined : () => setFlow({ t: 'pick' })}
            onSave={async (note) => {
              await (flow.editing ? edit(flow.name, note) : add(flow.name, note));
              setFlow(null);
            }}
          />
        </Shell>
      )}
      {flow?.t === 'remove' && (
        <Shell label={`Remove ${flow.name}?`} alert onClose={() => setFlow(null)}>
          <RemoveStep
            name={flow.name}
            onCancel={() => setFlow(null)}
            onConfirm={async () => {
              await remove(flow.name);
              setFlow(null);
            }}
          />
        </Shell>
      )}
    </section>
  );
}
