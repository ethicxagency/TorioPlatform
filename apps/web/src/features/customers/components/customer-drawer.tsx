'use client';

import {
  Copy,
  MessageSquare,
  Pencil,
  Plus,
  ShoppingBag,
  StickyNote,
  Trash2,
  UserRound,
  X,
  Check,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { CHANNELS } from '@/features/inbox/constants';
import { fmtAgo, initialsOf } from '@/features/inbox/format';
import { SourceBadge } from '@/features/leads/components/badges';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { STATUSES } from '../constants';
import {
  useCustomer,
  useCustomerActivity,
  useCustomerConversations,
  useCustomerMutations,
  useCustomerNotes,
} from '../queries';
import type { CustomerActivity, CustomerItem, CustomerStatus } from '../types';
import { CustomerStatusBadge } from './status-badge';

interface Props {
  customer: CustomerItem;
  owners: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (c: CustomerItem) => void;
  onDelete: (c: CustomerItem) => void;
  onOpenConversation: (conversationId: string) => void;
}

const ICON: Record<CustomerActivity['type'], typeof Plus> = {
  CREATED: Plus,
  CONVERSATION: MessageSquare,
  NOTE: StickyNote,
};
const heading = 'm-0 mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint';

export function CustomerDrawer({
  customer: initial,
  owners,
  canWrite,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  onOpenConversation,
}: Props) {
  const { toast, registerEscape } = useShell();
  const { user } = useAuth();
  const { workspaceId: ws } = useWorkspace();
  const one = useCustomer(ws, initial.id, initial);
  const c = one.data ?? initial;
  const notes = useCustomerNotes(ws, initial.id);
  const acts = useCustomerActivity(ws, initial.id);
  const convs = useCustomerConversations(ws, initial.id);
  const m = useCustomerMutations(ws);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [delNote, setDelNote] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);

  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');
  const patch = (body: Parameters<typeof m.update.mutate>[0]['body'], ok: string) =>
    m.update.mutate({ id: c.id, body }, { onSuccess: () => toast(ok), onError: err });
  const copy = (text: string, what: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => toast(`${what} copied`),
      () => toast("Couldn't copy"),
    );
  const addTag = () => {
    const t = tag.trim().slice(0, 40);
    setTag('');
    if (t && !c.tags.includes(t) && c.tags.length < 20)
      patch({ tags: [...c.tags, t] }, 'Tag added');
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
        aria-label={`Customer profile: ${c.name}`}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[500px]"
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line-subtle text-sm font-semibold text-muted">
            {initialsOf(c.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 truncate text-base font-semibold">{c.name}</h2>
              <CustomerStatusBadge status={c.status} className="shrink-0" />
            </div>
            <div className="truncate text-[13px] text-muted">
              {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
            </div>
            {c.isSample && (
              <span className="mt-1 inline-block rounded-md bg-wash-2 px-2 py-0.5 text-[11px] text-faint">
                Sample customer
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close customer profile"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {c.conversationId ? (
              <Button size="sm" onClick={() => onOpenConversation(c.conversationId!)}>
                <MessageSquare size={13} />
                Open conversation
              </Button>
            ) : (
              <span className="self-center text-xs text-faint">No conversation yet</span>
            )}
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => onEdit(c)}>
                <Pencil size={13} />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-danger"
                onClick={() => onDelete(c)}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            )}
          </div>

          <section aria-labelledby="cu-overview">
            <h3 id="cu-overview" className={heading}>
              Overview
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line-subtle bg-[#FBFBFC] p-2.5">
                <div className="text-xs text-faint">Conversations</div>
                <div className="text-lg font-semibold tabular-nums">{c.conversationCount}</div>
              </div>
              <div className="rounded-lg border border-line-subtle bg-[#FBFBFC] p-2.5">
                <div className="text-xs text-faint">Last activity</div>
                <div className="text-sm font-semibold">{fmtAgo(c.lastActivityAt)} ago</div>
              </div>
            </div>
            <p className="m-0 mt-2 flex items-start gap-2 rounded-lg bg-[#FBFBFC] p-2.5 text-[13px] text-muted">
              <ShoppingBag size={14} className="mt-0.5 shrink-0 text-faint" />
              Orders, lifetime value and purchase dates aren&apos;t available yet — they need the
              Orders module.
            </p>
          </section>

          <section aria-labelledby="cu-contact" className="mt-5">
            <h3 id="cu-contact" className={heading}>
              Contact & ownership
            </h3>
            <dl className="m-0">
              {row('Email', c.email, c.email)}
              {row('Phone', c.phone, c.phone)}
              {row('Company', c.company)}
              {row('Address', c.address)}
              {row('Source', <SourceBadge source={c.source} />)}
              {row(
                'Status',
                canWrite ? (
                  <select
                    aria-label="Customer status"
                    disabled={m.update.isPending}
                    value={c.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as CustomerStatus }, 'Status updated')
                    }
                    className="h-8 rounded-lg border border-line bg-white px-2 text-[13px]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <CustomerStatusBadge status={c.status} />
                ),
              )}
              {row(
                'Owner',
                canWrite ? (
                  <select
                    aria-label="Customer owner"
                    disabled={m.update.isPending}
                    value={c.owner?.id ?? ''}
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
                  c.owner?.name
                ),
              )}
              {row(
                'Created',
                new Date(c.createdAt).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              )}
              {row(
                'Updated',
                new Date(c.updatedAt).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              )}
            </dl>
          </section>

          <section aria-labelledby="cu-tags" className="mt-5">
            <h3 id="cu-tags" className={heading}>
              Tags
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
                >
                  {t}
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => patch({ tags: c.tags.filter((x) => x !== t) }, 'Tag removed')}
                      className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              {c.tags.length === 0 && <span className="text-[13px] text-muted">No tags</span>}
              {canWrite && (
                <input
                  aria-label="Add tag"
                  value={tag}
                  maxLength={40}
                  onChange={(e) => setTag(e.target.value)}
                  onBlur={addTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="+ Add tag"
                  className="h-6 w-24 rounded-full border border-dashed border-[#C9CBD3] px-2.5 text-xs"
                />
              )}
            </div>
          </section>

          <section aria-labelledby="cu-convs" className="mt-5">
            <h3 id="cu-convs" className={heading}>
              Conversations
            </h3>
            {convs.isPending && <Skeleton className="h-10" />}
            {convs.data?.length === 0 && (
              <p className="m-0 text-[13px] text-muted">No linked conversations.</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {convs.data?.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(x.id)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line-subtle p-2 text-left hover:bg-wash"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: CHANNELS[x.provider].color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">
                        {x.preview || 'No messages'}
                      </span>
                      <span className="block text-xs text-faint">
                        {CHANNELS[x.provider].label} · {x.status.toLowerCase()} ·{' '}
                        {fmtAgo(x.lastMessageAt)}
                        {x.assignee ? ` · ${x.assignee.name}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="cu-notes" className="mt-5">
            <h3 id="cu-notes" className={heading}>
              Internal notes
            </h3>
            {canWrite && (
              <div className="mb-2.5">
                <textarea
                  aria-label="Add a note"
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Visible to your team only…"
                  className="w-full resize-y rounded-[10px] border border-line p-2.5 text-[13px]"
                />
                <div className="mt-1.5 flex justify-end">
                  <Button
                    size="sm"
                    disabled={!note.trim() || m.addNote.isPending}
                    onClick={() =>
                      m.addNote.mutate(
                        { id: c.id, body: note.trim() },
                        {
                          onSuccess: () => {
                            setNote('');
                            toast('Note added');
                          },
                          onError: err,
                        },
                      )
                    }
                  >
                    Add note
                  </Button>
                </div>
              </div>
            )}
            {notes.isPending && <Skeleton className="h-10" />}
            {notes.data?.length === 0 && (
              <p className="m-0 text-[13px] text-muted">No notes yet.</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {notes.data?.map((n) => {
                const mine = n.author?.id === user?.id;
                return (
                  <li key={n.id} className="rounded-lg border border-[#F5D9A0] bg-[#FFFBEB] p-2.5">
                    {editing?.id === n.id ? (
                      <div>
                        <textarea
                          aria-label="Edit note"
                          rows={2}
                          maxLength={2000}
                          value={editing.body}
                          onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                          className="w-full resize-y rounded-lg border border-line p-2 text-[13px]"
                        />
                        <div className="mt-1.5 flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={!editing.body.trim() || m.editNote.isPending}
                            onClick={() =>
                              m.editNote.mutate(
                                { id: c.id, noteId: n.id, body: editing.body.trim() },
                                {
                                  onSuccess: () => {
                                    setEditing(null);
                                    toast('Note updated');
                                  },
                                  onError: err,
                                },
                              )
                            }
                          >
                            <Check size={13} />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="m-0 whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">
                          {n.body}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-[#A68A52]">
                          <span className="flex-1">
                            {n.author?.name ?? 'Team'} ·{' '}
                            {new Date(n.createdAt).toLocaleString('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                          {mine && canWrite && (
                            <button
                              type="button"
                              aria-label="Edit note"
                              onClick={() => setEditing({ id: n.id, body: n.body })}
                              className="cursor-pointer hover:text-ink"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          {(mine && canWrite) || canDelete ? (
                            <button
                              type="button"
                              aria-label="Delete note"
                              onClick={() => setDelNote(n.id)}
                              className="cursor-pointer hover:text-danger"
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="cu-activity" className="mt-5">
            <h3 id="cu-activity" className={heading}>
              Activity
            </h3>
            {acts.isPending && <Skeleton className="h-10" />}
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
                      {a.conversationId ? (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(a.conversationId!)}
                          className="m-0 cursor-pointer text-left text-[13px] text-primary [overflow-wrap:anywhere] hover:underline"
                        >
                          {a.body}
                        </button>
                      ) : (
                        <p className="m-0 whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">
                          {a.body}
                        </p>
                      )}
                      <div className="text-xs text-faint">
                        {new Date(a.at).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="m-0 mt-2 flex items-center gap-1.5 text-xs text-faint">
              <UserRound size={11} />
              Tag and field change history isn&apos;t recorded yet.
            </p>
          </section>
        </div>
      </aside>
      {delNote && (
        <ConfirmDialog
          title="Delete this note?"
          body="The note will be removed for your whole team."
          confirmLabel="Delete"
          busy={m.deleteNote.isPending}
          onCancel={() => setDelNote(null)}
          onConfirm={() =>
            m.deleteNote.mutate(
              { id: c.id, noteId: delNote },
              {
                onSuccess: () => {
                  setDelNote(null);
                  toast('Note deleted');
                },
                onError: (e) => {
                  setDelNote(null);
                  err(e);
                },
              },
            )
          }
        />
      )}
    </>
  );
}
