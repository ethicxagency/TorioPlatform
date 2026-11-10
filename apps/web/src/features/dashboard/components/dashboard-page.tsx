'use client';

import {
  DEFAULT_CURRENCY,
  daysBetween,
  formatCurrency,
  formatRange,
  granularityFor,
  granularityOptions,
  parseIso,
} from '@torio/contracts';
import {
  Message01Icon,
  Refresh01Icon,
  ShoppingBag01Icon,
  SlidersHorizontalIcon,
  UserAdd01Icon,
  UserGroupIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons';
import { Icon } from '@/components/ui/icon';
import type { IconSvgElement } from '@hugeicons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WIDGETS, type ChannelKey, type DemoState, type RangeDef, type WidgetKey } from '../data';
import { useDashboardAnalytics } from '../analytics-queries';
import { useDashboardRange, type DashboardChannel } from '../use-dashboard-range';
import { ConversationOverview } from './conversation-overview';
import { NeedsAttention } from './needs-attention';
import { AnalyticsSection } from './analytics-section';
import { Breakdown } from './breakdown';
import { KpiTabs } from './kpi-tabs';
import { MetricChart, type Gran } from './metric-chart';
import { ChannelSelect } from './channel-select';
import { DateRangeSelector } from './date-range-selector';
import { buildDashboardModel, type Target, type WidgetModel } from '../model';
import { useDashboardLayout } from '../use-dashboard-layout';
import {
  AiWidget,
  ChannelsWidget,
  ConversationsWidget,
  FunnelWidget,
  OrdersWidget,
  TeamWidget,
} from './widgets';

const TARGET_HREF: Record<Target, string> = {
  inbox: '/inbox',
  leads: '/leads',
  orders: '/orders',
  channels: '/channels',
  team: '/team',
  brain: '/brain',
};
type MetricId = 'revenue' | 'orders' | 'conversations' | 'leads' | 'newCustomers';
const METRIC_ORDER: MetricId[] = ['revenue', 'orders', 'conversations', 'leads', 'newCustomers'];

const SAMPLE_CHANNEL: Record<DashboardChannel, ChannelKey> = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  MESSENGER: 'facebook',
};

