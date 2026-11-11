'use client';

import { USAGE_LABEL, type UsageMetric } from '@torio/contracts';
import { ChevronRight, Info, Infinity as InfinityIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Interval, Plan } from '../types';
import { money } from './bits';

/** Each plan keeps one colour everywhere in the table so the columns are easy to follow. */
const PLAN_DOT: Record<string, string> = {
  free: '#9A9DA6',
  starter: '#2B8FD9',
  growth: '#5B5CE2',
  scale: '#7C3AED',
};

interface Row {
  key: string;
  label: string;
  hint?: string;
  value: (p: Plan) => React.ReactNode;
}
interface Group {
  title: string;
  rows: Row[];
}

/** One cell for a numeric limit: a number, "Unlimited", or a dash when the plan data carries no limit. */
function Limit({ v }: { v: number | undefined }) {
  if (v === undefined) return <span className="text-faint">—</span>;
  if (v < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-medium text-primary-hover">
        <InfinityIcon size={13} aria-hidden /> Unlimited
      </span>
    );
  return <span className="tabular-nums font-medium text-ink">{v.toLocaleString()}</span>;
}

const NotMetered = () => (
  <span className="inline-flex items-center rounded-full bg-wash-2 px-2 py-0.5 text-[12px] text-muted">
    Not metered yet
  </span>
);

function Hint({ id, text }: { id: string; text: string }) {
  return (
    <span className="group/hint relative inline-flex">
      <button
        type="button"
        aria-describedby={id}
        aria-label="More information"
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border-none bg-transparent p-0 text-faint hover:text-ink focus-visible:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <Info size={13} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-6 top-1/2 z-30 w-56 -translate-y-1/2 rounded-lg border border-line bg-white p-2 text-[12px] font-normal leading-snug text-muted opacity-0 shadow-popover transition-opacity duration-150 group-focus-within/hint:visible group-focus-within/hint:opacity-100 group-hover/hint:visible group-hover/hint:opacity-100 motion-reduce:transition-none"
      >
        {text}
      </span>
    </span>
  );
}

/**
 * The plan comparison table. Every value comes from the plans the API returns (limits, prices); the only fixed text is
 * labels and grouping. Plan headers stick while the table scrolls, the feature column sticks while it scrolls sideways.
 */
export function ComparePlans({
  plans,
  currentKey,
  interval,
}: {
  plans: Plan[];
  currentKey: string;
  interval: Interval;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, plans.length]);

  const limit = (m: UsageMetric): Row => ({
    key: m,
    label: USAGE_LABEL[m],
    value: (p) => <Limit v={p.limits[m]} />,
  });
  const priceOf = (p: Plan) => (interval === 'YEAR' ? p.yearlyMinor : p.monthlyMinor);
  const groups: Group[] = [
    { title: 'Team & channels', rows: [limit('members'), limit('channels')] },
    {
      title: 'Customer capacity',
      rows: [{ ...limit('contacts'), hint: 'People saved in your workspace’s contacts.' }],
    },
    {
      title: 'Messaging & usage',
      rows: [
        limit('messages'),
        { ...limit('whatsapp'), hint: 'Counted per month on this channel.' },
        { ...limit('instagram'), hint: 'Counted per month on this channel.' },
        { ...limit('messenger'), hint: 'Counted per month on this channel.' },
      ],
    },
    {
      title: 'AI capabilities',
      rows: [
        {
          key: 'ai',
          label: 'AI credits',
          hint: 'AI usage isn’t limited or counted on any plan today.',
          value: () => <NotMetered />,
        },
      ],
    },
    {
      title: 'Pricing',
      rows: [
        {
          key: 'price',
          label: `Price (${interval === 'YEAR' ? 'yearly' : 'monthly'})`,
          value: (p) => (
            <span className="text-[16px] font-semibold tabular-nums text-ink">
              {money(priceOf(p), p.currency)}
            </span>
          ),
        },
      ],
    },
  ];

  const colBg = (key: string) => (hot === key ? 'bg-primary-soft/60' : '');

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        tabIndex={0}
        role="region"
        aria-label="Plan comparison table"
        className="max-h-[640px] overflow-auto rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 w-[34%] min-w-[170px] border-b border-line bg-white py-3 pr-3 text-left text-xs font-medium text-faint"
              >
                Feature
              </th>
              {plans.map((p) => {
                const current = p.key === currentKey;
                return (
                  <th
                    key={p.key}
                    scope="col"
                    onMouseEnter={() => setHot(p.key)}
                    onMouseLeave={() => setHot(null)}
                    className={cn(
                      'sticky top-0 z-10 min-w-[120px] border-b px-3 py-3 text-left align-bottom transition-colors duration-150 motion-reduce:transition-none',
                      current ? 'border-primary' : 'border-line',
                      hot === p.key ? 'bg-[#F7F7FF]' : 'bg-white',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PLAN_DOT[p.key] ?? '#9A9DA6' }}
                      />
                      <span
                        className={cn(
                          'text-[14px] font-semibold',
                          current ? 'text-primary-hover' : 'text-ink',
                        )}
                      >
                        {p.name}
                      </span>
                    </span>
                    <span className="mt-1 flex min-h-[18px] flex-wrap gap-1">
                      {current && (
                        <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10.5px] font-medium text-primary-hover">
                          Current
                        </span>
                      )}
                      {p.recommended && (
                        <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10.5px] font-medium text-success">
                          Recommended
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th
                  scope="colgroup"
                  className="sticky left-0 z-[5] whitespace-nowrap border-b border-line-subtle bg-wash py-1.5 pl-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-faint"
                >
                  {g.title}
                </th>
                <td
                  colSpan={plans.length}
                  aria-hidden
                  className="border-b border-line-subtle bg-wash"
                />
              </tr>
              {g.rows.map((r) => {
                const price = r.key === 'price';
                return (
                  <tr key={r.key} className="group/row">
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-[5] border-b border-line-subtle bg-white py-3 pr-3 text-left font-normal text-muted group-hover/row:bg-wash',
                        price && 'font-medium text-ink',
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {r.label}
                        {r.hint && <Hint id={`hint-${r.key}`} text={r.hint} />}
                      </span>
                    </th>
                    {plans.map((p) => (
                      <td
                        key={p.key}
                        onMouseEnter={() => setHot(p.key)}
                        onMouseLeave={() => setHot(null)}
                        className={cn(
                          'border-b border-line-subtle px-3 py-3 transition-colors duration-150 group-hover/row:bg-wash motion-reduce:transition-none',
                          colBg(p.key),
                          price && 'bg-[#FAFAFF]',
                        )}
                      >
                        {r.value(p)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {more && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l from-white to-transparent"
          />
          <p className="m-0 mt-2 flex items-center justify-end gap-0.5 text-xs text-faint">
            Scroll for more plans <ChevronRight size={13} aria-hidden />
          </p>
        </>
      )}
    </div>
  );
}
