'use client';

import { AREA, controlCls } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { teamInputSchema, type TeamInput } from '@torio/contracts';
import {
  ArrowDownAZ,
  ArrowDownZA,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { FilterMenu, type FilterMenuOption } from '@/features/inbox/components/filter-menu';
import { initialsOf } from '@/features/inbox/format';
import { Modal } from '@/features/leads/components/modal';
import { ApiRequestError } from '@/features/leads/queries';
import { useTeamMutations } from '../queries';
import type { Member, TeamItem } from '../types';

type TeamSort = 'name-asc' | 'name-desc' | 'members-desc' | 'open-desc';

// Sorting happens here because the list is already fully loaded; every key is a real field of the team.
const SORTS: FilterMenuOption<TeamSort>[] = [
  { key: 'name-asc', label: 'Name A–Z', short: 'A–Z', icon: <ArrowDownAZ size={15} aria-hidden /> },
  {
    key: 'name-desc',
    label: 'Name Z–A',
    short: 'Z–A',
    icon: <ArrowDownZA size={15} aria-hidden />,
  },
  {
    key: 'members-desc',
    label: 'Most members',
    short: 'Members',
    icon: <Users size={15} aria-hidden />,
  },
  {
    key: 'open-desc',
    label: 'Most open conversations',
    short: 'Open',
    icon: <MessagesSquare size={15} aria-hidden />,
  },
];

function sortTeams(list: TeamItem[], sort: TeamSort) {
  const byName = (a: TeamItem, b: TeamItem) => a.name.localeCompare(b.name);
  return [...list].sort(
    sort === 'name-asc'
      ? byName
      : sort === 'name-desc'
        ? (a, b) => byName(b, a)
        : sort === 'members-desc'
          ? (a, b) => b.members.length - a.members.length || byName(a, b)
          : (a, b) => b.openConversations - a.openConversations || byName(a, b),
  );
}

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
          <textarea rows={2} maxLength={300} className={AREA} {...register('description')} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Team lead
          <select className={controlCls} {...register('leadId', { setValueAs: (v) => v || null })}>
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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TeamSort>('name-asc');
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? (teams ?? []).filter(
          (t) => t.name.toLowerCase().includes(term) || t.description.toLowerCase().includes(term),
        )
      : (teams ?? []);
    return sortTeams(matches, sort);
  }, [teams, search, sort]);

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
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-2.5 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 motion-reduce:transition-none">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search teams"
            placeholder="Search team name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-faint hover:bg-wash-2 hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <div className="@container w-[148px] shrink-0 sm:w-[190px]">
          <FilterMenu
            label="Sort"
            options={SORTS}
            value={sort}
            defaultValue="name-asc"
            onChange={setSort}
          />
        </div>
        {canManage && (
          <Button onClick={() => setForm({ team: null })}>
            <Plus size={14} />
            Create team
          </Button>
        )}
      </div>
      <p className="m-0 text-xs text-muted">
        Teams group members for assignment and reporting. They don&apos;t change what anyone can
        access — roles do.
      </p>
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
      ) : shown.length === 0 ? (
        <div className="rounded-card border border-line bg-white px-6 py-12 text-center">
          <div className="text-[14.5px] font-semibold">No teams match “{search.trim()}”</div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearch('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <article
              key={t.id}
              className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 transition-colors duration-150 hover:border-line-input motion-reduce:transition-none"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-[12.5px] font-semibold text-primary-hover"
                >
                  {initialsOf(t.name)}
                </span>
                <h3 className="m-0 min-w-0 flex-1 truncate pt-[7px] text-[15px] font-semibold">
                  {t.name}
                </h3>
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
              <dl className="m-0 mt-1 grid grid-cols-3 gap-2 border-t border-line-subtle pt-2.5 text-xs">
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
                toast.error(e instanceof Error ? e.message : 'Failed');
                setDel(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
