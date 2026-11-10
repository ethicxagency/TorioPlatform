'use client';

import { ChannelIcon } from '@/components/channel-icon';
import {
  ContactRow,
  InfoRow,
  ProfileBody,
  ProfileHeader,
  ProfileMetric,
  ProfileShell,
} from '@/components/ui/profile-sidebar';
import { AREA, CONTROL } from '@/components/ui/input';
import {
  Building2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  ShoppingBag,
  StickyNote,
  Trash2,
  UserRound,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShell } from '@/components/shell/shell-context';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { useTimeZone } from '@/features/settings/queries';
import { fmtDateTime, fmtStamp } from '@/lib/datetime';
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
const heading = 'm-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-faint';
const STATUS_LABEL = { OPEN: 'Open', SNOOZED: 'Snoozed', RESOLVED: 'Resolved' } as const;

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
  const { toast } = useShell();
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
  const timeZone = useTimeZone();

  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const patch = (body: Parameters<typeof m.update.mutate>[0]['body'], ok: string) =>
    m.update.mutate({ id: c.id, body }, { onSuccess: () => toast(ok), onError: err });
  const contactRow = (
    icon: LucideIcon,
    label: string,
    value: string | null,
    kind?: 'mail' | 'tel',
  ) => <ContactRow icon={icon} label={label} value={value} kind={kind} />;
  const detailRow = (label: string, value: React.ReactNode) => (
    <InfoRow label={label}>{value}</InfoRow>
  );
  const addTag = () => {
    const t = tag.trim().slice(0, 40);
    setTag('');
    if (t && !c.tags.includes(t) && c.tags.length < 20)
      patch({ tags: [...c.tags, t] }, 'Tag added');
  };

  return (
    <>
      <ProfileShell label={`Customer profile: ${c.name}`} onClose={onClose}>
        <ProfileHeader
          initials={initialsOf(c.name)}
          name={c.name}
          closeLabel="Close customer profile"
          onClose={onClose}
          badges={
            <>
              <CustomerStatusBadge status={c.status} className="shrink-0" />
              {c.isSample && (
                <span className="rounded-md bg-wash-2 px-1.5 py-0.5 text-[11px] text-muted">
                  Sample customer
                </span>
              )}
            </>
          }
          summary={[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
          actions={
            <>
              {c.conversationId ? (
                <Button size="md" onClick={() => onOpenConversation(c.conversationId!)}>
                  <MessageSquare size={15} />
                  Open conversation
                </Button>
              ) : (
                <span className="self-center text-xs text-faint">No conversation yet</span>
              )}
              {canWrite && (
                <Button variant="outline" size="md" onClick={() => onEdit(c)}>
                  <Pencil size={14} />
                  Edit
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="md"
                  className="ml-auto text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => onDelete(c)}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              )}
            </>
          }
        />

        <ProfileBody>
          <section aria-labelledby="cu-overview">
            <h3 id="cu-overview" className={heading}>
              Customer overview
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <ProfileMetric label="Conversations" value={c.conversationCount} />
              <ProfileMetric label="Last activity" value={`${fmtAgo(c.lastActivityAt)} ago`} />
            </div>
            <p className="m-0 mt-2.5 flex items-center gap-1.5 text-xs text-muted">
              <ShoppingBag size={13} aria-hidden className="shrink-0 text-faint" />
              Orders, lifetime value and purchase dates aren&apos;t available yet.
            </p>
          </section>

          <section aria-labelledby="cu-contact" className="mt-6">
            <h3 id="cu-contact" className={heading}>
              Contact information
            </h3>
            <dl className="m-0 divide-y divide-line-subtle">
              {contactRow(Mail, 'Email', c.email, 'mail')}
              {contactRow(Phone, 'Phone', c.phone, 'tel')}
              {contactRow(Building2, 'Company', c.company)}
              {contactRow(MapPin, 'Address', c.address)}
            </dl>
          </section>

          <section aria-labelledby="cu-owner" className="mt-6">
            <h3 id="cu-owner" className={heading}>
              Ownership &amp; details
            </h3>
            <dl className="m-0">
              {detailRow('Source', <SourceBadge source={c.source} />)}
              {detailRow(
                'Status',
                canWrite ? (
                  <select
                    aria-label="Customer status"
                    disabled={m.update.isPending}
                    value={c.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as CustomerStatus }, 'Status updated')
                    }
                    className={`${CONTROL} w-36`}
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
              {detailRow(
                'Owner',
                canWrite ? (
                  <div className="max-w-[240px]">
                    <SearchSelect
                      label="Customer owner"
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
                      value={c.owner?.id ?? ''}
                      onChange={(id) => patch({ ownerId: id || null }, 'Owner updated')}
                    />
                  </div>
                ) : (
                  (c.owner?.name ?? <span className="text-faint">Unassigned</span>)
                ),
              )}
              {detailRow(
                'Created',
                <span className="text-muted">{fmtDateTime(c.createdAt, timeZone)}</span>,
              )}
              {detailRow(
                'Updated',
                <span className="text-muted">{fmtDateTime(c.updatedAt, timeZone)}</span>,
              )}
            </dl>
          </section>

          <section aria-labelledby="cu-tags" className="mt-6">
            <h3 id="cu-tags" className={heading}>
              Tags
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary-soft py-0.5 pl-2 pr-1 text-xs font-medium text-primary-hover"
                >
                  <span className="truncate">{t}</span>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => patch({ tags: c.tags.filter((x) => x !== t) }, 'Tag removed')}
                      className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-white/70"
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
                  className="h-6 w-24 rounded-md border border-dashed border-line-input bg-transparent px-2 text-xs transition-colors duration-150 placeholder:text-faint hover:border-primary focus:border-primary focus:outline-none motion-reduce:transition-none"
                />
              )}
            </div>
          </section>

          <section aria-labelledby="cu-convs" className="mt-6">
            <h3 id="cu-convs" className={heading}>
              Recent conversations
            </h3>
            {convs.isPending && <Skeleton className="h-12" />}
            {convs.data?.length === 0 && (
              <p className="m-0 text-[13px] text-muted">No conversations with this customer yet.</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {convs.data?.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(x.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-input hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                  >
                    <ChannelIcon channel={x.provider} size={18} decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">
                        {x.preview || 'No messages'}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {CHANNELS[x.provider].label}
                        {x.assignee ? ` · ${x.assignee.name}` : ''} · {fmtAgo(x.lastMessageAt)}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-wash-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                      {STATUS_LABEL[x.status]}
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
                  className={AREA}
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
                            {fmtStamp(n.createdAt, {
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
                        {fmtStamp(a.at, {
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
        </ProfileBody>
      </ProfileShell>
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
