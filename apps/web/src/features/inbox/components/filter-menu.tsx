'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import { useDismiss } from '../use-dismiss';
import { useKeepInView } from '../use-keep-in-view';

export interface FilterMenuOption<K extends string> {
  key: K;
  label: string;
  /** Trigger text when the toolbar is narrow; defaults to `label`. */
  short?: string;
  icon: React.ReactNode;
  /** Real count from the API; omitted while unknown. */
  count?: number;
  /** Small accent dot beside the option (e.g. Unread). */
  dot?: boolean;
  /** One-line explanation under the option label. */
  hint?: string;
}

interface Props<K extends string> {
  /** Accessible name of the control, e.g. "Conversations". */
  label: string;
  options: FilterMenuOption<K>[];
  value: K;
  /** The option that counts as "no filter"; any other choice tints the trigger. */
  defaultValue: K;
  onChange: (key: K) => void;
  className?: string;
}

/**
 * Compact listbox dropdown for the Inbox toolbar. Keyboard: arrows/Home/End move, Enter or click picks, Escape
 * and Tab close. Changing it only reports the new key; the page owns the filter state.
 */
export function FilterMenu<K extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  className,
}: Props<K>) {
  const { registerEscape } = useShell();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(wrap, open, () => setOpen(false));
  useKeepInView(list);
  useEffect(() => (open ? registerEscape(() => close()) : undefined), [open, registerEscape]);

  const current = options.find((o) => o.key === value) ?? options[0]!;
  const filtered = value !== defaultValue;
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];

  function close() {
    setOpen(false);
    btn.current?.focus();
  }
  // Opening moves focus to the selected option, as a native select does.
  useEffect(() => {
    if (open)
      items()
        .find((o) => o.getAttribute('aria-selected') === 'true')
        ?.focus();
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className={cn('relative min-w-0', className)}>
      <button
        ref={btn}
        type="button"
        aria-label={`${label}: ${current.label}${current.count !== undefined ? ` (${current.count})` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        title={current.label}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border pl-2.5 pr-2 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
          filtered || open
            ? 'border-[rgba(91,92,226,0.28)] bg-primary-soft text-primary-hover'
            : 'border-line bg-white text-ink hover:border-line-input hover:bg-wash',
        )}
      >
        <span className={cn('flex shrink-0', filtered || open ? 'text-primary' : 'text-faint')}>
          {current.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          <span className="@min-[800px]:hidden">{current.short ?? current.label}</span>
          <span className="hidden @min-[800px]:inline">{current.label}</span>
        </span>
        {current.count !== undefined && (
          <span className="shrink-0 text-xs tabular-nums text-faint">{current.count}</span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'shrink-0 text-faint transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="absolute left-0 top-[42px] z-[45] w-[min(248px,calc(100vw-24px))] animate-panel-in rounded-[var(--radius-menu)] border border-line glass-menu p-1 shadow-popover"
        >
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  onChange(o.key);
                  close();
                }}
                className={cn(
                  'flex min-h-10 w-full py-1.5 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-left text-[13.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  on
                    ? 'bg-primary-soft font-semibold text-primary-hover'
                    : 'font-medium text-ink hover:bg-wash focus-visible:bg-wash',
                )}
              >
                <span
                  className={cn(
                    'flex w-4 shrink-0 justify-center',
                    on ? 'text-primary' : 'text-faint',
                  )}
                >
                  {o.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block truncate text-xs font-normal text-faint">{o.hint}</span>
                  )}
                </span>
                {o.dot && (
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
                {o.count !== undefined && (
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      on ? 'text-primary-hover' : 'text-faint',
                    )}
                  >
                    {o.count}
                  </span>
                )}
                <Check
                  size={15}
                  strokeWidth={2.25}
                  aria-hidden
                  className={cn('shrink-0 text-primary', !on && 'invisible')}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
