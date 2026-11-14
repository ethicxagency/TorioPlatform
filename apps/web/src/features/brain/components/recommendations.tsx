'use client';

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Info,
  Lightbulb,
} from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Severity styles. The Brain's own logic produces High, Medium and Low today; Critical and Info are styled so the same
 * component carries them if that logic ever does, and no recommendation is ever shown at a lower severity than it has.
 */
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
const SEVERITY: Record<
  Severity,
  { label: string; badge: string; circle: string; icon: typeof AlertTriangle; rank: number }
> = {
  Critical: {
    label: 'Critical',
    badge: 'border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]',
    circle: 'bg-[#FEE2E2] text-[#B91C1C]',
    icon: AlertOctagon,
    rank: 0,
  },
  High: {
    label: 'High',
    badge: 'border-[#FECACA] bg-[#FEF2F2] text-[#B42318]',
    circle: 'bg-[#FEF2F2] text-[#DC2626]',
    icon: AlertTriangle,
    rank: 1,
  },
  Medium: {
    label: 'Medium',
    badge: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
    circle: 'bg-[#FFFBEB] text-[#D97706]',
    icon: AlertTriangle,
    rank: 2,
  },
  Low: {
    label: 'Low',
    badge: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]',
    circle: 'bg-[#EFF6FF] text-[#2563EB]',
    icon: Lightbulb,
    rank: 3,
  },
  Info: {
    label: 'Info',
    badge: 'border-line bg-wash text-muted',
    circle: 'bg-wash text-muted',
    icon: Info,
    rank: 4,
  },
};

export interface Recommendation {
  id: string;
  severity: Severity;
  title: string;
  /** What is wrong, in one line. */
  issue: string;
  /** Why it matters. */
  why?: string;
  /** The action that exists for it (it opens the section where it is fixed). */
  actionLabel: string;
  onAction: () => void;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]',
        s.badge,
      )}
    >
      {s.label}
    </span>
  );
}

function Card({ r }: { r: Recommendation }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const s = SEVERITY[r.severity];
  const Icon = s.icon;
  return (
    <li
      className={cn(
        'overflow-hidden rounded-[14px] border bg-white transition-colors duration-150 motion-reduce:transition-none',
        open ? 'border-line-input' : 'border-line hover:border-line-input hover:bg-[#FCFCFD]',
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          aria-hidden
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', s.circle)}
        >
          <Icon size={16} />
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold leading-snug text-ink">
              {r.title}
            </span>
            <span className="block truncate text-[12.5px] text-muted">{r.issue}</span>
          </span>
          <SeverityBadge severity={r.severity} />
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              'shrink-0 text-faint transition-transform duration-150 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
      {open && (
        <div id={id} className="border-t border-line-subtle bg-[#FBFBFC] px-3 py-3 pl-14">
          <dl className="m-0 flex flex-col gap-2 text-[12.5px] leading-[1.5]">
            <div>
              <dt className="font-semibold text-ink">What we found</dt>
              <dd className="m-0 text-muted">{r.issue}</dd>
            </div>
            {r.why && (
              <div>
                <dt className="font-semibold text-ink">Why it matters</dt>
                <dd className="m-0 text-muted">{r.why}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-ink">Suggested action</dt>
              <dd className="m-0 text-muted">{r.title}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={r.onAction}
            className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-white px-3 text-[12.5px] font-semibold text-primary transition-colors duration-150 hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            {r.actionLabel}
            <ArrowRight size={13} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The Brain's recommendations as compact, expandable cards with a severity summary and filter. It only presents what it is
 * given: the order, the severities and the actions come from the existing recommendation logic.
 */
export function RecommendationList({
  items,
  limit = 5,
}: {
  items: Recommendation[];
  limit?: number;
}) {
  const [filter, setFilter] = useState<'All' | Severity>('All');
  const [all, setAll] = useState(false);
  const counts = (Object.keys(SEVERITY) as Severity[])
    .map((k) => ({ k, n: items.filter((i) => i.severity === k).length }))
    .filter((c) => c.n > 0);
  const shown = items.filter((i) => filter === 'All' || i.severity === filter);
  const visible = all ? shown : shown.slice(0, limit);
  return (
    <section aria-label="Recommended next" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">Recommended next</h2>
          {items.length > 0 && (
            <span className="text-xs tabular-nums text-faint">
              {items.length} recommendation{items.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {counts.length > 1 && (
          <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1">
            {(['All', ...counts.map((c) => c.k)] as ('All' | Severity)[]).map((k) => {
              const on = filter === k;
              const n = k === 'All' ? items.length : counts.find((c) => c.k === k)!.n;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFilter(k);
                    setAll(false);
                  }}
                  className={cn(
                    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    on
                      ? 'border-primary bg-primary-soft text-primary-hover'
                      : 'border-line bg-white text-muted hover:border-line-input hover:text-ink',
                  )}
                >
                  {k}
                  <span className="tabular-nums text-faint">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="m-0 rounded-xl bg-wash px-3 py-2.5 text-[13px] text-muted">
          Nothing left to recommend. Your setup looks complete; new suggestions appear if something
          changes.
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {visible.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </ul>
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="cursor-pointer self-start border-none bg-transparent p-0 text-[12.5px] font-semibold text-primary hover:text-primary-hover"
            >
              {all ? 'Show fewer' : `Show all ${shown.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
