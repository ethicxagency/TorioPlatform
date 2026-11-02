'use client';

import { formatRange, type DateRange } from '@torio/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Analytics } from '../analytics-queries';

export function AnalyticsSection({
  data,
  loading,
  error,
  fetching,
  range,
  onRetry,
}: {
  data: Analytics | undefined;
  loading: boolean;
  error: string | null;
  fetching: boolean;
  range: DateRange;
  /** Accepted for layout parity with other sections. */
  mobile?: boolean;
  onRetry: () => void;
}) {
  if (error && !data)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load analytics for {formatRange(range)}. {error}
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );
  const d = data;
  const dim = fetching && !loading ? 'opacity-70' : '';

  return (
    <section
      aria-label="Business analytics"
      aria-busy={fetching}
      className={cn('flex flex-col gap-3 transition-opacity motion-reduce:transition-none', dim)}
    >
      <section
        aria-label="Recent activity"
        className="rounded-card border border-line bg-white p-4"
      >
        <h3 className="m-0 mb-2 text-[13.5px] font-semibold">Recent activity in this range</h3>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : d && d.activity.length > 0 ? (
          <ul className="m-0 list-none divide-y divide-line-subtle p-0">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate">{a.title}</span>
                <time dateTime={a.at} className="shrink-0 text-xs text-faint">
                  {new Date(a.at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: d.timeZone,
                  })}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
            No activity in this range.
          </div>
        )}
      </section>
    </section>
  );
}
