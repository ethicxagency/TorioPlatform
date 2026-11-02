'use client';

import { CheckCircle2, Clock, MessageSquare, ShoppingBag, Star } from 'lucide-react';
import Link from 'next/link';
import { channelLabel } from '@/components/channel-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Analytics } from '../analytics-queries';

const TONES = {
  red: 'bg-danger-soft text-danger',
  amber: 'bg-warning-soft text-warning',
  indigo: 'bg-primary-soft text-primary',
  gray: 'bg-wash-2 text-muted',
} as const;

const duration = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 48) return m ? `${h}h ${m}m` : `${h}h`;
  return `${Math.floor(h / 24)} days`;
};

interface Item {
  key: string;
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  count: number;
  title: string;
  detail: string;
  action: string;
  href: string;
}

/**
 * What needs a person right now. Every row comes from a real count in the analytics response and is shown only when
 * that count is above zero; there is no complaint row because Torio doesn't classify complaints.
 */
export function NeedsAttention({
  data,
  loading,
  channelQuery,
  now,
}: {
  data: Analytics | undefined;
  loading: boolean;
  /** Current time from the page clock, so waiting durations stay pure and update together. */
  now: number;
  /** Appended to Inbox links so the channel filter carries over (e.g. "?channel=WHATSAPP"). */
  channelQuery: string;
}) {
  const a = data?.attention;
  const items: Item[] = [];
  if (a?.waitingLong.count) {
    const o = a.waitingLong.oldest;
    items.push({
      key: 'long',
      tone: 'red',
      icon: <Clock size={16} aria-hidden />,
      count: a.waitingLong.count,
      title: `conversation${a.waitingLong.count === 1 ? '' : 's'} waiting over ${a.waitingLong.thresholdMinutes / 60} hours`,
      detail: o
        ? `Oldest: ${o.customerName} on ${channelLabel(o.provider)}, ${duration(Math.round((now - new Date(o.waitingSince).getTime()) / 60_000))}`
        : '',
      action: 'Open Inbox',
      href: o ? `/inbox?conversation=${o.conversationId}` : `/inbox${channelQuery}`,
    });
  }
  if (a?.waiting.count) {
    items.push({
      key: 'waiting',
      tone: 'amber',
      icon: <MessageSquare size={16} aria-hidden />,
      count: a.waiting.count,
      title: `conversation${a.waiting.count === 1 ? '' : 's'} waiting for a reply`,
      detail:
        a.waiting.averageWaitMinutes !== null
          ? `Average wait in queue is ${duration(a.waiting.averageWaitMinutes)}`
          : '',
      action: 'Open Inbox',
      href: `/inbox${channelQuery}`,
    });
  }
  if (a?.staleLeads.count) {
    items.push({
      key: 'leads',
      tone: 'indigo',
      icon: <Star size={16} aria-hidden />,
      count: a.staleLeads.count,
      title: `high-priority lead${a.staleLeads.count === 1 ? '' : 's'} need${a.staleLeads.count === 1 ? 's' : ''} follow-up`,
      detail: `Strong score, no activity in the last ${a.staleLeads.idleHours}h`,
      action: 'View Leads',
      href: '/leads',
    });
  }
  if (a?.pendingOrders.count) {
    items.push({
      key: 'orders',
      tone: 'gray',
      icon: <ShoppingBag size={16} aria-hidden />,
      count: a.pendingOrders.count,
      title: `order${a.pendingOrders.count === 1 ? '' : 's'} awaiting confirmation`,
      detail: 'Still pending; confirm or cancel them',
      action: 'View Orders',
      href: '/orders',
    });
  }

  return (
    <section
      aria-label="Needs Attention"
      className="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-white p-5 sm:p-6"
    >
      <header>
        <h2 className="m-0 font-section-title">Needs Attention</h2>
        <p className="m-0 mt-0.5 text-[13px] text-muted">What to handle next.</p>
      </header>
      {loading ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-[10px]" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-3/5 bg-wash-2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-[#FBFBFC] px-4 py-10 text-center">
          <CheckCircle2 size={22} className="text-success" aria-hidden />
          <div className="text-sm font-semibold">All caught up</div>
          <p className="m-0 max-w-[240px] text-[12.5px] text-muted">
            Nothing is waiting on your team right now.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((it) => (
            <li key={it.key}>
              <div className="group flex items-start gap-3 rounded-xl px-1.5 py-3 hover:bg-[#FAFAFC]">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
                    TONES[it.tone],
                  )}
                >
                  {it.icon}
                </span>
                <Link
                  href={it.href}
                  className="min-w-0 flex-1 text-ink no-underline hover:text-ink hover:no-underline"
                >
                  <div className="text-[14px] font-semibold leading-snug">
                    <span
                      className={cn(
                        it.tone === 'red' && 'text-danger',
                        it.tone === 'amber' && 'text-warning',
                      )}
                    >
                      {it.count.toLocaleString('en-US')}
                    </span>{' '}
                    {it.title}
                  </div>
                  {it.detail && (
                    <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{it.detail}</div>
                  )}
                </Link>
                <Link
                  href={it.href}
                  className="shrink-0 rounded-[9px] border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink no-underline hover:bg-wash hover:text-ink hover:no-underline"
                >
                  {it.action}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
