'use client';

import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Analytics } from '../analytics-queries';
import { monotone } from '../format';

type View = 'conversations' | 'new' | 'resolved';
const VIEWS: [View, string][] = [
  ['conversations', 'Conversations'],
  ['new', 'New'],
  ['resolved', 'Resolved'],
];

function niceCeil(n: number) {
  if (n <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  const f = n / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * p;
}

/** "5 Oct" for days and weeks, "Jan" for months. */
export function axisLabel(iso: string, g: Analytics['granularity']) {
  const d = new Date(`${iso}T00:00:00Z`);
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return g === 'month' ? mon : `${d.getUTCDate()} ${mon}`;
}

/**
 * The dashboard's primary chart: real conversation activity for the selected range and channel. Each view comes from
 * the analytics API (active, started or resolved conversations per day/week/month); nothing is estimated.
 */
export function ConversationOverview({
  data,
  loading,
  inboxHref,
}: {
  data: Analytics | undefined;
  loading: boolean;
  inboxHref: string;
}) {
  const [view, setView] = useState<View>('conversations');
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const buckets = data?.series.buckets ?? [];
  const values =
    (view === 'conversations'
      ? data?.series.conversations
      : view === 'new'
        ? data?.series.newConversations
        : data?.series.resolvedConversations) ?? [];
  const g = data?.granularity ?? 'day';
  const top = niceCeil(Math.max(0, ...values));
  const n = values.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const pts = values.map((v, i): [number, number] => [x(i), y(v)]);
  const line = n > 1 ? monotone(pts) : '';
  const every = Math.max(1, Math.ceil(n / 6));
  const empty = !loading && values.every((v) => v === 0);
  const hv = hover !== null && hover < n ? hover : null;

  const summary = [
    { label: 'Total conversations', value: data?.messaging.total },
    { label: 'Resolved', value: data?.messaging.resolved },
    { label: 'Waiting for reply', value: data?.messaging.waiting, warn: true },
  ];

  return (
    <section
      aria-label="Conversation Overview"
      className="flex min-w-0 flex-col gap-5 rounded-panel border border-line bg-white p-5 sm:p-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-section-title">Conversation Overview</h2>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            Understand your team&apos;s messaging workload.
          </p>
        </div>
        <Link
          href={inboxHref}
          className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-medium text-primary no-underline hover:text-primary-hover hover:no-underline"
        >
          Open Inbox <Icon icon={ArrowRight02Icon} size={14} />
        </Link>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="m-0 flex flex-wrap gap-x-9 gap-y-3">
          {summary.map((s) => (
            <div key={s.label}>
              <dt className="text-[12.5px] text-muted">{s.label}</dt>
              <dd className="m-0 mt-1">
                {loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <span
                    className={cn(
                      'font-metric text-[28px] leading-none',
                      s.warn && (s.value ?? 0) > 0 ? 'text-warning' : 'text-ink',
                    )}
                  >
                    {(s.value ?? 0).toLocaleString('en-US')}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div
          role="radiogroup"
          aria-label="Chart view"
          className="flex gap-0.5 rounded-[10px] bg-wash-2 p-[3px]"
        >
          {VIEWS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={view === k}
              onClick={() => setView(k)}
              className={cn(
                'h-8 cursor-pointer rounded-[8px] px-3 text-[13px] font-medium transition-colors',
                view === k
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                  : 'text-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[260px] w-full" />
      ) : empty ? (
        <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-line bg-[#FBFBFC] text-[13px] text-muted">
          No {view === 'conversations' ? '' : `${view} `}conversations in this range.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative h-[260px]">
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <div
                key={f}
                className="pointer-events-none absolute inset-x-0 flex items-center gap-3"
                style={{ bottom: `${f * 100}%` }}
              >
                <span className="w-7 shrink-0 translate-y-1/2 text-right text-[11px] tabular-nums text-faint">
                  {Math.round(top * f)}
                </span>
                <span className="h-px flex-1 bg-line-subtle" />
              </div>
            ))}
            <div
              className="absolute inset-y-0 left-10 right-0"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
                setHover(Math.max(0, Math.min(n - 1, i)));
              }}
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
                role="img"
                aria-label={`${VIEWS.find((v) => v[0] === view)![1]} per ${g}`}
              >
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5B5CE2" stopOpacity="0.16" />
                    <stop offset="1" stopColor="#5B5CE2" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {n > 1 && (
                  <>
                    <path d={`${line}L100,100L0,100Z`} fill={`url(#${gid})`} />
                    <path
                      d={line}
                      fill="none"
                      stroke="#5B5CE2"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                {hv !== null && (
                  <line
                    x1={x(hv)}
                    x2={x(hv)}
                    y1="0"
                    y2="100"
                    stroke="#C9CBD3"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {(n === 1 || hv !== null) && (
                <span
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
                  style={{ left: `${x(hv ?? 0)}%`, bottom: `${100 - y(values[hv ?? 0]!)}%` }}
                />
              )}
              {hv !== null && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-[0_6px_16px_rgba(0,55,112,0.18)]"
                  style={{
                    left: `${x(hv)}%`,
                    transform: x(hv) > 70 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
                  }}
                >
                  <div className="text-white/70">{axisLabel(buckets[hv]!, g)}</div>
                  <div className="font-semibold">
                    {values[hv]!.toLocaleString('en-US')}{' '}
                    {VIEWS.find((v) => v[0] === view)![1].toLowerCase()}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="relative ml-10 h-4 text-[11.5px] text-faint">
            {buckets.map((b, i) =>
              i % every === 0 ? (
                <span
                  key={b}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${x(i)}%` }}
                >
                  {axisLabel(b, g)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}
    </section>
  );
}
