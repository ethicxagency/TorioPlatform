'use client';

import { controlCls } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { invitationInputSchema, type InvitationInput } from '@torio/contracts';
import { assignableRoles } from '@torio/types';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/features/leads/components/modal';
import { ApiRequestError } from '@/features/leads/queries';
import { ROLE_INFO, type InvitationCreated, type Role, type TeamItem } from '../types';

interface Props {
  actorRole: Role;
  teams: TeamItem[];
  onClose: () => void;
  /** Resolves with the created invitation only after the server confirmed it. */
  onInvite: (v: {
    email: string;
    role: 'ADMIN' | 'AGENT';
    teamId?: string | null;
  }) => Promise<InvitationCreated>;
}

const label = 'flex flex-col gap-1.5 text-[13px] font-medium';

export function InviteDialog({ actorRole, teams, onClose, onInvite }: Props) {
  const roles = assignableRoles(actorRole).filter((r): r is 'ADMIN' | 'AGENT' => r !== 'OWNER');
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InvitationInput>({
    resolver: zodResolver(invitationInputSchema),
    defaultValues: { email: '', role: roles[roles.length - 1] ?? 'AGENT', teamId: null },
  });
  const role = (useWatch({ control, name: 'role' }) ?? 'AGENT') as Role;

  const submit = handleSubmit(async (v) => {
    try {
      setCreated(
        await onInvite({ email: v.email, role: v.role ?? 'AGENT', teamId: v.teamId || null }),
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409)
        return setError('email', { message: e.message });
      setError('root', {
        message: e instanceof Error ? e.message : 'Could not create the invitation',
      });
    }
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created!.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user can select the text */
    }
  };

  return (
    <Modal
      title={created ? 'Invitation created' : 'Invite member'}
      description={created ? undefined : 'They will join with the role you choose.'}
      onClose={onClose}
      footer={
        created ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create invitation'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-3 text-[13px]" role="status">
          <p className="m-0">
            Invitation for <b>{created.email}</b> ({ROLE_INFO[created.role].label}) is ready.{' '}
            <b>Torio doesn&apos;t send email yet</b>, so share this one-time link with them
            yourself. It expires {new Date(created.expiresAt).toLocaleDateString()}.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-[#FBFBFC] p-2">
            <input
              readOnly
              aria-label="Invitation link"
              value={created.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 border-none bg-transparent text-xs"
            />
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="m-0 text-xs text-faint">
            The link is only shown now. You can generate a new one with Resend.
          </p>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <label className={label}>
            Email address *
            <Input
              type="email"
              autoComplete="off"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <span role="alert" className="text-xs font-normal text-danger">
                {errors.email.message}
              </span>
            )}
          </label>
          <label className={label}>
            Role *
            <select className={controlCls} {...register('role')}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_INFO[r].label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">{ROLE_INFO[role].description}</span>
          </label>
          {teams.length > 0 && (
            <label className={label}>
              Team (optional)
              <select
                className={controlCls}
                {...register('teamId', { setValueAs: (v) => v || null })}
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {errors.root && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {errors.root.message}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
