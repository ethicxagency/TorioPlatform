'use client';

import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shipping providers and payment methods are lists of names a store tells its Brain it offers. There is no courier or
 * payment-gateway connection behind them, so the cards show what is true: it is listed, it can be added or removed, and it
 * never claims a "Connected" state, credentials or a connection test. Official brand logos are only used when an asset is
 * supplied for an entry (`logo`); none are bundled, so entries show a monogram or a Lucide icon instead of an invented mark.
 */
export interface CatalogEntry {
  name: string;
  category: string;
  icon?: LucideIcon;
  /** Path to an official logo asset, when one has been supplied. */
  logo?: string;
}

export const SHIPPING_CATALOG: CatalogEntry[] = [
  { name: 'Pathao', category: 'Courier service' },
  { name: 'Steadfast', category: 'Courier service' },
  { name: 'RedX', category: 'Courier service' },
  { name: 'eCourier', category: 'Courier service' },
  { name: 'Paperfly', category: 'Courier service' },
  { name: 'Sundarban', category: 'Courier service' },
];
export const PAYMENT_CATALOG: CatalogEntry[] = [
  { name: 'bKash', category: 'Mobile financial service', icon: Smartphone },
  { name: 'Nagad', category: 'Mobile financial service', icon: Smartphone },
  { name: 'Rocket', category: 'Mobile financial service', icon: Smartphone },
  { name: 'Card', category: 'Card payments', icon: CreditCard },
  { name: 'Bank transfer', category: 'Bank payments', icon: Landmark },
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

function Tile({ entry, className }: { entry: CatalogEntry; className?: string }) {
  const Icon = entry.icon;
  const [broken, setBroken] = useState(false);
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-primary-line bg-primary-soft text-[13px] font-semibold text-primary-hover',
        className,
      )}
    >
      {entry.logo && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.logo}
          alt=""
          className="h-full w-full object-contain p-1.5"
          onError={() => setBroken(true)}
        />
      ) : Icon ? (
        <Icon size={18} />
      ) : (
        monogram(entry.name)
      )}
    </span>
  );
}

function CardMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={`${name} actions`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="absolute right-0 top-9 z-30 w-40 animate-panel-in rounded-xl border border-line bg-white p-1 shadow-popover motion-reduce:animate-none"
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-2.5 text-left text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-danger-soft focus-visible:bg-danger-soft focus-visible:outline-none motion-reduce:transition-none"
          >
            <Trash2 size={14} aria-hidden />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Searchable picker: the entries Torio knows, plus a custom name. Entries already added are shown but cannot be added twice. */
function PickerDialog({
  title,
  catalog,
  values,
  customLabel,
  onPick,
  onClose,
}: {
  title: string;
  catalog: CatalogEntry[];
  values: string[];
  customLabel: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => input.current?.focus(), []);
  const has = (n: string) => values.some((v) => same(v, n));
  const term = q.trim();
  const shown = useMemo(
    () => catalog.filter((c) => !term || c.name.toLowerCase().includes(term.toLowerCase())),
    [catalog, term],
  );
  const isCustom = term.length > 0 && !catalog.some((c) => same(c.name, term));
  const pick = (name: string) => {
    if (has(name)) return setError(`${name} is already added.`);
    onPick(name);
  };
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center glass-scrim p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex max-h-[min(560px,calc(100vh-32px))] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-popover"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
          <h2 id={titleId} className="m-0 text-[15px] font-semibold">
            {title}
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
        <label className="m-3 mb-1 flex h-10 items-center gap-2 rounded-[var(--radius-input)] border border-line px-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
          <Search size={15} aria-hidden className="shrink-0 text-faint" />
          <input
            ref={input}
            aria-label="Search"
            placeholder="Search or type a name"
            value={q}
            maxLength={40}
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
        <ul className="m-0 flex-1 list-none overflow-y-auto p-2">
          {shown.map((c) => {
            const added = has(c.name);
            return (
              <li key={c.name}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => pick(c.name)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-2 py-2 text-left transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent motion-reduce:transition-none"
                >
                  <Tile entry={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {c.name}
                    </span>
                    <span className="block truncate text-xs text-muted">{c.category}</span>
                  </span>
                  {added ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-muted">
                      <Check size={13} aria-hidden /> Added
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-primary">Select</span>
                  )}
                </button>
              </li>
            );
          })}
          {isCustom && (
            <li>
              <button
                type="button"
                onClick={() => pick(term)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-2 py-2 text-left transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none motion-reduce:transition-none"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-primary-line text-primary"
                >
                  <Plus size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    Add “{term}”
                  </span>
                  <span className="block text-xs text-muted">{customLabel}</span>
                </span>
              </button>
            </li>
          )}
          {shown.length === 0 && !isCustom && (
            <li className="px-3 py-6 text-center text-[13px] text-muted">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/**
 * A card grid for a list of names (shipping providers, payment methods) with a dedicated Add card and a searchable picker.
 * Changes edit the Brain draft like every other field; nothing is saved to the server until Save Changes.
 */
export function ServiceCards({
  title,
  description,
  addTitle,
  addHint,
  pickerTitle,
  customLabel,
  emptyTitle,
  emptyText,
  catalog,
  customCategory,
  values,
  onChange,
}: {
  title: string;
  description: string;
  addTitle: string;
  addHint: string;
  pickerTitle: string;
  customLabel: string;
  emptyTitle: string;
  emptyText: string;
  catalog: CatalogEntry[];
  customCategory: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const entryOf = (name: string): CatalogEntry =>
    catalog.find((c) => same(c.name, name)) ?? { name, category: customCategory };
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="m-0 text-[14px] font-semibold text-ink">{title}</h3>
        {values.length > 0 && (
          <span className="text-xs font-medium text-muted">{values.length} added</span>
        )}
        <p className="m-0 basis-full text-[12.5px] text-muted">{description}</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5 p-0">
        {values.map((v) => {
          const e = entryOf(v);
          return (
            <li key={v}>
              <div className="flex h-full min-h-[76px] items-start gap-3 rounded-[13px] border border-line bg-white p-3 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none">
                <Tile entry={e} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{v}</div>
                  <div className="text-xs leading-snug text-muted">{e.category}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Listed in Brain
                  </div>
                </div>
                <CardMenu name={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
              </div>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex h-full min-h-[76px] w-full cursor-pointer items-center gap-3 rounded-[13px] border border-dashed border-[#C9CBD3] bg-white p-3 text-left transition-colors duration-150 hover:border-primary hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-[#C9CBD3] disabled:hover:bg-white motion-reduce:transition-none"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary"
            >
              <Plus size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-ink">{addTitle}</span>
              <span className="block text-xs text-muted">{addHint}</span>
            </span>
          </button>
        </li>
      </ul>
      {values.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-wash px-3 py-2.5 text-[12.5px] text-muted">
          {title.startsWith('Shipping') ? (
            <Truck size={15} aria-hidden className="shrink-0" />
          ) : (
            <Banknote size={15} aria-hidden className="shrink-0" />
          )}
          <span>
            <b className="font-semibold text-ink">{emptyTitle}</b> {emptyText}
          </span>
        </div>
      )}
      {picking && (
        <PickerDialog
          title={pickerTitle}
          catalog={catalog}
          values={values}
          customLabel={customLabel}
          onClose={() => setPicking(false)}
          onPick={(name) => {
            onChange([...values, name.trim()]);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