/** Re-renders on an interval so "Updated 2 min ago" stays true. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Square icon-only header action (refresh, customize). */
const ICON_BTN =
  'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-line bg-white text-muted transition-colors duration-150 hover:border-line-input hover:bg-wash hover:text-ink active:bg-wash-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:hover:bg-white motion-reduce:transition-none';

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
  const router = useRouter();
  const { workspaceId: ws, workspace } = useWorkspace();
  const layout = useDashboardLayout(ws);
  const timeZone = workspace?.reportingTimeZone ?? 'UTC';
  const sel = useDashboardRange(timeZone);
  const [metric, setMetric] = useState<MetricId>('revenue');
  const [granPick, setGranPick] = useState<Gran | null>(null);
  const days = daysBetween(parseIso(sel.range.from)!, parseIso(sel.range.to)!);
  const grans = granularityOptions(days) as Gran[];
  // A grouping chosen for one range is kept only while the new range supports it.
  const gran: Gran = granPick && grans.includes(granPick) ? granPick : granularityFor(days);
  const analytics = useDashboardAnalytics(ws, sel.range, sel.channel, gran);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const now = useNow(30_000);

  useEffect(() => registerEscape(() => setCustomizeOpen(false)), [registerEscape]);

  // Every dashboard action goes to the real page it names (all of these routes exist).
  const go = (t: Target) => router.push(TARGET_HREF[t]);
  // One request per selection (cached by range + channel); refresh refetches it, and is disabled while in flight.
  const refresh = () => {
    if (!analytics.isFetching) void analytics.refetch();
  };
  const d = analytics.data;
  const aLoading = analytics.isPending;
  const channelQuery = sel.channel ? `?channel=${sel.channel}` : '';

  // The lower widgets are sample data scaled to the selected range (no backend measures them yet).
  const rangeDef: RangeDef = {
    k: 'custom',
    l: formatRange(sel.range),
    f: Math.min(3, Math.max(0.03, days / 30)),
    n: Math.min(60, Math.max(2, days)),
    label: formatRange(sel.range),
    prev: 'previous period',
  };
  const m = buildDashboardModel({
    range: 'custom',
    rangeOverride: rangeDef,
    channel: sel.channel ? SAMPLE_CHANNEL[sel.channel] : 'all',
    metric: 'conv',
    demoState,
    refreshing: false,
    brainOk: brainConfigured,
    messengerConnected,
    mobile,
    contentWidth,
    order: layout.order,
    hidden: layout.hidden,
  });
  const showOverview = !layout.hidden.overview;
  const showAttention = !layout.hidden.attention;
  const lowerWidgets = m.widgets.filter((w) => w.k !== 'overview' && w.k !== 'attention');

  const cur = d?.revenue.primaryCurrency || workspace?.defaultCurrency || DEFAULT_CURRENCY;
  const primary = d?.revenue.byCurrency.find((x) => x.currency === cur);
  const icon = (I: IconSvgElement) => <Icon icon={I} size={14} strokeWidth={1.9} />;
  const num = (n: number) => Math.round(n).toLocaleString('en-US');
  const metrics: Record<
    MetricId,
    {
      label: string;
      icon: React.ReactNode;
      total: number;
      series: number[];
      split: keyof NonNullable<typeof d>['byChannel'];
      fmt: (n: number) => string;
      axis: (n: number) => string;
    }
  > = {
    revenue: {
      label: 'Revenue',
      icon: icon(Wallet01Icon),
      total: primary?.amountMinor ?? 0,
      series: d?.series.revenue ?? [],
      split: 'revenue',
      fmt: (n) => formatCurrency(n, cur),
      axis: (n) => formatCurrency(n, cur, { compact: true }),
    },
    orders: {
      label: 'Orders',
      icon: icon(ShoppingBag01Icon),
      total: d?.orders.total ?? 0,
      series: d?.series.orders ?? [],
      split: 'orders',
      fmt: num,
      axis: num,
    },
    conversations: {
      label: 'Conversations',
      icon: icon(Message01Icon),
      // Conversations started in the period (the same definition the chart and channel split use).
      total: d?.messaging.new ?? 0,
      series: d?.series.newConversations ?? [],
      split: 'conversations',
      fmt: num,
      axis: num,
    },
    leads: {
      label: 'Leads',
      icon: icon(UserGroupIcon),
      total: d?.leads.total ?? 0,
      series: d?.series.leads ?? [],
      split: 'leads',
      fmt: num,
      axis: num,
    },
    newCustomers: {
      label: 'New Customers',
      icon: icon(UserAdd01Icon),
      total: d?.customers.new ?? 0,
      series: d?.series.newCustomers ?? [],
      split: 'newCustomers',
      fmt: num,
      axis: num,
    },
  };
  const M = metrics[metric];
  const tabs = METRIC_ORDER.map((k) => ({
    key: k,
    label: metrics[k].label,
    icon: metrics[k].icon,
    value: d ? metrics[k].fmt(metrics[k].total) : '—',
    series: metrics[k].series,
  }));
  // Five across when there is room, otherwise a balanced grid; never sideways scrolling.
  const kpiCols =
    contentWidth >= 1180
      ? 'grid-cols-5'
      : contentWidth >= 820
        ? 'grid-cols-3'
        : contentWidth >= 330
          ? 'grid-cols-2'
          : 'grid-cols-1';
  const chTable = contentWidth >= 700 && !mobile;

  return (
    <div
      className={cn(
        'mx-auto flex max-w-[1440px] flex-col gap-4',
        mobile ? 'px-4 pb-6 pt-4' : 'px-6 pb-8 pt-5',
      )}
    >
      {/* page header */}
      {/* On phones the controls dissolve into this row: actions sit beside the title, filters share the next line. */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <h1 className="m-0 mr-auto font-page-title">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2 max-sm:contents">
          <DateRangeSelector
            className="max-sm:order-2 max-sm:min-w-0 max-sm:grow max-sm:basis-[45%]"
            preset={sel.preset}
            range={sel.range}
            today={sel.today}
            timeZone={timeZone}
            onPreset={sel.setPreset}
            onCustom={sel.setCustom}
          />
          <ChannelSelect
            className="max-sm:order-2 max-sm:min-w-0 max-sm:grow max-sm:basis-[45%] sm:w-[188px]"
            value={sel.channel}
            onChange={sel.setChannel}
          />
          <button
            type="button"
            onClick={refresh}
            disabled={analytics.isFetching}
            aria-label="Refresh dashboard"
            aria-busy={analytics.isFetching}
            title="Refresh dashboard"
            className={cn(ICON_BTN, 'disabled:cursor-wait max-sm:order-1')}
          >
            <Icon
              icon={Refresh01Icon}
              size={18}
              strokeWidth={1.9}
              className={analytics.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}
            />
          </button>
          <div className="relative max-sm:order-1">
            <button
              type="button"
              onClick={() => setCustomizeOpen((v) => !v)}
              aria-expanded={customizeOpen}
              aria-label={
                layout.customized ? 'Customize dashboard (customized)' : 'Customize dashboard'
              }
              title="Customize dashboard"
              className={cn(
                ICON_BTN,
                'relative',
                customizeOpen &&
                  'border-primary bg-primary-soft text-primary hover:bg-primary-soft',
              )}
            >
              <Icon icon={SlidersHorizontalIcon} size={18} strokeWidth={1.9} />
              {layout.customized && (
                <span
                  aria-hidden
                  className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-white"
                />
              )}
            </button>
            {customizeOpen && (
              <div
                role="dialog"
                aria-label="Customize dashboard"
                className="absolute right-0 top-[52px] z-[45] w-[min(320px,calc(100vw-32px))] animate-panel-in rounded-[14px] border border-line glass-menu p-2 shadow-popover backdrop-saturate-150"
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
                            stroke="#5A6A82"
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

      {analytics.isError && !d && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          Couldn&apos;t load the dashboard. {analytics.error.message}
          <button
            type="button"
            onClick={refresh}
            className="cursor-pointer font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* KPI tabs: the selected one drives the chart and the breakdown */}
      <KpiTabs
        tabs={tabs}
        selected={metric}
        onSelect={(k) => setMetric(k as MetricId)}
        loading={aLoading}
        cols={kpiCols}
        compact={mobile}
      />

      <div
        className={cn(
          'grid items-stretch gap-4',
          contentWidth >= 1000 ? 'grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-1',
        )}
      >
        <MetricChart
          title={M.label}
          buckets={d?.series.buckets ?? []}
          values={M.series}
          gran={gran}
          grans={grans}
          onGran={setGranPick}
          fmt={M.fmt}
          fmtAxis={M.axis}
          range={sel.range}
          loading={aLoading}
          compact={mobile}
        />
        <Breakdown
          metricLabel={M.label}
          periodLabel={formatRange(sel.range)}
          total={M.total}
          values={M.series}
          buckets={d?.series.buckets ?? []}
          gran={gran}
          range={sel.range}
          byChannel={d?.byChannel?.[M.split]}
          channel={sel.channel}
          onChannel={sel.setChannel}
          fmt={M.fmt}
          loading={aLoading}
        />
      </div>

      {/* primary analytics: conversation overview + needs attention */}
      {(showOverview || showAttention) && (
        <div
          className={cn(
            'grid items-stretch gap-4',
            showOverview && showAttention && 'lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]',
          )}
        >
          {showOverview && (
            <ConversationOverview data={d} loading={aLoading} inboxHref={`/inbox${channelQuery}`} />
          )}
          {showAttention && (
            <NeedsAttention data={d} loading={aLoading} channelQuery={channelQuery} now={now} />
          )}
        </div>
      )}

      <AnalyticsSection
        data={analytics.data}
        loading={analytics.isPending}
        error={analytics.isError ? analytics.error.message : null}
        fetching={analytics.isFetching}
        range={sel.range}
        mobile={mobile}
        onRetry={() => void analytics.refetch()}
      />

      {/* Widgets */}
      <div className="grid grid-cols-12 items-stretch gap-4">
        {lowerWidgets.map((w) => (
          <WidgetFrame key={w.k} w={w} pad={mobile ? 'p-4' : 'p-5'} go={go} refresh={refresh}>
            {w.show && w.k === 'channels' && <ChannelsWidget m={m} go={go} table={chTable} />}
            {w.show && w.k === 'ai' && <AiWidget m={m} go={go} />}
            {w.show && w.k === 'conversations' && <ConversationsWidget m={m} go={go} />}
            {w.show && w.k === 'orders' && <OrdersWidget m={m} go={go} />}
            {w.show && w.k === 'funnel' && <FunnelWidget m={m} go={go} />}
            {w.show && w.k === 'team' && <TeamWidget m={m} go={go} />}
          </WidgetFrame>
        ))}
      </div>

      {lowerWidgets.length === 0 && !showOverview && !showAttention && (
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
          <h2 className="m-0 font-card-title tracking-[-0.005em]">{w.label}</h2>
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
            className="inline-flex h-8 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-white no-underline hover:bg-primary-hover hover:text-white hover:no-underline"
          >
            {w.emptyAction}
          </a>
        </div>
      )}

      {children}
    </section>
  );
}
