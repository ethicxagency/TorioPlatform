'use client';

import { UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { useNow } from '@/features/inbox/use-now';
import { useDebounced } from '@/features/leads/use-debounced';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import {
  useInvitations,
  useTeamMembers,
  useTeamMutations,
  useTeams,
  useTeamSummary,
} from '../queries';
import { EMPTY_MEMBER_FILTERS, type Member, type MemberFilters, type Role } from '../types';
import { InvitationsTab } from './invitations-tab';
import { InviteDialog } from './invite-dialog';
import { TeamKpis } from './kpi-cards';
import { MemberDrawer } from './member-drawer';
import { MembersTab } from './members-tab';
import { RolesTab } from './roles-tab';
import { TeamsTab } from './teams-tab';

type Tab = 'members' | 'teams' | 'invitations' | 'roles';
const PAGE_SIZE = 25;

export function TeamPage() {
  const { toast } = useShell();
  const { user } = useAuth();
  const now = useNow();
  const { workspaceId: ws, role, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const canManage = can('members:manage');
  const [tab, setTab] = useState<Tab>('members');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);

  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);
  const members = useTeamMembers(ws, {
    filters: effective,
    sort: 'createdAt',
    page,
    pageSize: PAGE_SIZE,
  });
  const everyone = useTeamMembers(ws, {
    filters: EMPTY_MEMBER_FILTERS,
    sort: 'name',
    page: 1,
    pageSize: 100,
  });
  const summary = useTeamSummary(ws);
  const teams = useTeams(ws);
  const invitations = useInvitations(ws, canManage);
  const mut = useTeamMutations(ws);

  if (wsLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (wsError || !ws || !role)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('members:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Team in this workspace.
      </div>
    );

  const state = members.isPending
    ? 'loading'
    : members.isError && !members.data
      ? 'error'
      : 'ready';
  const filtered = !!q || !!filters.role || !!filters.status || !!filters.team;
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'members', label: 'Members', show: true },
    { key: 'teams', label: 'Teams', show: true },
    {
      key: 'invitations',
      label: `Invitations${summary.data && canManage ? ` (${summary.data.pendingInvitations})` : ''}`,
      show: canManage,
    },
    { key: 'roles', label: 'Roles & permissions', show: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-faint">
            Settings / <span className="text-muted">Teams</span>
          </nav>
          <h1 className="m-0 font-page-title">Teams</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            Manage your workspace members, access, and team workload.
          </p>
        </div>
        <Button
          disabled={!canManage}
          onClick={() => setInviting(true)}
          title={canManage ? undefined : 'Only admins and owners can invite members'}
        >
          <UserPlus size={14} />
          Invite Member
        </Button>
      </header>

      <TeamKpis
        summary={summary.data}
        loading={summary.isPending}
        error={summary.isError && !summary.data}
        onRetry={() => summary.refetch()}
        canSeeInvites={canManage}
      />

      <div role="tablist" aria-label="Team sections" className="flex gap-1 border-b border-line">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px cursor-pointer border-b-2 px-3 py-2 text-[13px] font-medium',
                tab === t.key
                  ? 'border-primary text-primary-hover'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'members' && (
        <MembersTab
          members={members.data?.data ?? []}
          total={members.data?.meta.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          state={state}
          errorMessage={members.error?.message}
          fetching={members.isFetching && !members.isPending}
          filters={filters}
          search={search}
          teams={teams.data ?? []}
          activeId={open?.id ?? null}
          meId={user?.id ?? ''}
          now={now}
          filtered={filtered}
          canManage={canManage}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onFilters={(p) => {
            setFilters((f) => ({ ...f, ...p }));
            setPage(1);
          }}
          onClear={() => {
            setFilters(EMPTY_MEMBER_FILTERS);
            setSearch('');
            setPage(1);
          }}
          onPage={setPage}
          onOpen={setOpen}
          onRetry={() => members.refetch()}
          onInvite={() => setInviting(true)}
        />
      )}
      {tab === 'teams' && (
        <TeamsTab
          ws={ws}
          teams={teams.data}
          people={everyone.data?.data.filter((m) => m.status === 'ACTIVE') ?? []}
          loading={teams.isPending}
          error={teams.error?.message}
          onRetry={() => teams.refetch()}
          canManage={canManage}
        />
      )}
      {tab === 'invitations' && canManage && (
        <InvitationsTab
          ws={ws}
          actorRole={role as Role}
          invitations={invitations.data}
          loading={invitations.isPending}
          error={invitations.error?.message}
          onRetry={() => invitations.refetch()}
          onInvite={() => setInviting(true)}
        />
      )}
      {tab === 'roles' && <RolesTab />}

      {open && (
        <MemberDrawer
          member={open}
          meId={user?.id ?? ''}
          actorRole={role as Role}
          canAudit={can('audit:read')}
          onClose={() => setOpen(null)}
        />
      )}
      {inviting && (
        <InviteDialog
          actorRole={role as Role}
          teams={teams.data ?? []}
          onClose={() => setInviting(false)}
          onInvite={async (v) => {
            const r = await mut.invite.mutateAsync(v);
            toast('Invitation created');
            return r;
          }}
        />
      )}
    </div>
  );
}
