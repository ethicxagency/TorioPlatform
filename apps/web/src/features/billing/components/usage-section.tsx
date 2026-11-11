'use client';

import {
  ArrowUpRight,
  CircleAlert,
  Contact,
  MessageSquare,
  Plug,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeZone } from '@/features/settings/queries';
import { cn } from '@/lib/utils';
import { useUsage } from '../queries';
import type { Overview, Usage } from '../types';
import { fmtDate, Notice } from './bits';

type Item = Usage['data'][number];
type State = 'unlimited' | 'ok' | 'approaching' | 'near' | 'reached' | 'exceeded' | 'none';

/**
 * What to show for one meter. The API caps `percent` at 100 and reports "reached" for both "at the limit" and "over it",
 * so "exceeded" is derived here from the real used and limit numbers, never from the capped percentage.
 */
function stateOf(d: Item): State {
  if (d.limit < 0) return 'unlimited';
  if (d.used > d.limit) return 'exceeded';
  if (d.limit === 0) return 'none';
  return d.level === 'unlimited' ? 'ok' : d.level;
}

const STATE: Record<State, { label: string; badge: string; bar: string; text: string }> = {
  unlimited: {
    label: 'Unlimited',
    badge: 'bg-primary-soft text-primary-hover',
    bar: 'bg-primary',
    text: 'text-primary-hover',
  },
  ok: {
    label: 'Within limit',
    badge: 'bg-success-soft text-success',
    bar: 'bg-primary',
    text: 'text-ink',
  },
  approaching: {
    label: 'Approaching limit',
    badge: 'bg-warning-soft text-warning',
    bar: 'bg-warning',
    text: 'text-ink',
  },
  near: {
    label: 'Near limit',
    badge: 'bg-[#FFEBD5] text-[#9A4A06]',
    bar: 'bg-[#EA7A12]',
    text: 'text-ink',
  },
  reached: {
    label: 'Limit reached',
    badge: 'bg-danger-soft text-danger',
    bar: 'bg-danger',
    text: 'text-danger',
  },
  exceeded: {
    label: 'Limit exceeded',
    badge: 'bg-danger-soft text-danger',
    bar: 'bg-danger',
    text: 'text-danger',
  },
  none: { label: 'Not included', badge: 'bg-wash-2 text-muted', bar: 'bg-faint', text: 'text-ink' },
};

const ICON: Record<string, LucideIcon> = {
  members: Users,
  channels: Plug,
  contacts: Contact,
  messages: MessageSquare,
  whatsapp: MessageSquare,
  instagram: MessageSquare,
  messenger: MessageSquare,
};
const GROUPS: { title: string; color: string; metrics: string[] }[] = [
  { title: 'Team & channels', color: '#5B5CE2', metrics: ['members', 'channels'] },
  { title: 'Customer capacity', color: '#2B8FD9', metrics: ['contacts'] },
  {
    title: 'Messaging & conversations',
    color: '#7C3AED',
    metrics: ['messages', 'whatsapp', 'instagram', 'messenger'],
  },
];
const SHORT: Record<string, string> = {
  members: 'Team members',
  channels: 'Channels',
  contacts: 'Contacts',
  messages: 'Messages',
};

const num = (n: number) => n.toLocaleString();
const ofLimit = (d: Item) => (d.limit < 0 ? 'unlimited' : num(d.limit));

function Tile({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Icon size={17} />
    </span>
  );
}

