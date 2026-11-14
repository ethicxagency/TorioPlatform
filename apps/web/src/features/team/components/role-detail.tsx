'use client';

import { PERMISSION_GROUPS, ROLE_TEMPLATES, canManageMember } from '@torio/types';
import { Check, Copy, Minus, Pencil, Trash2, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { Modal } from '@/features/leads/components/modal';
import { useNow } from '@/features/inbox/use-now';
import { useWorkspace } from '@/lib/workspace';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useRole, useTeamMutations } from '../queries';
import type { Member, Role, RoleItem } from '../types';
import { OwnerOnlyBadge, RoleMark, ownerOnly } from './role-parts';

export function RoleDetailDialog({
  role,
  people,
  meId,
  actorRole,
  canManageRoles,
  canAssign,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  role: RoleItem;
  people: Member[];
  meId: string;
  actorRole: Role;
  canManageRoles: boolean;
  canAssign: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { workspaceId: ws, permissions } = useWorkspace();
  const detail = useRole(ws, role.id);
  const mut = useTeamMutations(ws);
  const now = useNow();
  const [pick, setPick] = useState('');
  const custom = role.kind === 'CUSTOM';
  const have = new Set(role.permissions);
  const inRole = new Set((detail.data?.members ?? []).map((m) => m.id));
  const mine = new Set(permissions ?? []);
  // Only people this person may manage, and only with a role whose permissions they hold themselves.
  const beyond = custom && role.permissions.some((p) => !mine.has(p));
  const assignable = people.filter(
    (m) =>
      m.status === 'ACTIVE' &&
      m.userId !== meId &&
      !inRole.has(m.id) &&
      m.role !== 'OWNER' &&
      canManageMember(actorRole, m.role),
  );
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');

  return (
    <Modal
      title={role.name}
      description={custom ? 'Custom role' : 'System role'}
      onClose={onClose}
      className="sm:max-w-[640px]"
      footer={
        custom && canManageRoles ? (
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={onDelete}>
              <Trash2 size={14} aria-hidden /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onDuplicate}>
                <Copy size={14} aria-hidden /> Duplicate
              </Button>
              <Button onClick={onEdit}>
                <Pencil size={14} aria-hidden /> Edit role
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <RoleMark role={role} size={40} />
          <div className="min-w-0">
            <p className="m-0 text-[13px] leading-[1.55] text-muted">
              {role.description ?? 'No description.'}
            </p>
            <dl className="m-0 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
              {custom && (
                <div className="flex gap-1">
                  <dt>Template</dt>
                  <dd className="m-0 font-medium text-muted">
                    {ROLE_TEMPLATES.find((t) => t.key === role.templateKey)?.label ??
                      'Custom setup'}
                  </dd>
                </div>
              )}
              {role.updatedAt && (
                <div className="flex gap-1">
                  <dt>Updated</dt>
                  <dd className="m-0 font-medium text-muted">
                    {fmtAgo(role.updatedAt, now)} ago
                    {role.updatedBy ? ` by ${role.updatedBy.name}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <section aria-labelledby="rd-members">
          <h3
            id="rd-members"
            className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint"
          >
            Members ({role.memberCount})
          </h3>
          {detail.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : detail.data && detail.data.members.length > 0 ? (
            <ul className="m-0 list-none rounded-xl border border-line p-0">
              {detail.data.members.map((m) => {
                const mem = people.find((p) => p.id === m.id);
                const canRemove =
                  custom &&
                  canAssign &&
                  m.userId !== meId &&
                  mem &&
                  canManageMember(actorRole, mem.role);
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-2.5 border-b border-line-subtle px-3 py-2 last:border-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10.5px] font-semibold text-primary-hover">
                      {initialsOf(m.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-faint">{m.email}</span>
                    </span>
                    {canRemove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${m.name} from this role`}
                        loading={
                          mut.updateMember.isPending && mut.updateMember.variables?.id === m.id
                        }
                        onClick={() =>
                          mut.updateMember.mutate(
                            { id: m.id, body: { role: 'AGENT' } },
                            {
                              onSuccess: () => toast(`${m.name} is now an Agent`),
                              onError: err,
                            },
                          )
                        }
                      >
                        <UserMinus size={14} aria-hidden /> Remove
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">No one has this role yet.</p>
          )}
          {custom && canAssign && !beyond && assignable.length > 0 && (
            <div className="mt-3 flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">
                Assign a member
                <FieldSelect
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="h-9 w-full"
                >
                  <option value="">Choose a member…</option>
                  {assignable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.customRole?.name ?? (m.role === 'ADMIN' ? 'Admin' : 'Agent')})
                    </option>
                  ))}
                </FieldSelect>
              </label>
              <Button
                disabled={!pick}
                loading={mut.updateMember.isPending && mut.updateMember.variables?.id === pick}
                onClick={() =>
                  mut.updateMember.mutate(
                    { id: pick, body: { customRoleId: role.id } },
                    {
                      onSuccess: () => {
                        toast('Role assigned');
                        setPick('');
                      },
                      onError: err,
                    },
                  )
                }
              >
                Assign
              </Button>
            </div>
          )}
          {custom && canAssign && beyond && (
            <p className="m-0 mt-2 text-xs text-muted">
              This role includes permissions you do not have, so you cannot assign it.
            </p>
          )}
        </section>

        <section aria-labelledby="rd-perms">
          <h3
            id="rd-perms"
            className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint"
          >
            Permissions
          </h3>
          <div className="flex flex-col gap-3">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.key}>
                <div className="mb-1 text-[12.5px] font-semibold text-ink">{g.label}</div>
                <ul className="m-0 grid list-none gap-x-4 gap-y-1 p-0 sm:grid-cols-2">
                  {g.permissions.map((p) => {
                    const on = have.has(p.key);
                    return (
                      <li
                        key={p.key}
                        className={cn(
                          'flex items-center gap-2 text-[12.5px]',
                          on ? 'text-ink' : 'text-faint',
                        )}
                      >
                        {on ? (
                          <Check size={13} aria-label="Allowed" className="shrink-0 text-success" />
                        ) : (
                          <Minus size={13} aria-label="Not allowed" className="shrink-0" />
                        )}
                        <span className="truncate" title={p.description}>
                          {p.label}
                        </span>
                        {ownerOnly(p.key) && !on && <OwnerOnlyBadge />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

export function DeleteRoleDialog({
  role,
  others,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  role: RoleItem;
  /** Roles the members can move to: Admin, Agent and the other custom roles this person may give. */
  others: { value: string; label: string }[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (reassignTo?: string) => void;
}) {
  const [to, setTo] = useState('');
  const needs = role.memberCount > 0;
  return (
    <Modal
      title={`Delete “${role.name}”?`}
      onClose={onClose}
      className="sm:max-w-[460px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            disabled={needs && !to}
            onClick={() => onConfirm(needs ? to : undefined)}
          >
            {needs ? 'Reassign and delete' : 'Delete role'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-muted">
        {needs ? (
          <>
            <p className="m-0">
              <strong className="text-ink">
                {role.memberCount} member{role.memberCount === 1 ? '' : 's'}
              </strong>{' '}
              currently {role.memberCount === 1 ? 'has' : 'have'} this role. Choose the role they
              move to; they get that role&apos;s access right away.
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Move members to
              <FieldSelect
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-full"
              >
                <option value="">Choose a role…</option>
                {others.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FieldSelect>
            </label>
          </>
        ) : (
          <p className="m-0">No one has this role. It will be deleted and cannot be restored.</p>
        )}
        {error && (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
