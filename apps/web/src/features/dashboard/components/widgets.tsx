'use client';

import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import type { MetricKey } from '../data';
import type { DashboardModel, Target, WidgetModel } from '../model';

type Props = { m: DashboardModel; go: (t: Target) => void };

const hoverRow = 'hover:bg-[#F7F7F9]';
const pill = 'shrink-0 rounded-md px-[7px] py-px text-[11px] font-medium';

export function OverviewWidget({
  m,
  metric,
  setMetric,
  wide,
}: {
  m: DashboardModel;
  metric: MetricKey;
  setMetric: (k: MetricKey) => void;
  wide: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { ov, rangeDef, prevLabel } = m;
  const n = ov.vals.length;
  const hv = hover != null && hover < n ? hover : null;
  const tipPt = hv != null ? ov.pts[hv]! : null;
  void wide;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-6">
          {ov.summary.map((s) => (
            <div key={s.label}>
              <div className="text-xs text-faint">{s.label}</div>
              <div
                className="text-xl font-semibold tabular-nums tracking-[-0.015em]"
                style={{ color: s.color }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label="Chart metric"
          className="flex gap-0.5 rounded-[9px] bg-wash-2 p-[3px]"
        >
          {(
            [
              ['conv', 'Conversations'],
              ['new', 'New'],
              ['resolved', 'Resolved'],
            ] as const
          ).map(([k, l]) => {
            const on = metric === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMetric(k)}
                className={cn(
                  'h-[26px] cursor-pointer whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-medium',
                  on
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                    : 'bg-transparent text-muted',
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative h-[220px] w-[34px] shrink-0 text-[11px] tabular-nums text-faint">
          {ov.yTicks.map((yt) => (
            <span
              key={yt.top}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: yt.top }}
            >
              {yt.label}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div onMouseLeave={() => setHover(null)} className="relative h-[220px]">
            {ov.yTicks.map((yt) => (
              <div
                key={yt.top}
                className="absolute inset-x-0 h-px"
                style={{ top: yt.top, background: yt.line }}
              />
            ))}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              <path d={ov.area} fill="rgba(91,92,226,0.09)" />
              <path
                d={ov.prevLine}
                fill="none"
                stroke="#B7B9C0"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={ov.line}
                fill="none"
                stroke="#5B5CE2"
                strokeWidth="2.25"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex">
              {ov.vals.map((_, i) => (
                <div key={i} onMouseEnter={() => setHover(i)} className="h-full flex-1" />
              ))}
            </div>
            {hv != null && tipPt && (
              <>
                <div
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-[rgba(91,92,226,0.35)]"
                  style={{ left: tipPt[0] + '%' }}
                />
                <div
                  className="pointer-events-none absolute -ml-[5px] -mt-[5px] h-2.5 w-2.5 rounded-full border-2 border-white bg-primary shadow-[0_0_0_1px_rgba(91,92,226,0.4)]"
                  style={{ left: tipPt[0] + '%', top: tipPt[1] + '%' }}
                />
                <div
                  className="pointer-events-none absolute top-1 whitespace-nowrap rounded-[9px] bg-[rgba(23,24,28,0.94)] px-2.5 py-2 text-xs text-white shadow-[0_6px_16px_rgba(16,24,40,0.18)]"
                  style={{
                    left: tipPt[0] + '%',
                    transform:
                      tipPt[0] > 60 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
                  }}
                >
                  <div className="mb-[3px] text-[#B7B9C0]">
                    {ov.labels[hv]}
                    {ov.today ? '' : ', 2026'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-2 bg-[#8B8CFF]" />
                    <span className="font-semibold">
                      {Math.round(ov.vals[hv]!).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[#B7B9C0]">{ov.metricLabel}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[#B7B9C0]">
                    <span className="h-0 w-2 border-t-2 border-dashed border-faint" />
                    {Math.round(ov.prevVals[hv]!).toLocaleString('en-IN')} previous period
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-2 flex text-[11px] text-faint">
            {ov.xLabels.map((l, i) => (
              <span key={i} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-[1px] bg-primary" />
          {ov.metricLabelCap} · {rangeDef.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed border-[#B7B9C0]" />
          {prevLabel[0]!.toUpperCase() + prevLabel.slice(1)}
        </span>
      </div>
    </>
  );
}

export function AttentionWidget({ m, go }: Props) {
  return (
    <div className="-mx-2 flex flex-col gap-0.5">
      {m.attention.map((a) => (
        <div
          key={a.title}
          className={cn('flex items-start gap-3 rounded-[10px] px-2 py-2.5', hoverRow)}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: a.bg }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={a.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={a.icon} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-[1.35]">
              <span className="font-bold tabular-nums" style={{ color: a.countColor }}>
                {a.count}
              </span>{' '}
              <span className="font-medium">{a.title}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted [text-wrap:pretty]">{a.body}</div>
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go(a.target);
            }}
            className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-[7px] border border-line bg-white px-2.5 text-[12.5px] font-medium text-ink no-underline hover:bg-wash hover:text-ink hover:no-underline"
          >
            {a.action}
          </a>
        </div>
      ))}
      {m.attention.length === 0 && (
        <div className="px-2 py-6 text-center">
          <div className="text-sm font-semibold">All clear</div>
          <div className="mt-1 text-[12.5px] text-muted">
            Nothing needs attention for this channel right now.
          </div>
        </div>
      )}
    </div>
  );
}

export function ChannelsWidget({ m, go, table }: Props & { table: boolean }) {
  const grid = 'grid grid-cols-[minmax(120px,1.6fr)_repeat(5,minmax(56px,1fr))] gap-2';
  return (
    <div className="flex flex-col">
      {table && (
        <div
          className={cn(
            grid,
            'border-b border-line-subtle pb-2 text-[11.5px] font-medium text-faint',
          )}
        >
          <span>Channel</span>
          {['Conversations', 'Unread', 'Avg. response', 'Leads', 'Orders'].map((h) => (
            <span key={h} className="text-right">
              {h}
            </span>
          ))}
        </div>
      )}
      {m.channelRows.map((ch) => (
        <div key={ch.name} className="border-b border-[#F1F2F4] py-3">
          {ch.connected ? (
            table ? (
              <>
                <div className={cn(grid, 'items-center text-[13.5px] tabular-nums')}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: ch.color }}
                    />
                    <span className="truncate font-medium">{ch.name}</span>
                  </span>
                  <span className="text-right font-semibold">{ch.conv}</span>
                  <span className="text-right" style={{ color: ch.unreadColor }}>
                    {ch.unread}
                  </span>
                  <span className="text-right">{ch.resp}</span>
                  <span className="text-right">{ch.leads}</span>
                  <span className="text-right">{ch.orders}</span>
                </div>
                <div className="ml-4 mt-2 h-1 overflow-hidden rounded-sm bg-wash-2">
                  <div
                    className="h-full rounded-sm opacity-70"
                    style={{ width: ch.share, background: ch.color }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                  <span className="flex-1 text-sm font-semibold">{ch.name}</span>
                  <span className="text-[13px] font-semibold tabular-nums">
                    {ch.conv} <span className="font-normal text-faint">conversations</span>
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs text-faint">
                  <div>
                    Unread
                    <div className="text-[13.5px] font-medium" style={{ color: ch.unreadColor }}>
                      {ch.unread}
                    </div>
                  </div>
                  <div>
                    Response<div className="text-[13.5px] font-medium text-ink">{ch.resp}</div>
                  </div>
                  <div>
                    Leads<div className="text-[13.5px] font-medium text-ink">{ch.leads}</div>
                  </div>
                  <div>
                    Orders<div className="text-[13.5px] font-medium text-ink">{ch.orders}</div>
                  </div>
                </div>
              </>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 opacity-100">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full border-[1.5px]"
                  style={{ borderColor: ch.color }}
                />
                <span className="text-[13.5px] font-medium">{ch.name}</span>
              </span>
              <span className="rounded-md bg-[#F3F4F6] px-[7px] py-px text-xs text-faint">
                Not connected (demo)
              </span>
              <span className="min-w-40 flex-1 text-[12.5px] text-muted">
                Connect to receive and track messages here.
              </span>
              <button
                type="button"
                onClick={() => go('channels')}
                className="h-7 cursor-pointer rounded-[7px] border border-[#C9CAF7] bg-primary-tint px-2.5 text-[12.5px] font-semibold text-primary-hover"
              >
                Connect channel
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="mt-2.5 text-[11.5px] text-faint">
        Leads and orders count only where attribution is tracked. Connection status is demo data.
      </div>
    </div>
  );
}

export function AiWidget({ m }: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line-subtle bg-line-subtle">
        {m.aiBlocks.map((ab) => (
          <div key={ab.label} className="min-w-0 bg-white px-3.5 py-3">
            <div className="text-xs text-muted">{ab.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className="text-xl font-semibold tabular-nums tracking-[-0.015em]"
                style={{ color: ab.color }}
              >
                {ab.value}
              </span>
              <span className="text-[11.5px] text-faint">{ab.note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2.5 rounded-[10px] border border-primary-line bg-primary-tint px-3 py-2.5 text-[12.5px] text-[#3A3C42]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#5B5CE2" className="mt-0.5 shrink-0">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        </svg>
        <div className="[text-wrap:pretty]">
          Your AI-assisted replies are using the knowledge and rules configured in Brain.{' '}
          <b>Auto-send is off</b> — every AI reply is a suggestion an agent reviews before sending.
        </div>
      </div>
      <div className="text-[11.5px] text-faint">
        Demo metrics. Acceptance shows how often agents used a suggestion, not whether it was
        factually correct.
      </div>
    </>
  );
}

export function ConversationsWidget({ m, go }: Props) {
  return (
    <div className="-mx-2 flex flex-col">
      {m.convRows.map((cv) => (
        <a
          key={cv.name}
          href="#"
          title="Open in Inbox"
          onClick={(e) => {
            e.preventDefault();
            go('inbox');
          }}
          className="flex items-center gap-3 rounded-[10px] px-2 py-[9px] text-ink no-underline hover:bg-[#F7F7F9] hover:text-ink hover:no-underline"
        >
          <span className="relative shrink-0">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-line-subtle text-[11.5px] font-semibold text-muted">
              {cv.initials}
            </span>
            <span
              title={cv.channel}
              className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-white"
              style={{ background: cv.color }}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate whitespace-nowrap text-[13.5px] font-semibold">
                {cv.name}
              </span>
              <span className="whitespace-nowrap text-[11.5px] text-faint">{cv.channel}</span>
              <span className="flex-1" />
              <span className="whitespace-nowrap text-[11.5px] text-faint">{cv.time}</span>
            </span>
            <span className="mt-[3px] flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] text-muted">
                {cv.msg}
              </span>
              <span className={pill} style={{ background: cv.sBg, color: cv.sColor }}>
                {cv.status}
              </span>
              <span
                title={cv.agentTitle}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-primary-hover',
                  cv.assigned
                    ? 'bg-[#E6E6FA]'
                    : 'border-[1.5px] border-dashed border-[#C9CBD3] bg-transparent',
                )}
              >
                {cv.agent}
              </span>
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

export function OrdersWidget({ m }: Props) {
  const { openOrder } = useShell();
  return (
    <>
      <div className="-mx-2 flex flex-col">
        {m.orderRows.map((od) => (
          <button
            key={od.id}
            type="button"
            onClick={() => openOrder(od.id)}
            className="box-border flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 py-[9px] text-left hover:bg-[#F7F7F9]"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-semibold tracking-[-0.01em]">
                  {od.id}
                </span>
                <span className="flex-1" />
                <span className="text-[13.5px] font-semibold tabular-nums">{od.amount}</span>
              </span>
              <span className="mt-[3px] flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: od.color }}
                />
                <span className="truncate whitespace-nowrap">
                  {od.customer} · {od.date}
                </span>
                <span className="flex-1" />
                <span className={pill} style={{ background: od.sBg, color: od.sColor }}>
                  {od.status}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="text-[11.5px] text-faint">
        Orders created in Torio (demo). No external store is connected.
      </div>
    </>
  );
}

export function FunnelWidget({ m }: Props) {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        {m.funnel.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-3"
          >
            <span className="text-[13px] font-medium">{f.label}</span>
            <span className="relative h-7 overflow-hidden rounded-[7px] bg-[#F5F5F8]">
              <span
                className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap rounded-[7px] pl-2.5 text-[13px] font-semibold tabular-nums"
                style={{ width: f.width, background: f.bar, color: f.textColor }}
              >
                {f.count}
              </span>
            </span>
            <span className="text-right text-xs text-muted">
              <span className="block font-medium text-ink">{f.pct}</span>
              <span style={{ color: f.deltaColor }}>{f.delta}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 border-t border-[#F1F2F4] pt-2.5 text-xs text-muted">
        <span>
          Overall conversion <b className="text-ink">{m.funnelRate}</b> of new leads
        </span>
        <span className="text-faint">Percentages are stage-to-stage · illustrative data</span>
      </div>
    </>
  );
}

export function TeamWidget({ m }: Props) {
  const grid = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_72px_56px] gap-2.5';
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {m.teamStats.map((ts) => (
          <div
            key={ts.label}
            className="min-w-0 rounded-[10px] border border-[#F1F2F4] bg-[#FBFBFC] px-3 py-2.5"
          >
            <div className="truncate whitespace-nowrap text-[11.5px] text-muted">{ts.label}</div>
            <div
              className="mt-0.5 text-[17px] font-semibold tabular-nums"
              style={{ color: ts.color }}
            >
              {ts.value}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        <div className={cn(grid, 'border-b border-line-subtle pb-1.5 text-[11.5px] text-faint')}>
          <span>Team member</span>
          <span>Workload</span>
          <span className="text-right">First reply</span>
          <span className="text-right">Pending</span>
        </div>
        {m.team.map((tm) => (
          <div
            key={tm.name}
            className={cn(grid, 'items-center border-b border-wash py-[9px] text-[13px]')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[10px] font-semibold text-primary-hover">
                {tm.initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate whitespace-nowrap font-medium">{tm.name}</span>
                <span className="block text-[11.5px] text-faint">
                  {tm.handled} handled · {tm.resolved} resolved
                </span>
              </span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-[3px] bg-wash-2">
              <span
                className="block h-full rounded-[3px] bg-[#A5A6F6]"
                style={{ width: tm.load }}
              />
            </span>
            <span className="text-right tabular-nums">{tm.frt}</span>
            <span className="text-right tabular-nums" style={{ color: tm.pendColor }}>
              {tm.pending}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[11.5px] text-faint">
        Listed alphabetically. Workload is share of conversations handled, not a ranking.
      </div>
    </>
  );
}

export type { WidgetModel };
