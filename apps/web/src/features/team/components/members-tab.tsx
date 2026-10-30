'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { cn } from '@/lib/utils';
import { ROLE_INFO, type Member, type MemberFilters, type TeamItem } from '../types';
import { RoleBadge, StatusBadge } from './role-badge';

interface Props {
  members: Member[];
  total: number;
  page: number;
  pageSize: number;
  state: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  fetching: boolean;
  filters: MemberFilters;
  search: string;
  teams: TeamItem[];
  activeId: string | null;
  meId: string;
  now: number;
  filtered: boolean;
  onSearch: (q: string) => void;
  onFilters: (p: Partial<MemberFilters>) => void;
  onClear: () => void;
  onPage: (p: number) => void;
  onOpen: (m: Member) => void;
  onRetry: () => void;
  onInvite: () => void;
  canManage: boolean;
}

const selectCls = 'h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px]';
const th = 'px-3 py-2.5 text-left text-[11.5px] font-medium text-faint whitespace-nowrap';

export function MembersTab(p: Props) {
  const from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.total, p.page * p.pageSize);
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[320px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search members"
            placeholder="Search name or email"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
          {p.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => p.onSearch('')}
              className="cursor-pointer text-faint"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <select
          aria-label="Filter by role"
          value={p.filters.role}
          onChange={(e) => p.onFilters({ role: e.target.value as MemberFilters['role'] })}
          className={selectCls}
        >
          <option value="">All roles</option>
          {(Object.keys(ROLE_INFO) as (keyof typeof ROLE_INFO)[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={p.filters.status}
          onChange={(e) => p.onFilters({ status: e.target.value as MemberFilters['status'] })}
          className={selectCls}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        {p.teams.length > 0 && (
          <select
            aria-label="Filter by team"
            value={p.filters.team}
            onChange={(e) => p.onFilters({ team: e.target.value })}
            className={selectCls}
          >
            <option value="">All teams</option>
            {p.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {p.filtered && (
          <button
            type="button"
            onClick={p.onClear}
            className="cursor-pointer text-xs font-medium text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      {p.state === 'error' ? (
        <div
          role="alert"
          className="rounded-card border border-line bg-white px-6 py-14 text-center"
        >
          <div className="text-sm font-semibold">Couldn&apos;t load members</div>
          <div className="mb-3.5 mt-1 text-[13px] text-muted">{p.errorMessage}</div>
          <Button variant="outline" size="sm" onClick={p.onRetry}>
            Try again
          </Button>
        </div>
      ) : p.state === 'loading' ? (
        <div
          className="overflow-hidden rounded-card border border-line bg-white"
          aria-busy="true"
          aria-label="Loading members"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-line-subtle px-4 py-3.5 last:border-0"
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="ml-auto h-5 w-16" />
            </div>
          ))}
        </div>
      ) : p.members.length === 0 ? (
        <div className="rounded-card border border-line bg-white px-6 py-14 text-center">
          <div className="text-[14.5px] font-semibold">
            {p.filtered ? 'No members match your filters' : 'No members'}
          </div>
          {p.filtered ? (
            <Button className="mt-3" variant="outline" size="sm" onClick={p.onClear}>
              Clear filters
            </Button>
          ) : (
            p.canManage && (
              <Button className="mt-3" size="sm" onClick={p.onInvite}>
                Invite a member
              </Button>
            )
          )}
        </div>
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-card border border-line bg-white transition-opacity',
            p.fetching && 'opacity-80',
          )}
        >
          <div className="overflow-x-auto max-md:hidden">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead className="border-b border-line-subtle bg-[#FBFBFC]">
                <tr>
                  <th scope="col" className={th}>
                    Member
                  </th>
                  <th scope="col" className={th}>
                    Role
                  </th>
                  <th scope="col" className={cn(th, 'max-lg:hidden')}>
                    Teams
                  </th>
                  <th scope="col" className={cn(th, 'max-lg:hidden')}>
                    Open assigned
                  </th>
                  <th scope="col" className={cn(th, 'max-xl:hidden')}>
                    Last sign-in
                  </th>
                  <th scope="col" className={cn(th, 'max-xl:hidden')}>
                    Joined
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.members.map((m) => (
                  <tr
                    key={m.id}
                    tabIndex={0}
                    aria-selected={p.activeId === m.id}
                    onClick={() => p.onOpen(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') p.onOpen(m);
                    }}
                    className={cn(
                      'cursor-pointer border-b border-line-subtle last:border-0 focus-visible:outline-offset-[-2px]',
                      p.activeId === m.id ? 'bg-[#F1F1FF]' : 'hover:bg-[#F7F7F9]',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                          {initialsOf(m.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {m.name}
                            {m.userId === p.meId && (
                              <span className="font-normal text-faint"> (you)</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-faint">{m.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="max-w-[180px] px-3 py-2.5 max-lg:hidden">
                      <span className="block truncate text-muted">
                        {m.teams.map((t) => t.name).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums max-lg:hidden">
                      {m.assignedOpenConversations}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted max-xl:hidden">
                      {m.lastSignInAt ? `${fmtAgo(m.lastSignInAt, p.now)} ago` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted max-xl:hidden">
                      {new Date(m.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="m-0 list-none p-0 md:hidden">
            {p.members.map((m) => (
              <li key={m.id} className="border-b border-line-subtle last:border-0">
                <button
                  type="button"
                  onClick={() => p.onOpen(m)}
                  className="flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line-subtle text-[11px] font-semibold text-muted">
                    {initialsOf(m.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <RoleBadge role={m.role} className="shrink-0" />
                    </span>
                    <span className="block truncate text-xs text-muted">{m.email}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <StatusBadge status={m.status} />
                      <span className="text-xs text-faint">
                        {m.assignedOpenConversations} open assigned
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-line-subtle bg-[#FBFBFC] px-4 py-2.5 text-xs text-muted">
            <span aria-live="polite">
              {from}–{to} of {p.total}
            </span>
            <div className="flex items-center gap-1.5">
              <span>
                Page {p.page} of {pages}
              </span>
              <button
                type="button"
                aria-label="Previous page"
                disabled={p.page <= 1}
                onClick={() => p.onPage(p.page - 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={p.page >= pages}
                onClick={() => p.onPage(p.page + 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
