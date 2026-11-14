'use client';

import { Select } from '@/components/ui/select';
import { ListFilter, Search, X } from 'lucide-react';
import { ActionMenu } from '@/components/ui/menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { Pagination } from '@/components/ui/pagination';
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
  onPageSize?: (size: number) => void;
  onOpen: (m: Member) => void;
  onRetry: () => void;
  onInvite: () => void;
  canManage: boolean;
}

const th = 'px-3 py-2.5 text-left text-[12px] font-semibold text-muted whitespace-nowrap';

export function MembersTab(p: Props) {
  const teamName = p.teams.find((t) => t.id === p.filters.team)?.name;
  const chips = [
    p.search.trim() && { key: 'q', label: `“${p.search.trim()}”`, clear: () => p.onSearch('') },
    p.filters.role && {
      key: 'role',
      label: ROLE_INFO[p.filters.role].label,
      clear: () => p.onFilters({ role: '' }),
    },
    p.filters.status && {
      key: 'status',
      label: p.filters.status === 'ACTIVE' ? 'Active' : 'Suspended',
      clear: () => p.onFilters({ status: '' }),
    },
    p.filters.team && {
      key: 'team',
      label: teamName ?? 'Team',
      clear: () => p.onFilters({ team: '' }),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const none = p.search.trim()
    ? `No members match “${p.search.trim()}”`
    : p.filters.role
      ? `No ${ROLE_INFO[p.filters.role].label.toLowerCase()} members`
      : p.filters.status
        ? `No ${p.filters.status === 'ACTIVE' ? 'active' : 'suspended'} members`
        : p.filters.team
          ? 'No members in this team'
          : 'No members match your filters';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter members">
        <label className="flex h-10 min-w-[220px] flex-[1_1_260px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-3 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 hover:border-line-input sm:max-w-[480px]">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search members"
            placeholder="Search name or email"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none"
          />
          {p.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => p.onSearch('')}
              className="cursor-pointer text-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <Select
          aria-label="Filter by role"
          value={p.filters.role}
          onChange={(v) => p.onFilters({ role: v as MemberFilters['role'] })}
          options={[
            { value: '', label: 'All roles' },
            ...(Object.keys(ROLE_INFO) as (keyof typeof ROLE_INFO)[]).map((r) => ({
              value: r,
              label: ROLE_INFO[r].label,
            })),
          ]}
          className="h-10 w-[190px] max-sm:w-full"
          icon={<ListFilter size={14} />}
        />
        <Select
          aria-label="Filter by status"
          value={p.filters.status}
          onChange={(v) => p.onFilters({ status: v as MemberFilters['status'] })}
          options={[
            { value: '', label: 'Any status' },
            { value: 'ACTIVE', label: 'Active', dot: 'ok' },
            { value: 'SUSPENDED', label: 'Suspended', dot: 'warn' },
          ]}
          className="h-10 w-[170px] max-sm:w-full"
        />
        {p.teams.length > 0 && (
          <Select
            aria-label="Filter by team"
            value={p.filters.team}
            onChange={(v) => p.onFilters({ team: v })}
            options={[
              { value: '', label: 'All teams' },
              ...p.teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            className="h-10 w-[180px] max-sm:w-full"
          />
        )}
        {p.filtered && (
          <button
            type="button"
            onClick={p.onClear}
            className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] border-none bg-transparent px-2 text-[13px] font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
          >
            Clear
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft pl-2.5 pr-1 text-xs font-medium text-primary-hover"
            >
              {c.label}
              <button
                type="button"
                aria-label={`Remove filter ${c.label}`}
                onClick={c.clear}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-primary-hover hover:bg-primary/10"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={p.onClear}
              className="ml-1 cursor-pointer border-none bg-transparent text-xs font-medium text-muted hover:text-ink"
            >
              Clear all
            </button>
          )}
        </div>
      )}

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
          <div className="text-[14.5px] font-semibold">{p.filtered ? none : 'No members yet'}</div>
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
                    Team
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={cn(th, 'max-xl:hidden')}>
                    Last active
                  </th>
                  <th scope="col" className={cn(th, 'w-12')}>
                    <span className="sr-only">Actions</span>
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
                      'cursor-pointer border-b border-line-subtle transition-colors duration-150 last:border-0 focus-visible:outline-offset-[-2px]',
                      p.activeId === m.id ? 'bg-[#F1F1FF]' : 'hover:bg-[#F7F7F9]',
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-hover">
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
                    <td className="px-3 py-3">
                      <RoleBadge role={m.role} name={m.customRole?.name} />
                    </td>
                    <td className="max-w-[180px] px-3 py-3 max-lg:hidden">
                      <span className="block truncate text-muted">
                        {m.teams.map((t) => t.name).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted max-xl:hidden">
                      {m.lastSignInAt ? `${fmtAgo(m.lastSignInAt, p.now)} ago` : 'Not yet'}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        label={`Actions for ${m.name}`}
                        items={[
                          { label: 'View details', onSelect: () => p.onOpen(m) },
                          {
                            label: 'Copy email',
                            onSelect: () => void navigator.clipboard?.writeText(m.email),
                          },
                        ]}
                      />
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
                      <RoleBadge role={m.role} name={m.customRole?.name} className="shrink-0" />
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
          <Pagination
            page={p.page}
            total={p.total}
            pageSize={p.pageSize}
            onPage={p.onPage}
            onPageSize={p.onPageSize}
          />
        </div>
      )}
    </div>
  );
}
