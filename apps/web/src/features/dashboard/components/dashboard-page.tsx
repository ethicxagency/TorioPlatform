'use client';

import { useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  CH,
  RANGES,
  WIDGETS,
  type ChannelKey,
  type DemoState,
  type MetricKey,
  type RangeKey,
  type WidgetKey,
} from '../data';
import { buildDashboardModel, type Target, type WidgetModel } from '../model';
import { useDashboardLayout } from '../use-dashboard-layout';
import {
  AiWidget,
  AttentionWidget,
  ChannelsWidget,
  ConversationsWidget,
  FunnelWidget,
  OrdersWidget,
  OverviewWidget,
  TeamWidget,
} from './widgets';

const TARGET_NAMES: Record<Target, string> = {
  inbox: 'Inbox',
  leads: 'Leads',
  orders: 'Orders',
  channels: 'Channels',
  team: 'Team',
  brain: 'Brain',
};
const selectCls = 'cursor-pointer border-none bg-transparent text-[13px] font-medium text-ink';
const ctrl = 'flex h-9 items-center rounded-[9px] border border-line bg-white';

export interface DashboardPageProps {
  demoState?: DemoState;
  brainConfigured?: boolean;
  messengerConnected?: boolean;
}

export function DashboardPage({
  demoState = 'Populated',
  brainConfigured = true,
  messengerConnected = true,
}: DashboardPageProps) {
  const shell = useShell();
  const { mobile, contentWidth, toast, registerEscape } = shell;
  const layout = useDashboardLayout();
  const [range, setRange] = useState<RangeKey>('30d');
  const [channel, setChannel] = useState<'all' | ChannelKey>('all');
  const [metric, setMetric] = useState<MetricKey>('conv');
  const [refreshing, setRefreshing] = useState(false);
  const [forced, setForced] = useState<DemoState | null>(null);
  const [updated, setUpdated] = useState('Updated 2 min ago');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => registerEscape(() => setCustomizeOpen(false)), [registerEscape]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const go = (t: Target) => toast(`${TARGET_NAMES[t]} isn't available yet`);
  const refresh = () => {
    clearTimeout(refreshTimer.current);
    setRefreshing(true);
    refreshTimer.current = setTimeout(() => {
      setRefreshing(false);
      setForced('Populated');
      setUpdated('Updated just now');
    }, 900);
  };

  const m = buildDashboardModel({
    range,
    channel,
    metric,
    demoState: forced ?? demoState,
    refreshing,
    brainOk: brainConfigured,
    messengerConnected,
    mobile,
    contentWidth,
    order: layout.order,
    hidden: layout.hidden,
  });
  const { loading } = m;
  const kpiCols = contentWidth >= 1000 ? 'grid-cols-4' : 'grid-cols-2';
  const chTable = contentWidth >= 700 && !mobile;

  return (
    <div
      className={cn(
        'mx-auto flex max-w-[1440px] flex-col gap-4',
        mobile ? 'px-4 pb-6 pt-4' : 'px-6 pb-8 pt-6',
      )}
    >
      {/* page header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">Dashboard</h1>
            <span
              title="All numbers on this page are fictional sample data"
              className="rounded-md bg-line-subtle px-2 py-0.5 text-[11.5px] font-medium text-muted"
            >
              Demo data
            </span>
          </div>
          <div className="mt-1 text-sm text-muted">
            Here&apos;s what&apos;s happening with your business today.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-faint">{loading ? 'Refreshing…' : updated}</span>
          <label className={cn(ctrl, 'gap-1.5 pl-2.5 pr-2')}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#62656D"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
            </svg>
            <select
              aria-label="Date range"
              value={range}
              className={cn(selectCls, 'pr-0.5')}
              onChange={(e) => {
                const v = e.target.value as RangeKey;
                setRange(v);
                if (v === 'custom') toast('Date picker not available yet — showing 1–15 Oct');
              }}
            >
              {RANGES.map((r) => (
                <option key={r.k} value={r.k}>
                  {r.k === 'custom' && range === 'custom' ? '1–15 Oct (custom)' : r.l}
                </option>
              ))}
            </select>
          </label>
          <label className={cn(ctrl, 'gap-1.5 pl-2.5 pr-2')}>
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: channel === 'all' ? '#5B5CE2' : CH[channel].color }}
            />
            <select
              aria-label="Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'all' | ChannelKey)}
              className={selectCls}
            >
              <option value="all">All channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Messenger</option>
            </select>
          </label>
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh dashboard"
            title="Refresh"
            className={cn(ctrl, 'w-9 cursor-pointer justify-center hover:bg-wash')}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#62656D"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
            </svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCustomizeOpen((v) => !v)}
              aria-expanded={customizeOpen}
              className={cn(
                ctrl,
                'cursor-pointer gap-1.5 px-3 text-[13px] font-medium hover:bg-wash',
                customizeOpen && 'bg-primary-soft',
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#62656D"
                strokeWidth="1.9"
                strokeLinecap="round"
              >
                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="10" cy="12" r="2" />
                <circle cx="18" cy="18" r="2" />
              </svg>
              {!mobile && <span>Customize</span>}
            </button>
            {customizeOpen && (
              <div
                role="dialog"
                aria-label="Customize dashboard"
                className="absolute right-0 top-[42px] z-[45] w-[min(320px,calc(100vw-32px))] animate-panel-in rounded-[14px] border border-line bg-white/95 p-2 shadow-popover backdrop-blur-[20px] backdrop-saturate-150"
              >
                <div className="px-2 pb-2 pt-1.5">
                  <div className="text-sm font-semibold">Customize dashboard</div>
                  <div className="mt-0.5 text-xs text-faint">
                    Show, hide and reorder sections. Saved in this browser.
                  </div>
                </div>
                {layout.order.map((k, i) => {
                  const w = WIDGETS.find((x) => x.k === k)!;
                  const on = !layout.hidden[k];
                  const first = i === 0;
                  const last = i === layout.order.length - 1;
                  return (
                    <div
                      key={k}
                      className="flex items-center gap-2 rounded-lg py-1 pl-2 pr-1.5 hover:bg-[#F7F7F9]"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => layout.toggle(k as WidgetKey)}
                        className="flex h-[30px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px]"
                          style={{
                            borderColor: on ? '#5B5CE2' : '#C9CBD3',
                            background: on ? '#5B5CE2' : '#fff',
                          }}
                        >
                          {on && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="3.4"
                              strokeLinecap="round"
                            >
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          )}
                        </span>
                        <span className={cn('text-[13.5px]', on ? 'text-ink' : 'text-faint')}>
                          {w.l}
                        </span>
                      </button>
                      {(
                        [
                          ['up', -1, first, 'M6 15l6-6 6 6'],
                          ['down', 1, last, 'M6 9l6 6 6-6'],
                        ] as const
                      ).map(([name, dir, disabled, d]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => layout.move(k as WidgetKey, dir)}
                          disabled={disabled}
                          aria-label={`Move ${name}`}
                          className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-md hover:bg-line-subtle disabled:cursor-default disabled:opacity-30"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#62656D"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          >
                            <path d={d} />
                          </svg>
                        </button>
                      ))}
                    </div>
                  );
                })}
                <div className="mt-1.5 flex items-center justify-between border-t border-line-subtle px-2 pb-0.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      layout.reset();
                      toast('Default layout restored');
                    }}
                    className="cursor-pointer text-[13px] font-medium text-primary"
                  >
                    Restore default
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeOpen(false)}
                    className="h-[30px] cursor-pointer rounded-lg bg-ink px-3 text-[12.5px] font-semibold text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {m.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C53030"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <span className="min-w-[200px] flex-1">
            <b>Some dashboard data failed to load.</b> Conversation and channel metrics are
            unavailable right now. Other sections are shown as last loaded.
          </span>
          <button
            type="button"
            onClick={refresh}
            className="h-[30px] cursor-pointer rounded-lg border border-[#F3C4C4] bg-white px-3 text-[12.5px] font-semibold text-danger"
          >
            Try again
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className={cn('grid gap-3', kpiCols)}>
        {m.kpis.map((k) => (
          <div
            key={k.label}
            className={cn(
              'flex min-w-0 flex-col gap-2 rounded-card border border-line bg-white',
              mobile ? 'p-3' : 'p-4',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-primary-line bg-primary-tint">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5B5CE2"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={k.icon} />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-medium text-muted">
                {k.label}
              </span>
              {k.showSpark && (
                <svg
                  width="72"
                  height="26"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                  className="shrink-0"
                >
                  <path
                    d={k.spark}
                    fill="none"
                    stroke="#5B5CE2"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.75"
                  />
                </svg>
              )}
            </div>
            {loading ? (
              <>
                <Skeleton className="h-[30px] w-3/5" />
                <Skeleton className="h-3 w-4/5 bg-wash-2" />
              </>
            ) : (
              <>
                <div
                  className="font-semibold tabular-nums leading-[1.15] tracking-[-0.02em]"
                  style={{ fontSize: mobile ? 20 : 26 }}
                >
                  {k.value}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
                  {k.hasDelta && (
                    <>
                      <span
                        className="rounded-[5px] px-1.5 py-px font-semibold"
                        style={{ color: k.deltaColor, background: k.deltaBg }}
                      >
                        {k.delta}
                      </span>
                      <span>vs {m.prevLabel}</span>
                    </>
                  )}
                  {k.noData && <span>No data for this period</span>}
                </div>
                <div className="border-t border-[#F1F2F4] pt-2 text-xs text-muted [text-wrap:pretty]">
                  {k.sub}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-12 items-stretch gap-4">
        {m.widgets.map((w) => (
          <WidgetFrame key={w.k} w={w} pad={mobile ? 'p-4' : 'p-5'} go={go} refresh={refresh}>
            {w.show && w.k === 'overview' && (
              <OverviewWidget
                m={m}
                metric={metric}
                setMetric={setMetric}
                wide={contentWidth >= 700}
              />
            )}
            {w.show && w.k === 'attention' && <AttentionWidget m={m} go={go} />}
            {w.show && w.k === 'channels' && <ChannelsWidget m={m} go={go} table={chTable} />}
            {w.show && w.k === 'ai' && <AiWidget m={m} go={go} />}
            {w.show && w.k === 'conversations' && <ConversationsWidget m={m} go={go} />}
            {w.show && w.k === 'orders' && <OrdersWidget m={m} go={go} />}
            {w.show && w.k === 'funnel' && <FunnelWidget m={m} go={go} />}
            {w.show && w.k === 'team' && <TeamWidget m={m} go={go} />}
          </WidgetFrame>
        ))}
      </div>

      {m.widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center">
          <div className="text-sm font-semibold">All sections are hidden</div>
          <div className="mb-3 mt-1 text-[12.5px] text-muted">
            Use Customize to bring sections back.
          </div>
          <button
            type="button"
            onClick={layout.reset}
            className="h-8 cursor-pointer rounded-lg border border-line bg-white px-3 text-[13px] font-medium"
          >
            Restore default layout
          </button>
        </div>
      )}

      <div className="py-2 pb-4 text-center text-xs text-faint">
        Prototype · UrbanNest is a fictional demo merchant. Numbers are illustrative, not live or
        synced.
      </div>
    </div>
  );
}

const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

function WidgetFrame({
  w,
  pad,
  go,
  refresh,
  children,
}: {
  w: WidgetModel;
  pad: string;
  go: (t: Target) => void;
  refresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={w.label}
      className={cn(
        'flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-white',
        pad,
        SPAN_CLASS[w.span],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold tracking-[-0.005em]">{w.label}</h2>
          <div className="mt-0.5 text-[12.5px] text-muted">{w.sub}</div>
        </div>
        {w.action && (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go(w.action!.target);
            }}
            className="shrink-0 whitespace-nowrap text-[13px] font-medium text-primary"
          >
            {w.action.label} →
          </a>
        )}
      </div>

      {w.loading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-2/5 rounded" />
          <Skeleton style={{ height: w.skelH }} className="rounded-lg bg-[#F3F4F6]" />
          <Skeleton className="h-3 w-[70%] rounded bg-wash-2" />
        </div>
      )}

      {w.error && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[10px] border border-dashed border-line px-4 py-7 text-center">
          <div className="text-sm font-semibold">Metrics unavailable</div>
          <div className="mb-3 mt-1 max-w-[280px] text-[12.5px] text-muted">
            We couldn&apos;t load this section. Your data isn&apos;t affected.
          </div>
          <button
            type="button"
            onClick={refresh}
            className="h-[30px] cursor-pointer rounded-lg border border-line bg-white px-3 text-[12.5px] font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {w.empty && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-7 text-center">
          <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-soft">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5B5CE2"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={w.icon} />
            </svg>
          </span>
          <div className="text-sm font-semibold">{w.emptyTitle}</div>
          <div className="mb-3 mt-1 max-w-[300px] text-[12.5px] text-muted [text-wrap:pretty]">
            {w.emptyBody}
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go(w.emptyTarget);
            }}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white no-underline hover:bg-primary-hover hover:text-white hover:no-underline"
          >
            {w.emptyAction}
          </a>
        </div>
      )}

      {children}
    </section>
  );
}
