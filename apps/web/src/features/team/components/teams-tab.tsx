'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { teamInputSchema, type TeamInput } from '@torio/contracts';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { Modal } from '@/features/leads/components/modal';
import { ApiRequestError } from '@/features/leads/queries';
import { useTeamMutations } from '../queries';
import type { Member, TeamItem } from '../types';

function TeamForm({
  team,
  people,
  onClose,
  onSave,
}: {
  team: TeamItem | null;
  people: Member[];
  onClose: () => void;
  onSave: (v: {
    name: string;
    description: string;
    leadId: string | null;
    memberIds: string[];
  }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    TeamInput,
    unknown,
    { name: string; description: string; leadId?: string | null; memberIds: string[] }
  >({
    resolver: zodResolver(teamInputSchema),
    defaultValues: {
      name: team?.name ?? '',
      description: team?.description ?? '',
      leadId: team?.lead?.id ?? null,
      memberIds: team?.members.map((m) => m.userId) ?? [],
    },
  });
  const submit = handleSubmit(async (v) => {
    try {
      await onSave({
        name: v.name,
        description: v.description,
        leadId: v.leadId ?? null,
        memberIds: v.memberIds,
      });
      onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409)
        return setError('name', { message: e.message });
      setError('root', { message: e instanceof Error ? e.message : 'Could not save the team' });
    }
  });
  return (
    <Modal
      title={team ? 'Edit team' : 'Create team'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="team-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save team'}
          </Button>
        </>
      }
    >
      <form id="team-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Team name *<Input autoComplete="off" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && (
            <span role="alert" className="text-xs font-normal text-danger">
              {errors.name.message}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Description
          <textarea
            rows={2}
            maxLength={300}
            className="w-full resize-y rounded-[10px] border border-line p-2.5 text-sm font-normal"
            {...register('description')}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Team lead
          <select
            className="h-10 rounded-[10px] border border-line bg-white px-2.5 text-sm font-normal"
            {...register('leadId', { setValueAs: (v) => v || null })}
          >
            <option value="">No lead</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-[13px] font-medium">Members</legend>
          <div className="max-h-48 overflow-y-auto rounded-[10px] border border-line p-1.5">
            {people.map((p) => (
              <label
                key={p.userId}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-wash"
              >
                <input type="checkbox" value={p.userId} {...register('memberIds')} />
                {p.name}
                <span className="text-xs text-faint">{p.email}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {errors.root && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {errors.root.message}
          </p>
        )}
      </form>
    </Modal>
  );
}

interface Props {
  ws: string | null;
  teams: TeamItem[] | undefined;
  people: Member[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  canManage: boolean;
}

export function TeamsTab({ ws, teams, people, loading, error, onRetry, canManage }: Props) {
  const { toast } = useShell();
  const mut = useTeamMutations(ws);
  const [form, setForm] = useState<{ team: TeamItem | null } | null>(null);
  const [del, setDel] = useState<TeamItem | null>(null);

  if (loading) return <Skeleton className="h-32 rounded-card" />;
  if (error)
    return (
      <div role="alert" className="rounded-card border border-line bg-white px-6 py-12 text-center">
        <div className="text-sm font-semibold">Couldn&apos;t load teams</div>
        <div className="mb-3 mt-1 text-[13px] text-muted">{error}</div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[13px] text-muted">
          Teams group members for assignment and reporting. They don&apos;t change what anyone can
          access — roles do.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setForm({ team: null })}>
            <Plus size={14} />
            Create team
          </Button>
        )}
      </div>
      {!teams?.length ? (
        <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
            <Users size={18} className="text-primary" />
          </span>
          <div className="text-[14.5px] font-semibold">No teams yet</div>
          <div className="mx-auto mb-3 mt-1 max-w-[320px] text-[13px] text-muted">
            Create teams like Support or Sales to organise your members.
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setForm({ team: null })}>
              Create team
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <article
              key={t.id}
              className="flex flex-col gap-2 rounded-card border border-line bg-white p-4"
            >
              <div className="flex items-start gap-2">
                <h3 className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">{t.name}</h3>
                {canManage && (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${t.name}`}
                      onClick={() => setForm({ team: t })}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash-2"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setDel(t)}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash-2 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
              {t.description && <p className="m-0 text-[13px] text-muted">{t.description}</p>}
              <dl className="m-0 mt-1 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-faint">Members</dt>
                  <dd className="m-0 text-base font-semibold tabular-nums">{t.members.length}</dd>
                </div>
                <div>
                  <dt className="text-faint">Open assigned</dt>
                  <dd className="m-0 text-base font-semibold tabular-nums">
                    {t.openConversations}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-faint">Lead</dt>
                  <dd className="m-0 truncate text-[13px] font-medium">{t.lead?.name ?? '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-1">
                {t.members.slice(0, 6).map((m) => (
                  <span
                    key={m.userId}
                    className="rounded-full bg-wash-2 px-2 py-px text-xs text-muted"
                  >
                    {m.name}
                  </span>
                ))}
                {t.members.length > 6 && (
                  <span className="text-xs text-faint">+{t.members.length - 6}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {form && (
        <TeamForm
          team={form.team}
          people={people}
          onClose={() => setForm(null)}
          onSave={async (v) => {
            if (form.team) {
              await mut.updateTeam.mutateAsync({ id: form.team.id, body: v });
              toast('Team updated');
            } else {
              await mut.createTeam.mutateAsync(v);
              toast('Team created');
            }
          }}
        />
      )}
      {del && (
        <ConfirmDialog
          title={`Delete ${del.name}?`}
          body="Members stay in the workspace; only the team grouping is removed."
          confirmLabel="Delete team"
          busy={mut.deleteTeam.isPending}
          onCancel={() => setDel(null)}
          onConfirm={() =>
            mut.deleteTeam.mutate(del.id, {
              onSuccess: () => {
                toast('Team deleted');
                setDel(null);
              },
              onError: (e) => {
                toast(e instanceof Error ? e.message : 'Failed');
                setDel(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
