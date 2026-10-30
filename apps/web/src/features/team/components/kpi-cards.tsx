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
      sub: s ? `${s.suspendedMembers} suspended` : '',
    },
    { label: 'Active members', value: s?.activeMembers, sub: 'Accounts with access' },
    {
      label: 'Pending invitations',
      value: canSeeInvites ? s?.pendingInvitations : undefined,
      sub: canSeeInvites ? 'Not yet accepted' : 'Admins only',
      hide: !canSeeInvites,
    },
    {
      label: 'Unassigned conversations',
      value: s?.unassignedOpenConversations,
      sub: 'Open, no assignee',
    },
    { label: 'Online agents', unavailable: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-0 rounded-card border border-line bg-white p-3.5 max-sm:last:col-span-2"
        >
          <div className="truncate text-[12.5px] font-medium text-muted">{c.label}</div>
          {c.unavailable ? (
            <>
              <div className="mt-1 text-2xl font-semibold text-faint">—</div>
              <div className="mt-1 text-xs text-faint">Presence isn&apos;t tracked yet</div>
            </>
          ) : c.hide ? (
            <>
              <div className="mt-1 text-2xl font-semibold text-faint">—</div>
              <div className="mt-1 text-xs text-faint">{c.sub}</div>
            </>
          ) : loading ? (
            <>
              <Skeleton className="mt-2 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24 bg-wash-2" />
            </>
          ) : (
            <>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em]">
                {c.value ?? '—'}
              </div>
              <div className="mt-1 truncate text-xs text-faint">{c.sub}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
