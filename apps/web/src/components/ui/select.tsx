'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MENU_SURFACE } from './menu';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional second line. */
  description?: string;
  disabled?: boolean;
}

/** Lists longer than this get a search box. */
const SEARCH_FROM = 10;

/**
 * A listbox select for filters, sorts and quick choices. It is a controlled value, like a native select: `onChange` runs
 * with the chosen value. Keyboard: ArrowDown/Up/Enter/Space open it, arrows, Home and End move, typing jumps to a match,
 * Enter or Space choose, Escape closes and returns focus, Tab and outside clicks dismiss. The panel is positioned from the
 * trigger (below, or above when there is no room) so cards and tables that clip their overflow cannot cut it off.
 *
 * With a `placeholder` and an empty value it works as an action picker ("Change status…"): the placeholder stays shown.
 */
export function Select({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  placeholder,
  disabled,
  className,
  panelMinWidth = 180,
  tone = 'light',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  'aria-label'?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Size and layout of the trigger, e.g. `w-full` or `min-w-[140px]`. */
  className?: string;
  panelMinWidth?: number;
  /** `dark` for triggers on a dark bar. */
  tone?: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const id = useId();
  // A select named by a wrapping <label> has no aria-label; the list takes the label's own text.
  const [labelText, setLabelText] = useState('');

  const searchable = options.length > SEARCH_FROM;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  }, [options, q]);
  const current = options.find((o) => o.value === value);

  const place = useCallback(() => {
    if (!trigger.current || !panel.current) return;
    const r = trigger.current.getBoundingClientRect();
    const h = panel.current.offsetHeight;
    const width = Math.max(r.width, panelMinWidth);
    const below = window.innerHeight - r.bottom;
    const flip = below < h + 8 && r.top > below;
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      top: flip ? Math.max(8, r.top - h - 4) : r.bottom + 4,
      width,
    });
  }, [panelMinWidth]);
  useLayoutEffect(() => {
    if (open && !ariaLabel) {
      const l = trigger.current?.labels?.[0];
      setLabelText(
        l
          ? [...l.childNodes]
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent)
              .join('')
              .trim()
          : '',
      );
    }
    if (open) place();
  }, [open, place, ariaLabel, shown.length]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', away);
    };
  }, [open, place]);

  const rows = () => [
    ...(panel.current?.querySelectorAll<HTMLElement>(
      '[role="option"]:not([aria-disabled="true"])',
    ) ?? []),
  ];
  // Once placed, focus the search box, or the chosen option (else the first).
  useEffect(() => {
    if (!open || !pos) return;
    if (searchable) search.current?.focus({ preventScroll: true });
    else {
      const list = rows();
      (list.find((r) => r.getAttribute('aria-selected') === 'true') ?? list[0])?.focus({
        preventScroll: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null]);

  const close = (refocus = true) => {
    setOpen(false);
    setPos(null);
    setQ('');
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (o: SelectOption) => {
    if (o.disabled) return;
    close();
    if (o.value !== value || placeholder) onChange(o.value);
  };
  const move = (to: 'next' | 'prev' | 'first' | 'last') => {
    const list = rows();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const n =
      to === 'first'
        ? 0
        : to === 'last'
          ? list.length - 1
          : Math.min(list.length - 1, Math.max(0, i + (to === 'next' ? 1 : -1)));
    list[n]?.focus({ preventScroll: true });
    list[n]?.scrollIntoView({ block: 'nearest' });
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') close(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.target === search.current && e.key === 'ArrowDown') move('first');
      else move(e.key === 'ArrowDown' ? 'next' : 'prev');
    } else if ((e.key === 'Home' || e.key === 'End') && e.target !== search.current) {
      e.preventDefault();
      move(e.key === 'Home' ? 'first' : 'last');
    } else if (e.target !== search.current) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (el && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const o = options.find((x) => x.value === el.dataset.value);
        if (o) choose(o);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // type-ahead
        const now = e.timeStamp;
        typed.current.s = now - typed.current.t > 600 ? e.key : typed.current.s + e.key;
        typed.current.t = now;
        const hit = rows().find((r) =>
          (r.textContent ?? '').toLowerCase().startsWith(typed.current.s.toLowerCase()),
        );
        hit?.focus({ preventScroll: true });
      }
    } else if (e.key === 'Enter' && shown[0]) {
      e.preventDefault();
      choose(shown.find((o) => !o.disabled) ?? shown[0]);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex h-9 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] border px-2.5 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
          tone === 'dark'
            ? 'h-8 rounded-lg border-white/20 bg-white/10 px-2 text-[12.5px] text-white hover:bg-white/15'
            : 'border-line bg-white text-ink hover:border-line-input focus-visible:border-primary',
          open && tone === 'light' && 'border-primary',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate', !current && 'text-faint')}>
          {placeholder && !value ? placeholder : (current?.label ?? placeholder ?? '')}
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn(
            'shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            tone === 'dark' ? 'text-white/70' : 'text-faint',
            open && 'rotate-180',
          )}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            onKeyDown={(e) => {
              // The panel lives in <body>; keep its keys from also closing a popover or dialog the trigger sits in.
              e.nativeEvent.stopPropagation();
              onPanelKey(e);
            }}
            onPointerDown={(e) => e.nativeEvent.stopPropagation()}
            style={{
              position: 'fixed',
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              width: pos?.width,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className={cn(MENU_SURFACE, 'z-[110] max-h-[300px] overflow-y-auto')}
          >
            {searchable && (
              <label className="mb-1 flex h-9 items-center gap-2 rounded-lg bg-wash px-2.5">
                <Search size={14} aria-hidden className="shrink-0 text-faint" />
                <input
                  ref={search}
                  aria-label="Search options"
                  placeholder="Search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none"
                />
              </label>
            )}
            <div id={id} role="listbox" aria-label={ariaLabel ?? (labelText || undefined)}>
              {shown.map((o) => {
                const on = o.value === value;
                return (
                  <div
                    key={o.value}
                    role="option"
                    data-value={o.value}
                    aria-selected={on}
                    aria-disabled={o.disabled || undefined}
                    tabIndex={-1}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none motion-reduce:transition-none',
                      on && 'bg-primary-soft/60 font-medium',
                      o.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.description && (
                        <span className="block text-xs font-normal text-muted">
                          {o.description}
                        </span>
                      )}
                    </span>
                    {on && <Check size={14} aria-hidden className="shrink-0 text-primary" />}
                  </div>
                );
              })}
              {shown.length === 0 && (
                <div className="px-2.5 py-3 text-center text-[13px] text-muted">No matches.</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
