'use client';

import { CalendarDays, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionMenu } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import type { InvoiceStatus } from '../types';

/** A small tinted square holding a Lucide icon: the section and KPI marker used across the Billing page. */
export function IconTile({
  icon: Icon,
  color,
  size = 32,
}: {
  icon: LucideIcon;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[10px]"
      style={{ width: size, height: size, backgroundColor: `${color}1A`, color }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

const STATUS: Record<InvoiceStatus, { label: string; dot: string; bg: string; fg: string }> = {
  PAID: { label: 'Paid', dot: '#16A34A', bg: '#EAF8EF', fg: '#166534' },
  PENDING: { label: 'Pending', dot: '#D97706', bg: '#FFF5E4', fg: '#92560A' },
  FAILED: { label: 'Failed', dot: '#DC2626', bg: '#FDEBEB', fg: '#991B1B' },
  REFUNDED: { label: 'Refunded', dot: '#2563EB', bg: '#EDF3FF', fg: '#1E4FB8' },
  VOID: { label: 'Void', dot: '#9A9DA6', bg: '#F1F2F5', fg: '#62656D' },
};

/** Restrained status badge: a coloured dot and a tinted label. */
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </span>
  );
}

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** An overflow ("more actions") menu: the shared ActionMenu with the billing action shape. */
export function RowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  return (
    <ActionMenu
      label={label}
      width={192}
      items={actions.map((a) => ({
        label: a.label,
        icon: a.icon,
        danger: a.danger,
        disabled: a.disabled,
        onSelect: a.onSelect,
      }))}
    />
  );
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/** One compact control for the issue-date range: presets plus exact From / To dates, in a popover. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const active = !!(from || to);
  const label = active ? `${from ? fmt(from) : 'Start'} – ${to ? fmt(to) : 'Today'}` : 'Any date';
  const today = ymd(new Date());
  const PRESETS: [string, string, string][] = [
    ['Last 30 days', daysAgo(30), today],
    ['Last 90 days', daysAgo(90), today],
    ['This year', `${new Date().getFullYear()}-01-01`, today],
  ];
  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border bg-white px-3 text-[13px] transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
          active ? 'border-primary-line font-medium text-primary-hover' : 'border-line text-muted',
        )}
      >
        <CalendarDays size={14} aria-hidden />
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Issue date range"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              btn.current?.focus();
            }
          }}
          className="absolute right-0 top-11 z-30 w-[280px] animate-panel-in rounded-xl border border-line bg-white p-3 shadow-popover motion-reduce:animate-none"
        >
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {PRESETS.map(([l, f, t]) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  onChange(f, t);
                  setOpen(false);
                }}
                className={cn(
                  'h-7 cursor-pointer rounded-full border px-2.5 text-[12px] transition-colors duration-150 motion-reduce:transition-none',
                  from === f && to === t
                    ? 'border-primary-line bg-primary-soft font-semibold text-primary-hover'
                    : 'border-line bg-white text-muted hover:bg-wash',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
              From
              <input
                type="date"
                aria-label="From date"
                value={from}
                max={to || undefined}
                onChange={(e) => onChange(e.target.value, to)}
                className="h-9 rounded-lg border border-line px-2 text-[12.5px] font-normal text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
              To
              <input
                type="date"
                aria-label="To date"
                value={to}
                min={from || undefined}
                onChange={(e) => onChange(from, e.target.value)}
                className="h-9 rounded-lg border border-line px-2 text-[12.5px] font-normal text-ink"
              />
            </label>
          </div>
          {active && (
            <button
              type="button"
              onClick={() => {
                onChange('', '');
                setOpen(false);
              }}
              className="mt-2.5 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-medium text-primary"
            >
              <X size={12} aria-hidden /> Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}
