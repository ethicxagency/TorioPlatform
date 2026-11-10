'use client';

import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { assignableRoles } from '@torio/types';
import { useTeamMutations } from '../queries';
import type { Invitation, InvitationCreated, Role } from '../types';
import { RoleBadge } from './role-badge';
import { fmtDate } from '@/lib/datetime';

interface Props {
  ws: string | null;
  actorRole: Role;
  invitations: Invitation[] | undefined;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onInvite: () => void;
}

export function InvitationsTab({
  ws,
  actorRole,
  invitations,
  loading,
  error,
  onRetry,
  onInvite,
}: Props) {
  const { toast } = useShell();
  const mut = useTeamMutations(ws);
  const [cancel, setCancel] = useState<Invitation | null>(null);
  const [fresh, setFresh] = useState<InvitationCreated | null>(null);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');

  if (loading) return <Skeleton className="h-32 rounded-card" />;
  if (error)
    return (
      <div role="alert" className="rounded-card border border-line bg-white px-6 py-12 text-center">
        <div className="text-sm font-semibold">Couldn&apos;t load invitations</div>
        <div className="mb-3 mt-1 text-[13px] text-muted">{error}</div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (!invitations?.length)
    return (
      <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
        <div className="text-[14.5px] font-semibold">No pending invitations</div>
        <div className="mx-auto mb-3 mt-1 max-w-[320px] text-[13px] text-muted">
          Invite colleagues to share the Inbox workload.
        </div>
        <Button size="sm" onClick={onInvite}>
          Invite a member
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {fresh && (
        <div
          role="status"
          className="rounded-xl border border-primary-line bg-primary-tint p-3 text-[13px]"
        >
          <div className="mb-1.5 font-semibold">New link for {fresh.email}</div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Invitation link"
              value={fresh.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(fresh.inviteUrl)
                  .then(() => toast('Link copied'))
              }
            >
              <Copy size={13} />
              Copy
            </Button>
          </div>
          <p className="m-0 mt-1.5 text-xs text-muted">
            Shown once. Torio doesn&apos;t send email yet — share it yourself. The previous link no
            longer works.
          </p>
        </div>
      )}
      <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-white p-0">
        {invitations.map((i) => {
          const manageable = assignableRoles(actorRole).includes(i.role);
          return (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{i.email}</div>
                <div className="text-xs text-faint">
                  Invited {fmtDate(i.createdAt)}
                  {i.invitedBy ? ` by ${i.invitedBy.name}` : ''}
                  {i.team ? ` · ${i.team.name}` : ''} ·{' '}
                  {i.status === 'EXPIRED' ? 'expired' : `expires ${fmtDate(i.expiresAt)}`}
                </div>
              </div>
              <RoleBadge role={i.role} />
              <span
                className={
                  i.status === 'EXPIRED'
                    ? 'rounded-md bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger'
                    : 'rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning'
                }
              >
                {i.status === 'EXPIRED' ? 'Expired' : 'Pending'}
              </span>
              {manageable && (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.resend.isPending}
                    onClick={() =>
                      mut.resend.mutate(i.id, {
                        onSuccess: (r) => {
                          setFresh(r);
                          toast('New link generated');
                        },
                        onError: err,
                      })
                    }
                  >
                    <RefreshCw size={13} />
                    Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger"
                    onClick={() => setCancel(i)}
                    aria-label={`Cancel invitation for ${i.email}`}
                  >
                    <Trash2 size={13} />
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {cancel && (
        <ConfirmDialog
          title={`Cancel invitation for ${cancel.email}?`}
          body="Their link stops working immediately. You can invite them again later."
          confirmLabel="Cancel invitation"
          busy={mut.revoke.isPending}
          onCancel={() => setCancel(null)}
          onConfirm={() =>
            mut.revoke.mutate(cancel.id, {
              onSuccess: () => {
                toast('Invitation cancelled');
                setCancel(null);
              },
              onError: (e) => {
                err(e);
                setCancel(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
