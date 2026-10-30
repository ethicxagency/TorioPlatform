'use client';

import { assignableRoles, canManageMember } from '@torio/types';
import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { useWorkspace } from '@/lib/workspace';
import { useMemberActivity, useMemberDetail, useTeamMutations } from '../queries';
import { ROLE_INFO, type Member, type Role } from '../types';
import { RoleBadge, StatusBadge } from './role-badge';

interface Props {
  member: Member;
  meId: string;
  actorRole: Role;
  canAudit: boolean;
  onClose: () => void;
}

type Pending =
  | { kind: 'role'; role: 'ADMIN' | 'AGENT' }
  | { kind: 'suspend' }
  | { kind: 'restore' }
  | { kind: 'remove' }
  | null;
const heading = 'm-0 mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint';

export function MemberDrawer({ member: initial, meId, actorRole, canAudit, onClose }: Props) {
  const { toast, registerEscape } = useShell();
  const { workspaceId: ws } = useWorkspace();
  const detail = useMemberDetail(ws, initial.id);
  const m = detail.data ?? { ...initial, resolvedLast30Days: null as number | null };
  const acts = useMemberActivity(ws, initial.id, canAudit);
  const mut = useTeamMutations(ws);
  const [pending, setPending] = useState<Pending>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);

  const isSelf = m.userId === meId;
  const manageable = !isSelf && canManageMember(actorRole, m.role);
  const roles = assignableRoles(actorRole).filter((r): r is 'ADMIN' | 'AGENT' => r !== 'OWNER');
  const err = (e: unknown) => {
    setPending(null);
    toast(e instanceof Error ? e.message : 'Something went wrong');
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'remove')
      return mut.removeMember.mutate(m.id, {
        onSuccess: () => {
          toast(`${m.name} removed`);
          setPending(null);
          onClose();
        },
        onError: err,
      });
    const body =
      pending.kind === 'role'
        ? { role: pending.role }
        : { status: pending.kind === 'suspend' ? ('SUSPENDED' as const) : ('ACTIVE' as const) };
    mut.updateMember.mutate(
      { id: m.id, body },
      {
        onSuccess: () => {
          toast(
            pending.kind === 'role'
              ? 'Role updated'
              : pending.kind === 'suspend'
                ? 'Access suspended'
                : 'Access restored',
          );
          setPending(null);
        },
        onError: err,
      },
    );
  };
  const copy: Record<string, { title: string; body: string; label: string }> = {
    role: {
      title: `Change ${m.name}'s role?`,
      body:
        pending?.kind === 'role'
          ? `${ROLE_INFO[pending.role].label}: ${ROLE_INFO[pending.role].description}`
          : '',
      label: 'Change role',
    },
    suspend: {
      title: `Suspend ${m.name}?`,
      body: 'They lose access to this workspace immediately. Their assignments stay in place and you can restore access any time.',
      label: 'Suspend',
    },
    restore: {
      title: `Restore ${m.name}'s access?`,
      body: 'They regain access with their current role.',
      label: 'Restore',
    },
    remove: {
      title: `Remove ${m.name} from the workspace?`,
      body: 'They lose access, are removed from teams, and their conversations, leads and customers become unassigned. Conversation history is kept.',
      label: 'Remove',
    },
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[rgba(23,24,28,0.25)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Member: ${m.name}`}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(16,24,40,0.16)] sm:w-[460px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line-subtle text-sm font-semibold text-muted">
            {initialsOf(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-base font-semibold">
              {m.name}
              {isSelf && <span className="font-normal text-faint"> (you)</span>}
            </h2>
            <div className="truncate text-[13px] text-muted">{m.email}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <RoleBadge role={m.role} />
              <StatusBadge status={m.status} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close member details"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section aria-labelledby="mb-access">
            <h3 id="mb-access" className={heading}>
              Access
            </h3>
            {manageable ? (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Role
                <select
                  value={m.role}
                  disabled={mut.updateMember.isPending}
                  onChange={(e) =>
                    e.target.value !== m.role &&
                    setPending({ kind: 'role', role: e.target.value as 'ADMIN' | 'AGENT' })
                  }
                  className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-sm font-normal"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_INFO[r].label}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-muted">
                  {ROLE_INFO[m.role].description}
                </span>
              </label>
            ) : (
              <p className="m-0 text-[13px] text-muted">
                {ROLE_INFO[m.role].description}{' '}
                {m.role === 'OWNER'
                  ? ''
                  : isSelf
                    ? 'You can’t change your own access.'
                    : 'You don’t have permission to change this member.'}
              </p>
            )}
            {manageable && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.status === 'ACTIVE' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPending({ kind: 'suspend' })}
                  >
                    Suspend access
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPending({ kind: 'restore' })}
                  >
                    Restore access
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger"
                  onClick={() => setPending({ kind: 'remove' })}
                >
                  <Trash2 size={13} />
                  Remove from workspace
                </Button>
              </div>
            )}
          </section>

          <section aria-labelledby="mb-work" className="mt-5">
            <h3 id="mb-work" className={heading}>
              Workload
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line-subtle bg-[#FBFBFC] p-2.5">
                <div className="text-xs text-faint">Open assigned</div>
                <div className="text-lg font-semibold tabular-nums">
                  {m.assignedOpenConversations}
                </div>
              </div>
              <div className="rounded-lg border border-line-subtle bg-[#FBFBFC] p-2.5">
                <div className="text-xs text-faint">Resolved (30 days)</div>
                <div className="text-lg font-semibold tabular-nums">
                  {m.resolvedLast30Days ?? '—'}
                </div>
              </div>
            </div>
            <p className="m-0 mt-2 text-xs text-faint">
              Availability and response times aren&apos;t tracked yet. Last sign-in:{' '}
              {m.lastSignInAt ? `${fmtAgo(m.lastSignInAt)} ago` : 'not recorded'}.
            </p>
          </section>

          <section aria-labelledby="mb-teams" className="mt-5">
            <h3 id="mb-teams" className={heading}>
              Teams
            </h3>
            {m.teams.length ? (
              <div className="flex flex-wrap gap-1.5">
                {m.teams.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-primary-soft px-2.5 py-[3px] text-xs font-medium text-primary-hover"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[13px] text-muted">
                Not on any team. Manage membership from the Teams tab.
              </p>
            )}
            <p className="m-0 mt-2 text-xs text-faint">
              Joined {new Date(m.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
            </p>
          </section>

          <section aria-labelledby="mb-act" className="mt-5">
            <h3 id="mb-act" className={heading}>
              Recent activity
            </h3>
            {!canAudit ? (
              <p className="m-0 text-[13px] text-muted">
                Audit history is visible to admins and owners.
              </p>
            ) : acts.isPending ? (
              <Skeleton className="h-10" />
            ) : acts.isError ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                Couldn&apos;t load activity.
              </p>
            ) : acts.data.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No recorded changes yet.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {acts.data.map((a) => (
                  <li key={a.id} className="border-l border-line-subtle pb-3 pl-3 last:pb-0">
                    <p className="m-0 text-[13px]">{a.description}</p>
                    <div className="text-xs text-faint">
                      {a.actor ? `${a.actor.name} · ` : ''}
                      {new Date(a.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
      {pending && (
        <ConfirmDialog
          title={copy[pending.kind]!.title}
          body={copy[pending.kind]!.body}
          confirmLabel={copy[pending.kind]!.label}
          busy={mut.updateMember.isPending || mut.removeMember.isPending}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
