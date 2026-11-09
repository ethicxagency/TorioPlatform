'use client';

import { AREA, CONTROL } from '@/components/ui/input';
import { DEFAULT_CURRENCY, formatCurrencyMajor } from '@torio/contracts';
import {
  ContactRow,
  InfoRow,
  ProfileBody,
  ProfileHeader,
  ProfileSection,
  ProfileShell,
} from '@/components/ui/profile-sidebar';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime } from '@/lib/datetime';
import {
  ArrowRightLeft,
  Building2,
  Mail,
  MessageSquare,
  Phone,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { useWorkspace } from '@/lib/workspace';
import { STAGES } from '../constants';
import { useLead, useLeadActivities, useLeadMutations } from '../queries';
import type { Lead, LeadActivity, LeadStage } from '../types';
import { ScoreIndicator, SourceBadge } from './badges';

interface Props {
  lead: Lead;
  owners: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (l: Lead) => void;
  onDelete: (l: Lead) => void;
  onOpenConversation: (l: Lead) => void;
}

const ICON: Record<LeadActivity['type'], typeof Plus> = {
  CREATED: Plus,
  STAGE_CHANGED: ArrowRightLeft,
  OWNER_CHANGED: UserRound,
  NOTE: StickyNote,
};
// Deal values are whole units of the workspace's default currency.

export function LeadDrawer({
  lead: initial,
  owners,
  canWrite,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  onOpenConversation,
}: Props) {
  const { toast } = useShell();
  const { workspaceId: ws, workspace } = useWorkspace();
  const timeZone = useTimeZone();
  const money = (n: number) =>
    formatCurrencyMajor(n, workspace?.defaultCurrency ?? DEFAULT_CURRENCY);
  const one = useLead(ws, initial.id, initial);
  const lead = one.data ?? initial;
  const acts = useLeadActivities(ws, initial.id);
  const m = useLeadMutations(ws);
  const [note, setNote] = useState('');
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
  const patch = (body: Parameters<typeof m.update.mutate>[0]['body'], ok: string) =>
    m.update.mutate({ id: lead.id, body }, { onSuccess: () => toast(ok), onError: fail });
  const addNote = () => {
    const body = note.trim();
    if (!body) return;
    m.addNote.mutate(
      { id: lead.id, body },
      {
        onSuccess: () => {
          setNote('');
          toast('Note added');
        },
        onError: fail,
      },
    );
  };

  return (
    <ProfileShell label={`Lead details: ${lead.name}`} onClose={onClose}>
      <ProfileHeader
        initials={initialsOf(lead.name)}
        name={lead.name}
        closeLabel="Close lead details"
        onClose={onClose}
        badges={
          <>
            <select
              aria-label="Lead status"
              disabled={!canWrite || m.update.isPending}
              value={lead.stage}
              onChange={(e) => patch({ stage: e.target.value as LeadStage }, 'Status updated')}
              className={`${CONTROL} h-8 w-auto pr-1.5 font-medium`}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <ScoreIndicator score={lead.score} />
          </>
        }
        summary={[lead.jobTitle, lead.company].filter(Boolean).join(' · ') || 'No company'}
        actions={
          <>
            {lead.conversationId ? (
              <Button size="md" onClick={() => onOpenConversation(lead)}>
                <MessageSquare size={15} />
                Open conversation
              </Button>
            ) : (
              <span className="self-center text-xs text-faint">No linked conversation</span>
            )}
            {canWrite && (
              <Button variant="outline" size="md" onClick={() => onEdit(lead)}>
                <Pencil size={14} />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="md"
                className="ml-auto text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => onDelete(lead)}
              >
                <Trash2 size={14} />
                Delete
              </Button>
            )}
          </>
        }
      />

      <ProfileBody>
        <ProfileSection id="lead-contact" title="Contact information">
          <dl className="m-0 divide-y divide-line-subtle">
            <ContactRow icon={Mail} label="Email" value={lead.email} kind="mail" />
            <ContactRow icon={Phone} label="Phone" value={lead.phone} kind="tel" />
            <ContactRow icon={Building2} label="Company" value={lead.company} />
          </dl>
        </ProfileSection>

        <ProfileSection id="lead-deal" title="Ownership & deal">
          <dl className="m-0">
            <InfoRow label="Source">
              <SourceBadge source={lead.source} />
            </InfoRow>
            <InfoRow label="Owner">
              {canWrite ? (
                <div className="max-w-[240px]">
                  <SearchSelect
                    label="Lead owner"
                    hideLabel
                    anyLabel="Unassigned"
                    searchPlaceholder="Search team members"
                    emptyText="No team members."
                    disabled={m.update.isPending}
                    options={owners.map((o) => ({
                      value: o.id,
                      label: o.name,
                      lead: (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
                          {initialsOf(o.name)}
                        </span>
                      ),
                    }))}
                    value={lead.owner?.id ?? ''}
                    onChange={(id) => patch({ ownerId: id || null }, 'Owner updated')}
                  />
                </div>
              ) : (
                (lead.owner?.name ?? <span className="text-faint">Unassigned</span>)
              )}
            </InfoRow>
            <InfoRow label="Deal value">
              {lead.dealValue != null ? (
                <span className="tabular-nums">{money(lead.dealValue)}</span>
              ) : (
                <span className="text-faint">Not set</span>
              )}
            </InfoRow>
            <InfoRow label="Created">
              <span className="text-muted">{fmtDateTime(lead.createdAt, timeZone)}</span>
            </InfoRow>
            <InfoRow label="Last activity">
              <span className="text-muted">{fmtAgo(lead.lastActivityAt)} ago</span>
            </InfoRow>
          </dl>
        </ProfileSection>

        {(lead.tags.length > 0 || lead.notes) && (
          <ProfileSection id="lead-tags" title="Tags & notes">
            {lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="max-w-full truncate rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {lead.notes && (
              <p className="mb-0 mt-3 whitespace-pre-wrap rounded-xl border border-line bg-white p-3 text-[13px] [overflow-wrap:anywhere]">
                {lead.notes}
              </p>
            )}
          </ProfileSection>
        )}

        <ProfileSection id="lead-related" title="Related">
          <p className="m-0 text-[13px] text-muted">
            {lead.customerId ? 'Linked to an Inbox customer.' : 'Not linked to an Inbox customer.'}{' '}
            Orders and follow-up tasks aren&apos;t available yet.
          </p>
        </ProfileSection>

        <ProfileSection id="lead-activity" title="Activity">
          {canWrite && (
            <div className="mb-3">
              <textarea
                aria-label="Add a note"
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    addNote();
                  }
                }}
                placeholder="Add a note for your team…"
                className={AREA}
              />
              <div className="mt-1.5 flex justify-end">
                <Button size="sm" disabled={!note.trim() || m.addNote.isPending} onClick={addNote}>
                  Add note
                </Button>
              </div>
            </div>
          )}
          {acts.isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10 bg-wash-2" />
            </div>
          )}
          {acts.isError && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              Couldn&apos;t load activity.{' '}
              <button
                type="button"
                onClick={() => acts.refetch()}
                className="cursor-pointer font-medium underline"
              >
                Retry
              </button>
            </p>
          )}
          {acts.data && acts.data.length === 0 && (
            <p className="m-0 text-[13px] text-muted">No activity yet.</p>
          )}
          <ol className="m-0 list-none p-0">
            {acts.data?.map((a) => {
              const Icon = ICON[a.type];
              return (
                <li
                  key={a.id}
                  className="flex gap-3 border-l border-line-subtle pb-3.5 pl-3 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="-ml-[25px] mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-line bg-white text-muted"
                  >
                    <Icon size={11} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">
                      {a.body}
                    </p>
                    <div className="text-xs text-faint">
                      {a.actor ? `${a.actor.name} · ` : ''}
                      {fmtDateTime(a.createdAt, timeZone)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </ProfileSection>
      </ProfileBody>
    </ProfileShell>
  );
}
