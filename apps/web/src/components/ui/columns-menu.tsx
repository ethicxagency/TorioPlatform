'use client';

import { Check, Columns3 } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MENU_SURFACE } from './menu';

export interface ColumnDef {
  key: string;
  label: string;
  /** 1-based position among the table's cells (the select-all checkbox is 1). */
  index: number;
  /** Always shown, e.g. the primary column and the row actions. */
  locked?: boolean;
}

/**
 * CSS that hides the chosen columns of the table inside `scope` (an element id). Columns are addressed by position, so
 * header and body cells hide together without each cell knowing about it; the column list sits next to the table markup.
 */
export function hiddenColumnsCss(scope: string, columns: ColumnDef[], hidden: string[]) {
  const rules = columns
    .filter((c) => !c.locked && hidden.includes(c.key))
    .map((c) => `#${scope} table tr > :nth-child(${c.index})`);
  return rules.length ? `${rules.join(',')}{display:none}` : '';
}

/** "Columns" button with a checklist of the optional columns. Stays open while you toggle several. */
export function ColumnsMenu({
  columns,
  hidden,
  onChange,
  className,
}: {
  columns: ColumnDef[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const optional = columns.filter((c) => !c.locked);

  const place = useCallback(() => {
    if (!btn.current || !panel.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = panel.current.offsetWidth;
    const h = panel.current.offsetHeight;
    const flip = window.innerHeight - r.bottom < h + 8 && r.top > h + 8;
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
      top: flip ? r.top - h - 4 : r.bottom + 4,
    });
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
      ?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', away);
    };
  }, [open, place]);

  const close = () => {
    setOpen(false);
    setPos(null);
    btn.current?.focus({ preventScroll: true });
  };
  const toggle = (key: string) =>
    onChange(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  const hiddenCount = optional.filter((c) => hidden.includes(c.key)).length;

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
          className,
        )}
      >
        <Columns3 size={14} aria-hidden />
        Columns
        {hiddenCount > 0 && (
          <span className="rounded-full bg-primary-soft px-1.5 text-[11px] text-primary-hover">
            {hiddenCount} hidden
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label="Visible columns"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            } else if (e.key === 'Tab') setOpen(false);
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const items = [
                ...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ??
                  []),
              ];
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
            }
          }}
          style={{
            position: 'fixed',
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className={cn(MENU_SURFACE, 'z-[80] w-[220px]')}
        >
          {optional.map((c) => {
            const on = !hidden.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(c.key)}
                className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-none motion-reduce:transition-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
                    on ? 'border-primary bg-primary' : 'border-[#C9CBD3] bg-white',
                  )}
                >
                  {on && <Check size={11} strokeWidth={3.4} className="text-white" />}
                </span>
                {c.label}
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex h-8 w-full cursor-pointer items-center rounded-lg border-t border-none bg-transparent px-2.5 text-left text-xs font-medium text-primary hover:bg-wash"
            >
              Show all columns
            </button>
          )}
        </div>
      )}
    </>
  );
}
