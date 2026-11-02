'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type Gran = 'day' | 'week' | 'month';
export const GRAN_LABEL: Record<Gran, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

/** Rounds up so the four gridlines land on readable values. */
export function niceMax(m: number) {
  if (m <= 0) return 4;
  const step = m / 4;
  const p = 10 ** Math.floor(Math.log10(step));
  return ([1, 2, 2.5, 5, 10].find((c) => c * p >= step) ?? 10) * p * 4;
}

const fmtDay = (iso: string, year = false) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${d.getUTCDate()} ${mon}${year ? ` ${d.getUTCFullYear()}` : ''}`;
};
/** Axis label for a bucket start. */
export const bucketShort = (iso: string, g: Gran, many: boolean) =>
  g === 'month'
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    : g === 'day' && many
      ? String(new Date(`${iso}T00:00:00Z`).getUTCDate())
      : fmtDay(iso);
/** Full period name for tooltips and "best" labels; clipped to the selected range. */
export function bucketFull(iso: string, g: Gran, range: { from: string; to: string }) {
  if (g === 'day') return fmtDay(iso, true);
  const start = iso < range.from ? range.from : iso;
  if (g === 'month') {
    const d = new Date(`${iso}T00:00:00Z`);
    const name = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return start !== iso ? `${fmtDay(start)} – ${name}` : name;
  }
  const end = new Date(Date.parse(`${iso}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return `${fmtDay(start)} – ${fmtDay(end < range.to ? end : range.to, true)}`;
}

/** Bar chart for the selected KPI. Data is the API's series for the chosen grouping; nothing is interpolated. */
export function MetricChart({
  title,
  buckets,
  values,
  gran,
  grans,
  onGran,
  fmt,
  fmtAxis,
  range,
  loading,
  compact,
}: {
  title: string;
  buckets: string[];
  values: number[];
  gran: Gran;
  grans: Gran[];
  onGran: (g: Gran) => void;
  fmt: (n: number) => string;
  fmtAxis: (n: number) => string;
  range: { from: string; to: string };
  loading: boolean;
  compact: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const max = niceMax(Math.max(0, ...values) * 1.05);
  const step = Math.max(1, Math.ceil(n / (compact ? 5 : n > 16 ? 8 : 12)));
  const hv = hover !== null && hover < n ? hover : null;
  const empty = !loading && values.every((v) => v === 0);
  const h = compact ? 200 : 260;

  return (
    <section
      aria-label={`${title} · ${GRAN_LABEL[gran]}`}
      className="flex min-w-0 flex-col gap-3.5 rounded-panel border border-line bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold">
          {title} <span className="font-normal text-faint">· {GRAN_LABEL[gran]}</span>
        </h2>
        {grans.length > 1 && (
          <div
            role="radiogroup"
            aria-label="Group by"
            className="flex gap-0.5 rounded-[9px] bg-wash-2 p-[3px]"
          >
            {grans.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={g === gran}
                onClick={() => {
                  setHover(null);
                  onGran(g);
                }}
                className={cn(
                  'h-8 cursor-pointer rounded-[7px] px-3 text-xs font-medium sm:h-6 sm:px-2.5',
                  g === gran
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                    : 'text-muted hover:text-ink',
                )}
              >
                {GRAN_LABEL[g]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="w-full" style={{ height: h + 20 }} />
      ) : empty ? (
        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-line bg-[#FBFBFC] text-[13px] text-muted"
          style={{ height: h }}
        >
          No {title.toLowerCase()} in this period.
        </div>
      ) : (
        <div className="flex gap-2">
          <div
            className="relative w-11 shrink-0 text-[11px] tabular-nums text-faint"
            style={{ height: h }}
          >
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <span
                key={f}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                style={{ top: `${100 - f * 100}%` }}
              >
                {fmtAxis(max * f)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: h }} onMouseLeave={() => setHover(null)}>
              {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                <div
                  key={f}
                  className={cn('absolute inset-x-0 h-px', f === 0 ? 'bg-line' : 'bg-wash-2')}
                  style={{ top: `${100 - f * 100}%` }}
                />
              ))}
              <ul
                className="absolute inset-0 m-0 flex list-none items-end p-0"
                aria-label={`${title} by ${gran}`}
              >
                {values.map((v, i) => {
                  const on = hv === i;
                  return (
                    <li
                      key={buckets[i]}
                      onMouseEnter={() => setHover(i)}
                      className={cn(
                        'flex h-full min-w-0 flex-1 items-end justify-center',
                        n > 40 ? 'px-px' : n > 20 ? 'px-0.5' : 'px-1.5',
                        on && 'bg-[rgba(91,92,226,0.05)]',
                      )}
                      aria-label={`${bucketFull(buckets[i]!, gran, range)}: ${fmt(v)}`}
                    >
                      <span
                        className="block w-full max-w-[36px] transition-[height,background-color,opacity] duration-200 ease-out motion-reduce:transition-none"
                        style={{
                          height: v ? `${(v / max) * 100}%` : 2,
                          minHeight: 2,
                          borderRadius: !v ? 1 : n > 40 ? '2px 2px 0 0' : '5px 5px 0 0',
                          background: !v ? '#E3E8EE' : on ? '#4F50D1' : '#5B5CE2',
                          opacity: hv !== null && !on ? 0.55 : 1,
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
              {hv !== null && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-1.5 z-10 whitespace-nowrap rounded-[10px] bg-[rgba(13,37,61,0.95)] px-3 py-2 text-xs text-white shadow-[0_6px_16px_rgba(0,55,112,0.18)]"
                  style={{
                    left: `${((hv + 0.5) / n) * 100}%`,
                    transform:
                      (hv + 0.5) / n > 0.62 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
                  }}
                >
                  <div className="mb-1 text-[#B7B9C0]">{bucketFull(buckets[hv]!, gran, range)}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px] bg-[#8B8CFF]" />
                    <span className="text-[13px] font-semibold">{fmt(values[hv]!)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 flex text-[11px] text-faint">
              {buckets.map((b, i) => (
                <span
                  key={b}
                  className={cn(
                    'flex-1 overflow-visible whitespace-nowrap text-center',
                    hv === i && 'font-semibold text-ink',
                  )}
                >
                  {i % step === 0 ? bucketShort(b, gran, n > 7) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
