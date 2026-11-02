'use client';

import { useId } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { monotone } from '../format';

export interface KpiTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  series: number[];
}

/** Trend under the value. Only drawn once there are at least three periods with activity, so it never implies a trend. */
function TabSpark({ values, selected }: { values: number[]; selected: boolean }) {
  const id = useId().replace(/:/g, '');
  const active = values.filter((v) => v > 0).length;
  if (values.length < 2 || active < 3)
    return (
      <span
        aria-hidden
        className="mb-1 block w-4 border-t-[1.5px] border-dashed border-[#C9CBD3]"
      />
    );
  const mx = Math.max(...values) || 1;
  const pts = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * 100,
    92 - (v / mx) * 84,
  ]);
  const line = monotone(pts);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="block h-7 w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B5CE2" stopOpacity={selected ? 0.16 : 0.08} />
          <stop offset="1" stopColor="#5B5CE2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,100L0,100Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={selected ? '#5B5CE2' : '#A5A6F6'}
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The five KPI cards. They are tabs: the selected one drives the main chart and the breakdown. */
export function KpiTabs({
  tabs,
  selected,
  onSelect,
  loading,
  cols,
  compact,
}: {
  tabs: KpiTab[];
  selected: string;
  onSelect: (key: string) => void;
  loading: boolean;
  cols: string;
  compact: boolean;
}) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length]!;
    onSelect(next.key);
    (
      e.currentTarget.parentElement?.children[(i + d + tabs.length) % tabs.length] as HTMLElement
    )?.focus();
  };
  return (
    <div role="tablist" aria-label="Metrics" className={cn('grid gap-3', cols)}>
      {tabs.map((t, i) => {
        const on = t.key === selected;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(t.key)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-card border px-4 pb-3 pt-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
              on
                ? 'border-primary bg-[#FBFBFF] shadow-[0_0_0_3px_rgba(91,92,226,0.12)]'
                : 'border-line bg-white hover:border-[#C9CAF7]',
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] transition-colors',
                  on ? 'bg-primary text-white' : 'bg-primary-tint text-primary',
                )}
              >
                {t.icon}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 text-[13px] font-semibold text-muted',
                  compact ? 'line-clamp-2 leading-tight' : 'truncate',
                )}
              >
                {t.label}
              </span>
            </span>
            {loading ? (
              <Skeleton className="my-1 h-6 w-3/5" />
            ) : (
              <span
                className={cn(
                  'font-metric truncate leading-tight text-ink',
                  compact ? 'text-[22px]' : 'text-[26px]',
                )}
              >
                {t.value}
              </span>
            )}
            <span className="flex h-7 items-end">
              {!loading && <TabSpark values={t.series} selected={on} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
