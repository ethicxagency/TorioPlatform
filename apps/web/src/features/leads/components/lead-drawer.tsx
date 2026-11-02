'use client';

import { DEFAULT_CURRENCY, formatCurrencyMajor } from '@torio/contracts';
import {
  ArrowRightLeft,
  Copy,
  MessageSquare,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
// Deal values are whole units of the workspace currency (BDT unless the workspace set another default).
const money = (n: number) => formatCurrencyMajor(n, DEFAULT_CURRENCY);

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
  const { toast, registerEscape } = useShell();
  const { workspaceId: ws } = useWorkspace();
  const one = useLead(ws, initial.id, initial);
  const lead = one.data ?? initial;
  const acts = useLeadActivities(ws, initial.id);
  const m = useLeadMutations(ws);
  const [note, setNote] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
  const patch = (body: Parameters<typeof m.update.mutate>[0]['body'], ok: string) =>
    m.update.mutate({ id: lead.id, body }, { onSuccess: () => toast(ok), onError: fail });
  const copy = (text: string, what: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => toast(`${what} copied`),
      () => toast("Couldn't copy"),
    );
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

  const row = (label: string, value: React.ReactNode, copyText?: string | null) => (
    <div className="flex items-start gap-3 py-1.5 text-[13px]">
      <dt className="w-24 shrink-0 text-faint">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 break-words">
        {value || <span className="text-faint">—</span>}
      </dd>
      {copyText && (
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => copy(copyText, label)}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash-2"
        >
          <Copy size={13} />
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[rgba(13,37,61,0.25)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Lead details: ${lead.name}`}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[480px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line-subtle text-sm font-semibold text-muted">
            {initialsOf(lead.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-base font-semibold">{lead.name}</h2>
            <div className="truncate text-[13px] text-muted">
              {[lead.jobTitle, lead.company].filter(Boolean).join(' · ') || 'No company'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Lead status"
                disabled={!canWrite || m.update.isPending}
                value={lead.stage}
                onChange={(e) => patch({ stage: e.target.value as LeadStage }, 'Status updated')}
                className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] font-medium disabled:bg-[#FBFBFC]"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ScoreIndicator score={lead.score} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close lead details"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
                <Pencil size={13} />
                Edit
              </Button>
            )}
            {lead.conversationId ? (
              <Button variant="outline" size="sm" onClick={() => onOpenConversation(lead)}>
                <MessageSquare size={13} />
                Open conversation
              </Button>
            ) : (
              <span className="self-center text-xs text-faint">No linked conversation</span>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-danger"
                onClick={() => onDelete(lead)}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            )}
          </div>

          <section aria-labelledby="lead-contact">
            <h3
              id="lead-contact"
              className="m-0 mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint"
            >
              Contact
            </h3>
            <dl className="m-0">
              {row('Email', lead.email, lead.email)}
              {row('Phone', lead.phone, lead.phone)}
              {row('Company', lead.company)}
              {row('Source', <SourceBadge source={lead.source} />)}
              {row(
                'Owner',
                canWrite ? (
                  <select
                    aria-label="Lead owner"
                    disabled={m.update.isPending}
                    value={lead.owner?.id ?? ''}
                    onChange={(e) => patch({ ownerId: e.target.value || null }, 'Owner updated')}
                    className="h-8 w-full max-w-[220px] rounded-lg border border-line bg-white px-2 text-[13px]"
                  >
                    <option value="">Unassigned</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  lead.owner?.name
                ),
              )}
              {row('Deal value', lead.dealValue != null ? money(lead.dealValue) : null)}
              {row(
                'Created',
                new Date(lead.createdAt).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              )}
              {row('Last activity', fmtAgo(lead.lastActivityAt) + ' ago')}
            </dl>
            {lead.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary-soft px-2.5 py-[3px] text-xs font-medium text-primary-hover"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {lead.notes && (
              <p className="mb-0 mt-3 whitespace-pre-wrap rounded-lg bg-[#FBFBFC] p-3 text-[13px] [overflow-wrap:anywhere]">
                {lead.notes}
              </p>
            )}
          </section>

          <section aria-labelledby="lead-related" className="mt-5">
            <h3
              id="lead-related"
              className="m-0 mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint"
            >
              Related
            </h3>
            <p className="m-0 text-[13px] text-muted">
              {lead.customerId
                ? 'Linked to an Inbox customer.'
                : 'Not linked to an Inbox customer.'}{' '}
              Orders and follow-up tasks aren&apos;t available yet.
            </p>
          </section>

          <section aria-labelledby="lead-activity" className="mt-5">
            <h3
              id="lead-activity"
              className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint"
            >
              Activity
            </h3>
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
                  className="w-full resize-y rounded-[10px] border border-line p-2.5 text-[13px]"
                />
                <div className="mt-1.5 flex justify-end">
                  <Button
                    size="sm"
                    disabled={!note.trim() || m.addNote.isPending}
                    onClick={addNote}
                  >
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
                        {new Date(a.createdAt).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </aside>
    </>
  );
}
