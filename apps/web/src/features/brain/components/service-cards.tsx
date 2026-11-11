'use client';

import {
  Banknote,
  Check,
  CreditCard,
  Landmark,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActionMenu } from '@/components/ui/menu';

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
  /** An official logo asset stored in /public/brands, with its natural size. Never hotlinked, never redrawn or cropped. */
  logo?: Logo;
}
export interface Logo {
  src: string;
  alt: string;
  width: number;
  height: number;
  /**
   * Some supplied artwork sits in a lot of empty margin (a square canvas around a wide logo). The file is untouched; this
   * only magnifies it inside the logo box (which clips the margin, never the artwork) so the mark is legible.
   */
  zoom?: number;
}

export const SHIPPING_CATALOG: CatalogEntry[] = [
  {
    name: 'Pathao',
    category: 'Courier service',
    logo: {
      src: '/brands/pathao-courier.png',
      alt: 'Pathao Courier logo',
      width: 1200,
      height: 1200,
      zoom: 2.2,
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

/**
 * The brand slot. A real logo keeps its own aspect ratio (object-contain on white, 48px high, never stretched or recoloured);
 * an entry without a supplied logo shows a monogram or a Lucide icon in a square of the same height.
 */
function Tile({ entry, small }: { entry: CatalogEntry; small?: boolean }) {
  const Icon = entry.icon;
  const logo = entry.logo;
  const h = small ? 40 : 48;
  if (logo) {
    // Width follows the artwork (bounded), so wide logos are not forced into a square.
    const box = Math.max(
      h,
      Math.min(small ? 96 : 128, Math.round(((h - 12) * logo.width) / logo.height) + 16),
    );
    return (
      <span
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-white"
        style={{ height: h, width: logo.zoom ? h * 2 : box }}
      >
        <Image
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          sizes="128px"
          className="object-contain"
          style={{
            height: h - 12,
            width: 'auto',
            maxWidth: '100%',
            transform: logo.zoom ? `scale(${logo.zoom})` : undefined,
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

function CardMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <ActionMenu
      label={`Actions for ${name}`}
      width={160}
      items={[{ label: 'Remove', icon: Trash2, danger: true, onSelect: onRemove }]}
    />
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
                  <Tile entry={c} small />
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
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 p-0">
        {values.map((v) => {
          const e = entryOf(v);
          return (
            <li key={v}>
              <div className="flex h-full flex-col gap-2.5 rounded-[13px] border border-line bg-white p-3 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none">
                <div className="flex items-start justify-between gap-2">
                  <Tile entry={e} />
                  <CardMenu name={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{v}</div>
                  <div className="text-xs leading-snug text-muted">{e.category}</div>
                </div>
                <div className="mt-auto flex items-center gap-1.5 text-[11.5px] text-muted">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Listed in Brain
                </div>
              </div>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex h-full min-h-[108px] w-full cursor-pointer flex-col items-start justify-between gap-3 rounded-[13px] border border-dashed border-[#C9CBD3] bg-white p-3 text-left transition-colors duration-150 hover:border-primary hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-[#C9CBD3] disabled:hover:bg-white motion-reduce:transition-none"
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