/** Progress bar that grows from empty on first paint. The bar is capped at 100%; the numbers beside it never are. */
function Meter({ d, st }: { d: Item; st: State }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = st === 'exceeded' ? 100 : d.percent;
  return (
    <div
      role="progressbar"
      aria-label={d.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${num(d.used)} of ${ofLimit(d)} used`}
      className="h-2 overflow-hidden rounded-full bg-wash-2"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
          STATE[st].bar,
        )}
        style={{ width: shown ? `${pct}%` : 0 }}
      />
    </div>
  );
}

function Card({ d, color }: { d: Item; color: string }) {
  const st = stateOf(d);
  const s = STATE[st];
  const Icon = ICON[d.metric] ?? Users;
  const over = d.used - d.limit;
  const rawPct = d.limit > 0 ? Math.round((d.used / d.limit) * 100) : 0;
  return (
    <li className="rounded-card border border-line bg-white p-4 transition-shadow duration-200 hover:shadow-[0_2px_10px_rgba(0,55,112,0.06)] motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <Tile icon={Icon} color={color} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{d.label}</div>
          <div
            className={cn('mt-0.5 text-[20px] font-semibold tabular-nums leading-tight', s.text)}
          >
            {num(d.used)}
            <span className="text-[13px] font-normal text-faint"> / {ofLimit(d)}</span>
          </div>
        </div>
        <span
          className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium', s.badge)}
        >
          {s.label}
        </span>
      </div>
      {st === 'unlimited' ? (
        <p className="m-0 mt-3 text-xs text-faint">No limit on your plan.</p>
      ) : (
        <>
          <div className="mt-3">
            <Meter d={d} st={st} />
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-xs text-faint">
            <span>
              {st === 'exceeded'
                ? d.limit === 0
                  ? 'Over the limit'
                  : `${num(rawPct)}% used`
                : st === 'none'
                  ? 'Not part of your plan'
                  : `${d.percent}% used`}
            </span>
            <span className={st === 'exceeded' ? 'font-medium text-danger' : undefined}>
              {st === 'exceeded'
                ? `${num(over)} over`
                : st === 'none'
                  ? ''
                  : `${num(d.remaining)} remaining`}
            </span>
          </div>
        </>
      )}
    </li>
  );
}

/** Usage against the plan's limits: an overview, a banner only when something needs attention, then cards by category. */
export function UsageSection({
  ws,
  o,
  go,
}: {
  ws: string;
  o?: Overview;
  go: (tab: string) => void;
}) {
  const q = useUsage(ws);
  const tz = useTimeZone();
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <Notice tone="bad">Couldn&apos;t load usage.</Notice>;
  const u = q.data;
  const by = new Map(u.data.map((d) => [d.metric as string, d]));
  const flagged = u.data
    .map((d) => ({ d, st: stateOf(d) }))
    .filter((x) => ['approaching', 'near', 'reached', 'exceeded'].includes(x.st));
  const severe = flagged.some((x) => x.st === 'reached' || x.st === 'exceeded');
  const canUpgrade = !o || o.plan.rank < 3;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-[15px] font-semibold">Usage &amp; limits</h2>
        <p className="m-0 text-xs text-muted">
          {fmtDate(u.periodStart, tz)} – {fmtDate(u.periodEnd, tz)} · counted from your real data ·
          limits are warnings only; usage isn&apos;t blocked.
        </p>
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 lg:grid-cols-4">
        {Object.keys(SHORT).map((m) => {
          const d = by.get(m);
          if (!d) return null;
          const st = stateOf(d);
          const Icon = ICON[m]!;
          return (
            <li key={m} className="flex items-center gap-2.5 rounded-xl bg-wash px-3 py-2.5">
              <Tile icon={Icon} color={GROUPS.find((g) => g.metrics.includes(m))!.color} />
              <div className="min-w-0">
                <div className="truncate text-xs text-muted">{SHORT[m]}</div>
                <div className={cn('text-[15px] font-semibold tabular-nums', STATE[st].text)}>
                  {num(d.used)}
                  <span className="text-xs font-normal text-faint"> / {ofLimit(d)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {flagged.length > 0 && (
        <div
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 text-[13px]',
            severe
              ? 'border-[#F5CACA] bg-danger-soft text-[#8F2424]'
              : 'border-[#F3DFB6] bg-[#FFFAF0] text-warning',
          )}
        >
          <CircleAlert size={16} aria-hidden className="shrink-0" />
          <p className="m-0 min-w-0 flex-1">
            <b className="font-semibold">
              {severe ? 'Some limits are reached or exceeded.' : 'Some usage is nearing its limit.'}
            </b>{' '}
            {flagged
              .map(
                ({ d, st }) =>
                  `${d.label}: ${STATE[st].label.toLowerCase()} (${num(d.used)} / ${ofLimit(d)})`,
              )
              .join(' · ')}
          </p>
          {canUpgrade && (
            <Button size="sm" onClick={() => go('plans')}>
              Upgrade plan <ArrowUpRight size={14} aria-hidden />
            </Button>
          )}
        </div>
      )}

      {GROUPS.map((g) => {
        const items = g.metrics.map((m) => by.get(m)).filter((d): d is Item => !!d);
        if (!items.length) return null;
        return (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
            <h3 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint">
              {g.title}
            </h3>
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
              {items.map((d) => (
                <Card key={d.metric} d={d} color={g.color} />
              ))}
            </ul>
          </section>
        );
      })}

      {u.notTracked.length > 0 && (
        <p className="m-0 text-xs text-muted">
          <b className="font-semibold">Not tracked yet:</b> {u.notTracked.join(', ')}: the
          application doesn&apos;t measure these yet, so no number is shown rather than an invented
          one.
        </p>
      )}
    </div>
  );
}
