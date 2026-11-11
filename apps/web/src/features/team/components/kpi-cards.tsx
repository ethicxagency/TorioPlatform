'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { TeamSummary } from '../types';

export function TeamKpis({
  summary: s,
  loading,
  error,
  onRetry,
  canSeeInvites,
}: {
  summary: TeamSummary | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  canSeeInvites: boolean;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load team metrics.
        <button type="button" onClick={onRetry} className="cursor-pointer font-semibold underline">
          Try again
        </button>
      </div>
    );
  const cards = [
    {
      label: 'Total members',
      value: s?.totalMembers,
      // Only worth saying when someone actually is suspended.
      sub: s && s.suspendedMembers > 0 ? `${s.suspendedMembers} suspended` : undefined,
    },
    { label: 'Active members', value: s?.activeMembers },
    // Invitations are visible to admins only; other roles simply don't get this card.
    ...(canSeeInvites ? [{ label: 'Pending invitations', value: s?.pendingInvitations }] : []),
    { label: 'Unassigned conversations', value: s?.unassignedOpenConversations },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:odd:col-span-2"
        >
          <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
          {loading ? (
            <>
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24 bg-wash-2" />
            </>
          ) : (
            <>
              <div className="mt-1 text-2xl font-metric">{c.value}</div>
              {'sub' in c && c.sub && (
                <div className="mt-1 truncate text-xs text-faint">{c.sub}</div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
