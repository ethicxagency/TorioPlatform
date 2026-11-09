'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useDismiss } from '../use-dismiss';
import { useKeepInView } from '../use-keep-in-view';

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Leading visual, e.g. an agent's initials. */
  lead?: React.ReactNode;
  /** Not pickable; `hint` explains why (shown as a tooltip). */
  disabled?: boolean;
  hint?: string;
}

interface Props {
  label: string;
  /** Label of the "no filter" choice, e.g. "Any agent"; its value is ''. Omit when a value is always required. */
  anyLabel?: string;
  /** Id for the trigger, so an external <label htmlFor> can name it. */
  id?: string;
  /** The caller renders its own visible label. */
  hideLabel?: boolean;
  disabled?: boolean;
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  /** Shown when there are no options at all (not when a search matches nothing). */
  emptyText: string;
  searchPlaceholder: string;
  /** false for short fixed lists: no visible search box, but keyboard navigation still works. Default true. */
  searchable?: boolean;
}

/**
 * Field-style trigger with an anchored, searchable listbox. Typing filters; arrows move; Enter picks; Escape
 * closes only this list (it stops there, so an enclosing popover stays open).
 */
export function SearchSelect({
  label,
  anyLabel,
  id: triggerId,
  hideLabel,
  disabled,
  options,
  value,
  onChange,
  loading,
  emptyText,
  searchPlaceholder,
  searchable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  useDismiss(wrap, open, () => setOpen(false));
  useKeepInView(panel);

  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
    return anyLabel === undefined
      ? matches
      : [{ value: '', label: anyLabel } as SearchSelectOption, ...matches];
  }, [q, options, anyLabel]);

  const openList = () => {
    setQ('');
    setActive(
      Math.max(
        0,
        (anyLabel === undefined ? options : [{ value: '' }, ...options]).findIndex(
          (o) => o.value === value,
        ),
      ),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = shown.length;
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = shown[active];
      if (o && !o.disabled) pick(o.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className="relative flex flex-col gap-1.5">
      {!hideLabel && <span className="font-label text-muted">{label}</span>}
      <button
        ref={btn}
        id={triggerId}
        disabled={disabled}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? anyLabel ?? ''}`}
        onClick={() => (open ? close() : openList())}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border bg-white pl-2.5 pr-2 text-left text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted motion-reduce:transition-none',
          open ? 'border-primary' : 'border-line hover:border-line-input',
        )}
      >
        {current?.lead}
        <span
          className={cn('min-w-0 flex-1 truncate', current ? 'font-medium text-ink' : 'text-muted')}
        >
          {current?.label ?? anyLabel ?? ''}
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn(
            'shrink-0 text-faint transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open && (
        <div
          ref={panel}
          className="absolute left-0 right-0 top-full z-20 mt-1 animate-panel-in rounded-[var(--radius-menu)] border border-line bg-white p-1 shadow-popover"
        >
          <label
            className={cn(
              searchable
                ? 'mb-1 flex h-8 items-center gap-2 rounded-[var(--radius-input)] bg-wash px-2'
                : 'sr-only',
            )}
          >
            <Search size={14} aria-hidden className="shrink-0 text-faint" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={`${listId}-${active}`}
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
            />
          </label>
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-[220px] overflow-y-auto"
          >
            {shown.map((o, i) => {
              const on = o.value === value;
              return (
                <div
                  key={o.value || '__any'}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-disabled={o.disabled || undefined}
                  title={o.disabled ? o.hint : undefined}
                  onClick={() => !o.disabled && pick(o.value)}
                  className={cn(
                    'flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[13px]',
                    o.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                    i === active && !o.disabled && 'bg-wash',
                    on ? 'bg-primary-soft font-semibold text-primary-hover' : 'text-ink',
                  )}
                >
                  {o.lead}
                  <span className={cn('min-w-0 flex-1 truncate', !o.value && !on && 'text-muted')}>
                    {o.label}
                  </span>
                  {on && (
                    <Check size={14} strokeWidth={2.25} aria-hidden className="text-primary" />
                  )}
                </div>
              );
            })}
            {loading && <div className="px-2 py-2 text-xs text-faint">Loading…</div>}
            {!loading && options.length === 0 && (
              <div className="px-2 py-2 text-xs text-faint">{emptyText}</div>
            )}
            {!loading &&
              options.length > 0 &&
              shown.length === (anyLabel === undefined ? 0 : 1) &&
              q.trim() && (
                <div className="px-2 py-2 text-xs text-faint">No match for “{q.trim()}”</div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
