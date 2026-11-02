'use client';

import { ChannelIcon } from '@/components/channel-icon';
import { cn } from '@/lib/utils';
import type { DashboardChannel } from '../use-dashboard-range';
import { bucketFull, type Gran } from './metric-chart';

const CHANNELS: { key: DashboardChannel; name: string; color: string }[] = [
  { key: 'WHATSAPP', name: 'WhatsApp', color: '#25D366' },
  { key: 'INSTAGRAM', name: 'Instagram', color: '#E4405F' },
  { key: 'MESSENGER', name: 'Messenger', color: '#0099FF' },
];
const NOUN: Record<Gran, string> = { day: 'day', week: 'week', month: 'month' };

/**
 * The selected metric in numbers: total, average and best period from the chart's own series, and the split by
 * channel from the API. Clicking a channel filters the whole dashboard; clicking it again clears the filter.
 */
export function Breakdown({
  metricLabel,
  periodLabel,
  total,
  values,
  buckets,
  gran,
  range,
  byChannel,
  channel,
  onChannel,
  fmt,
  loading,
}: {
  metricLabel: string;
  periodLabel: string;
  total: number;
  values: number[];
  buckets: string[];
  gran: Gran;
  range: { from: string; to: string };
  byChannel: Record<string, number> | undefined;
  channel: DashboardChannel | undefined;
  onChannel: (c: DashboardChannel | undefined) => void;
  fmt: (n: number) => string;
  loading: boolean;
}) {
  const n = values.length || 1;
  const avg = total / n;
  const bestI = values.reduce((b, v, i) => (v > (values[b] ?? 0) ? i : b), 0);
  const best = values[bestI] ?? 0;
  const split = byChannel ?? {};
  const splitTotal = Object.values(split).reduce((a, b) => a + b, 0);
  const unattributed = split.unattributed ?? 0;
  const noun = NOUN[gran];
  const activePeriods = values.filter((v) => v > 0).length;
  // Only a real, notable pattern earns an insight: enough active periods and a clear peak.
  const insight =
    !loading && activePeriods >= 5 && avg > 0 && best >= avg * 1.25
      ? `${bucketFull(buckets[bestI]!, gran, range)} was your strongest ${noun} for ${metricLabel.toLowerCase()}: ${Math.round((best / avg - 1) * 100)}% above the ${noun}ly average.`
      : '';

  return (
    <aside
      aria-label="Breakdown"
      className="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-white p-4 sm:p-5"
    >
      <div>
        <div className="text-xs font-medium text-faint">
          {metricLabel} · {periodLabel}
        </div>
        <div className="font-metric mt-1 text-[30px] leading-tight">
          {loading ? '—' : fmt(total)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line-subtle bg-line-subtle">
        <div className="min-w-0 bg-white px-3 py-2.5">
          <div className="text-[11.5px] text-muted">Average per {noun}</div>
          <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">
            {loading ? '—' : fmt(Math.round(avg))}
          </div>
        </div>
        <div className="min-w-0 bg-white px-3 py-2.5">
          <div className="text-[11.5px] text-muted">Best {noun}</div>
          <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">
            {loading || !best ? '—' : fmt(best)}
          </div>
          {!loading && best > 0 && (
            <div className="truncate text-[11.5px] text-faint">
              {bucketFull(buckets[bestI]!, gran, range)}
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint">
          By channel
        </div>
        <div className="flex flex-col gap-1">
          {CHANNELS.map((c) => {
            const v = split[c.key] ?? 0;
            const pct = splitTotal ? Math.round((v / splitTotal) * 100) : 0;
            const on = channel === c.key;
            const dim = !!channel && !on;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                title={on ? 'Show all channels' : `Filter to ${c.name}`}
                onClick={() => onChannel(on ? undefined : c.key)}
                className={cn(
                  'flex cursor-pointer flex-col gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-opacity hover:bg-wash',
                  dim && 'opacity-45',
                  on && 'bg-primary-tint',
                )}
              >
                <span className="flex w-full items-center gap-2 text-[13px]">
                  <ChannelIcon channel={c.key} size={16} decorative />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="font-semibold tabular-nums">{loading ? '—' : fmt(v)}</span>
                  <span className="w-9 text-right text-xs tabular-nums text-faint">{pct}%</span>
                </span>
                <span className="ml-6 block h-[5px] w-[calc(100%-24px)] overflow-hidden rounded-[3px] bg-wash-2">
                  <span
                    className="block h-full rounded-[3px] opacity-75 transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${pct}%`, background: c.color }}
                  />
                </span>
              </button>
            );
          })}
          {unattributed > 0 && (
            <div className="flex items-center gap-2 px-1.5 py-1 text-[12.5px] text-muted">
              <span className="w-4" />
              <span className="flex-1">Not linked to a channel</span>
              <span className="tabular-nums">{fmt(unattributed)}</span>
              <span className="w-9 text-right text-xs tabular-nums text-faint">
                {splitTotal ? Math.round((unattributed / splitTotal) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      </div>
      {insight && (
        <p className="m-0 rounded-[10px] border border-wash-2 bg-[#FBFBFC] px-3 py-2.5 text-[12.5px] text-[#3A3C42] [text-wrap:pretty]">
          {insight}
        </p>
      )}
    </aside>
  );
}
