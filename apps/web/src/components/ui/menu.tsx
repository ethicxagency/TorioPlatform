'use client';

import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  /** Only when it helps recognition; plain items need none. */
  icon?: LucideIcon;
  /** Optional second line. */
  description?: string;
  /** Optional shortcut or metadata, right-aligned. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Marks the current choice in a selection menu. */
  selected?: boolean;
  /** A link item; otherwise `onSelect` runs. */
  href?: string;
  onSelect?: () => void;
}

/** Shared look of a floating menu surface and its items, for menus that manage their own open state. */
export const MENU_SURFACE =
  'z-30 animate-panel-in rounded-xl border border-line bg-white p-1 shadow-popover motion-reduce:animate-none';
export const MENU_ITEM =
  'flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-wash hover:no-underline focus-visible:bg-wash focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

/**
 * The ⋯ actions menu used by table rows and cards. Opens on click or ArrowDown, moves with the arrow keys, Home and End,
 * closes on Escape, Tab or an outside click (returning focus to the button), and opens upward when there is no room below.
 */
export function ActionMenu({
  label,
  items,
  width = 200,
  align = 'right',
  className,
}: {
  /** Accessible name of the trigger, e.g. "Actions for Jane Doe". */
  label: string;
  items: (MenuItem | false | null | undefined)[];
  width?: number;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const placed = pos !== null;
  const list = items.filter((i): i is MenuItem => !!i);

  // Fixed positioning lets the menu escape cards and tables that clip their overflow. It is placed from the button's
  // rectangle (below, or above when there is no room) and follows the button while the page scrolls or resizes.
  const place = useCallback(() => {
    if (!menu.current || !btn.current) return;
    const h = menu.current.offsetHeight;
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const flip = below < h + 8 && r.top > below;
    const left = Math.min(
      Math.max(8, align === 'right' ? r.right - width : r.left),
      window.innerWidth - width - 8,
    );
    setPos({ left, top: flip ? Math.max(8, r.top - h - 4) : r.bottom + 4 });
  }, [width, align]);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);
  useEffect(() => {
    if (!open || !placed) return;
    wrap.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
      ?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, placed]);

  const close = (refocus = true) => {
    setOpen(false);
    setPos(null);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };
  const move = (to: 'next' | 'prev' | 'first' | 'last') => {
    const els = [
      ...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []),
    ];
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const n =
      to === 'first'
        ? 0
        : to === 'last'
          ? els.length - 1
          : (i + (to === 'next' ? 1 : -1) + els.length) % els.length;
    els[n]?.focus({ preventScroll: true });
  };
  if (!list.length) return null;

  return (
    <div ref={wrap} className={cn('relative', className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPos(null);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors duration-150 hover:bg-wash-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
          open && 'bg-wash-2 text-ink',
        )}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          style={{
            width,
            position: 'fixed',
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            } else if (e.key === 'Tab') close(false);
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(e.key === 'ArrowDown' ? 'next' : 'prev');
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              move(e.key === 'Home' ? 'first' : 'last');
            }
          }}
          className={MENU_SURFACE}
        >
          {list.map((it) => {
            const Icon = it.icon;
            const cls = cn(
              MENU_ITEM,
              it.danger && 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft',
              it.selected && 'bg-primary-soft/60',
            );
            const body = (
              <>
                {Icon && (
                  <Icon
                    size={15}
                    aria-hidden
                    className={cn('shrink-0', it.danger ? '' : 'text-muted')}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.label}</span>
                  {it.description && (
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {it.description}
                    </span>
                  )}
                </span>
                {it.hint && (
                  <span className="shrink-0 text-xs font-normal text-faint">{it.hint}</span>
                )}
                {it.selected && <Check size={14} aria-hidden className="shrink-0 text-primary" />}
              </>
            );
            return it.href && !it.disabled ? (
              <Link
                key={it.label}
                role="menuitem"
                href={it.href}
                className={cls}
                onClick={() => setOpen(false)}
              >
                {body}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role={it.selected !== undefined ? 'menuitemradio' : 'menuitem'}
                aria-checked={it.selected}
                disabled={it.disabled}
                className={cls}
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
