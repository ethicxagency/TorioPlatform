'use client';

import { areas, type BrainArea } from '@torio/contracts';
import { Check, CircleAlert, CircleDashed, CircleDot } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { BrainConfig } from '@torio/contracts';

const icon = (a: BrainArea) =>
  a.review ? (
    <CircleAlert size={14} className="text-warning" aria-label="Needs review" />
  ) : a.pct >= 1 ? (
    <Check size={14} className="text-success" aria-label="Complete" />
  ) : a.pct === 0 ? (
    <CircleDashed size={14} className="text-faint" aria-label="Not started" />
  ) : (
    <CircleDot size={14} className="text-primary" aria-label="Partial" />
  );

export const Readiness = forwardRef<
  HTMLElement,
  { d: BrainConfig; pct: number; onGoTo: (sec: string) => void }
>(function Readiness({ d, pct, onGoTo }, ref) {
  const list = areas(d);
  const recs = list.filter((a) => a.rec);
  return (
    <section
      ref={ref}
      aria-label="Knowledge readiness"
      className="rounded-card border border-line bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[15px] font-semibold">Knowledge readiness</h2>
        <span className="text-2xl font-metric">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Knowledge readiness"
        className="mt-2 h-2 overflow-hidden rounded-full bg-wash-2"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="m-0 mt-2 text-xs text-faint">
        Readiness measures how complete your configuration is — not whether the information is
        correct.
      </p>
      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-1.5 p-0 md:grid-cols-4">
        {list.map((a) => (
          <li key={a.key}>
            <button
              type="button"
              onClick={() => onGoTo(a.sec)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] hover:bg-wash',
                a.review ? 'border-[#FBE3B5] bg-warning-soft' : 'border-line-subtle',
              )}
            >
              {icon(a)}
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              <span className="tabular-nums text-faint">{Math.round(a.pct * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
      {recs.length > 0 && (
        <div className="mt-3 border-t border-line-subtle pt-3">
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint">
            Recommended next
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {recs.slice(0, 3).map((a) => (
              <li key={a.key} className="flex items-start gap-2 text-[13px]">
                <span className="min-w-0 flex-1 text-muted">{a.rec}</span>
                <button
                  type="button"
                  onClick={() => onGoTo(a.sec)}
                  className="shrink-0 cursor-pointer font-medium text-primary"
                >
                  Fix
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});
