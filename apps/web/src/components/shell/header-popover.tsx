'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useKeepInView } from '@/features/inbox/use-keep-in-view';
import { cn } from '@/lib/utils';
import { useShell } from './shell-context';

/** The one panel look every header dropdown shares (search results use the same border, radius and shadow). */
export const HEADER_PANEL =
  'absolute right-0 top-[46px] z-50 animate-panel-in rounded-xl border border-line glass-menu shadow-popover motion-reduce:animate-none';

export const HEADER_ICON_BTN =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

const CloseCtx = createContext<() => void>(() => undefined);
/** Lets an item inside a header popover close it (and return focus to the trigger) after it acts. */
export const usePopoverClose = () => useContext(CloseCtx);

interface Props {
  /** Accessible name of the trigger. */
  label: string;
  tooltip?: string;
  role: 'menu' | 'dialog';
  panelClassName?: string;
  triggerClassName?: string;
  trigger: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
}

/**
 * Anchored header dropdown: closes on outside click and Escape (through the shell's Escape stack), returns focus to
 * its trigger, keeps itself inside the viewport, and, as a menu, supports arrow/Home/End keys between items.
 */
export function HeaderPopover({
  label,
  tooltip,
  role,
  panelClassName,
  triggerClassName,
  trigger,
  children,
}: Props) {
  const { registerEscape } = useShell();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(wrap, open, () => setOpen(false));
  useKeepInView(panel);

  const close = useCallback(() => {
    setOpen(false);
    btn.current?.focus();
  }, []);
  useEffect(() => (open ? registerEscape(close) : undefined), [open, registerEscape, close]);
  // Opening a menu moves focus to its first item; a dialog keeps focus on the trigger.
  useEffect(() => {
    if (open && role === 'menu')
      panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, role]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (role !== 'menu') return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={tooltip ?? label}
        aria-haspopup={role}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(HEADER_ICON_BTN, open && 'bg-wash text-ink', triggerClassName)}
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role={role}
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(HEADER_PANEL, panelClassName)}
        >
          <CloseCtx.Provider value={close}>{children}</CloseCtx.Provider>
        </div>
      )}
    </div>
  );
}
