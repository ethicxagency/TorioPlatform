'use client';

import { PERMISSION_GROUPS } from '@torio/types';
import { Check, ChevronDown, Copy, Minus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useRole, useRoleMutations, useRoles } from '../queries';
import type { Member, Role, RoleItem } from '../types';
import { DeleteRoleDialog, RoleDetailDialog } from './role-detail';
import { RoleBuilder } from './role-builder';
import { PERMISSION_TOTAL, RoleMark, groupCounts, ownerOnly } from './role-parts';

type Open =
  | { kind: 'detail'; id: string }
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | { kind: 'delete'; id: string }
  | null;

const summaryOf = (r: RoleItem) =>
  groupCounts(r.permissions)
    .filter((g) => g.granted > 0)
    .sort((a, b) => b.granted / b.total - a.granted / a.total)
    .slice(0, 3);

export function RolesTab({
  people,
  meId,
  actorRole,
  canManageRoles,
  canAssign,
}: {
  people: Member[];
  meId: string;
  actorRole: Role;
  canManageRoles: boolean;
  canAssign: boolean;
}) {
  const { workspaceId: ws, permissions } = useWorkspace();
  const roles = useRoles(ws);
  const mut = useRoleMutations(ws);
  const [open, setOpen] = useState<Open>(null);
  const [formError, setFormError] = useState('');
  const mine = useMemo(() => new Set(permissions ?? []), [permissions]);
  const list = roles.data ?? [];
  const current = open && 'id' in open ? list.find((r) => r.id === open.id) : undefined;
  const editing = useRole(ws, open?.kind === 'edit' ? open.id : null);
  const close = () => {
    setOpen(null);
    setFormError('');
  };
  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[560px] text-[13px] leading-[1.55] text-muted">
          Manage what each team member can access and do in your workspace. Permissions are checked
          by the server on every request.
        </p>
        <Button
          disabled={!canManageRoles}
          title={canManageRoles ? undefined : 'Only the workspace owner can create roles'}
          onClick={() => setOpen({ kind: 'create' })}
        >
          <Plus size={14} aria-hidden /> Create custom role
        </Button>
      </div>

      {roles.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading roles"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[168px] w-full rounded-card" />
          ))}
        </div>
      ) : roles.isError && !roles.data ? (
        <div
          role="alert"
          className="rounded-card border border-line bg-white px-6 py-12 text-center"
        >
          <div className="text-sm font-semibold">Couldn&apos;t load roles</div>
          <div className="mb-3.5 mt-1 text-[13px] text-muted">{roles.error.message}</div>
          <Button variant="outline" size="sm" onClick={() => roles.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <ul
            className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Roles"
          >
            {list.map((r) => (
              <li key={r.id}>
                <article
                  className="flex h-full flex-col gap-3 rounded-card border border-line bg-white p-4 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none"
                  aria-label={r.name}
                >
                  <div className="flex items-start gap-3">
                    <RoleMark role={r} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="m-0 truncate text-[14.5px] font-semibold text-ink">
                          {r.name}
                        </h3>
                        <span className="shrink-0 rounded-md bg-wash-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                          {r.kind === 'SYSTEM' ? (r.id === 'OWNER' ? 'Fixed' : 'System') : 'Custom'}
                        </span>
                      </div>
                      <p className="m-0 mt-1 line-clamp-2 text-xs leading-[1.5] text-muted">
                        {r.description ?? 'No description.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={13} aria-hidden />
                      <span className="tabular-nums">
                        {r.memberCount} member{r.memberCount === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {r.id === 'OWNER'
                        ? 'All permissions'
                        : `${r.permissions.length} of ${PERMISSION_TOTAL} permissions`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summaryOf(r).map((g) => (
                      <span
                        key={g.key}
                        className="rounded-md bg-primary-soft/70 px-1.5 py-0.5 text-[11px] font-medium text-primary-hover"
                      >
                        {g.label}
                        {g.granted < g.total ? ` ${g.granted}/${g.total}` : ''}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpen({ kind: 'detail', id: r.id })}
                    >
                      View details
                    </Button>
                    {r.kind === 'CUSTOM' && canManageRoles && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${r.name}`}
                          onClick={() => setOpen({ kind: 'edit', id: r.id })}
                        >
                          <Pencil size={14} aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Duplicate ${r.name}`}
                          loading={mut.duplicate.isPending && mut.duplicate.variables === r.id}
                          onClick={() =>
                            mut.duplicate.mutate(r.id, {
                              onSuccess: (d) => toast(`Created “${d.name}”`),
                              onError: (e) => toast.error(message(e)),
                            })
                          }
                        >
                          <Copy size={14} aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${r.name}`}
                          onClick={() => setOpen({ kind: 'delete', id: r.id })}
                        >
                          <Trash2 size={14} aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {list.every((r) => r.kind === 'SYSTEM') && (
            <div className="rounded-card border border-dashed border-line bg-white px-5 py-6 text-center">
              <div className="text-[14px] font-semibold">No custom roles yet</div>
              <p className="m-0 mx-auto mt-1 max-w-[420px] text-[13px] text-muted">
                Start from a template such as Customer Support or Sales Manager, then adjust it, to
                give people exactly the access they need.
              </p>
              {canManageRoles && (
                <Button className="mt-3" size="sm" onClick={() => setOpen({ kind: 'create' })}>
                  <Plus size={14} aria-hidden /> Create custom role
                </Button>
              )}
            </div>
          )}
          <PermissionMatrix roles={list} />
        </>
      )}

      {open?.kind === 'detail' && current && (
        <RoleDetailDialog
          role={current}
          people={people}
          meId={meId}
          actorRole={actorRole}
          canManageRoles={canManageRoles}
          canAssign={canAssign}
          onClose={close}
          onEdit={() => setOpen({ kind: 'edit', id: current.id })}
          onDelete={() => setOpen({ kind: 'delete', id: current.id })}
          onDuplicate={() =>
            mut.duplicate.mutate(current.id, {
              onSuccess: (d) => {
                toast(`Created “${d.name}”`);
                close();
              },
              onError: (e) => toast.error(message(e)),
            })
          }
        />
      )}
      {open?.kind === 'create' && (
        <RoleBuilder
          mine={mine}
          busy={mut.create.isPending}
          error={formError}
          onClose={close}
          onSave={(v) => {
            setFormError('');
            mut.create.mutate(v, {
              onSuccess: (d) => {
                toast(`Role “${d.name}” created`);
                close();
              },
              onError: (e) => setFormError(message(e)),
            });
          }}
        />
      )}
      {open?.kind === 'edit' && editing.data && (
        <RoleBuilder
          role={editing.data}
          mine={mine}
          busy={mut.update.isPending}
          error={formError}
          onClose={close}
          onSave={(v) => {
            setFormError('');
            mut.update.mutate(
              {
                id: editing.data.id,
                body: { name: v.name, description: v.description, permissions: v.permissions },
              },
              {
                onSuccess: (d) => {
                  toast(
                    d.affectedMembers > 0
                      ? `Role saved. ${d.affectedMembers} member${d.affectedMembers === 1 ? '' : 's'} lost some access.`
                      : 'Role saved',
                  );
                  close();
                },
                onError: (e) => setFormError(message(e)),
              },
            );
          }}
        />
      )}
      {open?.kind === 'delete' && current && (
        <DeleteRoleDialog
          role={current}
          busy={mut.remove.isPending}
          error={formError}
          others={[
            ...(actorRole === 'OWNER' ? [{ value: 'ADMIN', label: 'Admin' }] : []),
            { value: 'AGENT', label: 'Agent' },
            ...list
              .filter(
                (r) =>
                  r.kind === 'CUSTOM' &&
                  r.id !== current.id &&
                  r.permissions.every((p) => mine.has(p)),
              )
              .map((r) => ({ value: r.id, label: r.name })),
          ]}
          onClose={close}
          onConfirm={(reassignTo) => {
            setFormError('');
            mut.remove.mutate(
              { id: current.id, reassignTo },
              {
                onSuccess: () => {
                  toast(`Role “${current.name}” deleted`);
                  close();
                },
                onError: (e) => setFormError(message(e)),
              },
            );
          }}
        />
      )}
    </div>
  );
}

/** Every permission against every role, grouped and collapsible: green check for allowed, a quiet dash for not. */
function PermissionMatrix({ roles }: { roles: RoleItem[] }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const sets = roles.map((r) => new Set(r.permissions));
  return (
    <section aria-labelledby="matrix-h" className="flex flex-col gap-2">
      <h2 id="matrix-h" className="m-0 text-[14px] font-semibold text-ink">
        Permission overview
      </h2>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <caption className="sr-only">What each role can do</caption>
          <thead className="border-b border-line-subtle bg-[#FBFBFC]">
            <tr>
              <th
                scope="col"
                className="px-4 py-2.5 text-left text-[11.5px] font-medium text-faint"
              >
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r.id}
                  scope="col"
                  className="max-w-[110px] truncate px-3 py-2.5 text-center text-[11.5px] font-medium text-faint"
                  title={r.name}
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((g) => {
            const shut = closed.has(g.key);
            return (
              <tbody key={g.key} className="border-b border-line-subtle last:border-0">
                <tr className="bg-wash/60">
                  <th scope="rowgroup" colSpan={roles.length + 1} className="p-0 text-left">
                    <button
                      type="button"
                      aria-expanded={!shut}
                      onClick={() =>
                        setClosed((s) => {
                          const n = new Set(s);
                          if (n.has(g.key)) n.delete(g.key);
                          else n.add(g.key);
                          return n;
                        })
                      }
                      className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-2 text-left text-[12.5px] font-semibold text-ink"
                    >
                      <ChevronDown
                        size={14}
                        aria-hidden
                        className={cn(
                          'text-faint transition-transform duration-150',
                          shut && '-rotate-90',
                        )}
                      />
                      {g.label}
                    </button>
                  </th>
                </tr>
                {!shut &&
                  g.permissions.map((p) => (
                    <tr key={p.key} className="border-t border-line-subtle">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <span className="block text-ink" title={p.description}>
                          {p.label}
                        </span>
                        {ownerOnly(p.key) && (
                          <span className="text-[11px] text-faint">Owner only</span>
                        )}
                      </th>
                      {sets.map((s, i) => (
                        <td key={roles[i]!.id} className="px-3 py-2 text-center">
                          {s.has(p.key) ? (
                            <Check
                              size={15}
                              aria-label="Allowed"
                              className="mx-auto text-success"
                            />
                          ) : (
                            <Minus
                              size={15}
                              aria-label="Not allowed"
                              className="mx-auto text-faint"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
