'use client';

import { formatMoney } from '@torio/contracts';
import {
  ArrowUpRight,
  ChevronDown,
  Mail,
  MapPin,
  Phone,
  Plus,
  X,
  Sparkles,
  AtSign,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useShell } from '@/components/shell/shell-context';
import { useCustomerConversations } from '@/features/customers/queries';
import { SOURCE, STAGE, STAGES } from '@/features/leads/constants';
import { useCustomerLeads, useLeadMutations } from '@/features/leads/queries';
import type { Lead, LeadStage } from '@/features/leads/types';
import { STATUS_INFO } from '@/features/orders/constants';
import { useCustomerOrders } from '@/features/orders/queries';
import { CHANNELS } from '../constants';
import { fmtAgo, fmtWait, initialsOf, minutesSince } from '../format';
import type { Conversation } from '../types';
import { ChannelBadge } from './channel-badge';

interface Props {
  c: Conversation;
  agents: { id: string; name: string }[];
  canEditCustomer: boolean;
  canManage: boolean;
  /** Existing Customer Details deep link; absent when the viewer can't read customers. */
  fullProfileHref?: string;
  onClose: () => void;
  onTags: (tags: string[]) => void;
  onNotes: (notes: string) => void;
  onAssign: (agentId: string | null) => void;
  onOpenConversation: (id: string) => void;
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `pf-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="border-b border-line-subtle">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-[13px] font-semibold text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {title}
          <ChevronDown
            size={15}
            aria-hidden
            className={cn(
              'text-faint transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={id} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** Compact label/value row; callers skip rows without a value instead of showing empty fields. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 py-1 text-[13px]">
      <dt className="text-faint">{label}</dt>
      <dd className="m-0 min-w-0 text-ink">{children}</dd>
    </div>
  );
}

const fieldCls =
  'h-8 w-full rounded-[var(--radius-input)] border border-line bg-white px-2 text-[13px] text-ink disabled:bg-wash disabled:text-muted';
const CONV_STATUS = { OPEN: 'Open', SNOOZED: 'Snoozed', RESOLVED: 'Resolved' } as const;
const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export function CustomerProfile({
  c,
  agents,
  canEditCustomer,
  canManage,
  fullProfileHref,
  onClose,
  onTags,
  onNotes,
  onAssign,
  onOpenConversation,
}: Props) {
  const cu = c.customer;
  const { workspaceId: ws, can } = useWorkspace();
  const canOrders = can('orders:read');
  const canCustomers = can('customers:read');
  const orders = useCustomerOrders(ws, cu.id, canOrders);
  const history = useCustomerConversations(ws, canCustomers ? cu.id : null);
  const others = (history.data ?? []).filter((x) => x.id !== c.id);
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState('');
  const [notes, setNotes] = useState(cu.notes);
  const canLeads = can('leads:read');
  const leads = useCustomerLeads(ws, cu.id, canLeads);
  // A customer can have several leads; the panel works on the newest, the Leads Centre lists them all.
  const lead = leads.data?.data[0] ?? null;
  const wait = c.waitingSince && c.status === 'OPEN' ? minutesSince(c.waitingSince) : null;
  const hasContact = !!(cu.phone || cu.email || cu.handle || cu.location);

  const addTag = () => {
    const v = tag.trim().slice(0, 40);
    if (v && !cu.tags.includes(v) && cu.tags.length < 20) onTags([...cu.tags, v]);
    setTag('');
    setAdding(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Sticky identity header: who this is and on which channel, always visible while scrolling. */}
      <div className="flex items-start gap-3 border-b border-line-subtle px-4 pb-3 pt-3.5">
        <span className="relative shrink-0">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-line-subtle text-[13px] font-semibold text-muted">
            {initialsOf(cu.name)}
          </span>
          <span className="absolute -bottom-0.5 -left-0.5">
            <ChannelBadge provider={c.channel.provider} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate font-card-title text-ink">{cu.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{CHANNELS[c.channel.provider].label}</span>
            {c.channel.displayName && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{c.channel.displayName}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {lead && (
              <span
                className="rounded-md px-1.5 py-px text-[11.5px] font-medium"
                style={{ background: STAGE[lead.stage].bg, color: STAGE[lead.stage].color }}
              >
                {STAGE[lead.stage].label} lead
              </span>
            )}
            {cu.isSample && (
              <span className="rounded-md bg-wash-2 px-1.5 py-px text-[11.5px] text-faint">
                Sample customer
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close customer details"
          title="Close (Esc)"
          onClick={onClose}
          className="-mr-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-wash hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fullProfileHref && (
          <div className="border-b border-line-subtle px-4 py-3">
            <Link
              href={fullProfileHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              View full profile
              <ArrowUpRight size={14} aria-hidden className="text-faint" />
            </Link>
          </div>
        )}

        <Section title="Contact">
          {hasContact ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] text-ink">
              {cu.phone && (
                <li className="flex items-center gap-2.5">
                  <Phone size={14} aria-label="Phone" className="shrink-0 text-faint" />
                  <span className="break-all tabular-nums">{cu.phone}</span>
                </li>
              )}
              {cu.email && (
                <li className="flex items-center gap-2.5">
                  <Mail size={14} aria-label="Email" className="shrink-0 text-faint" />
                  <span className="break-all">{cu.email}</span>
                </li>
              )}
              {cu.handle && (
                <li className="flex items-center gap-2.5">
                  <AtSign size={14} aria-label="Handle" className="shrink-0 text-faint" />
                  <span className="break-all">{cu.handle.replace(/^@/, '')}</span>
                </li>
              )}
              {cu.location && (
                <li className="flex items-center gap-2.5">
                  <MapPin size={14} aria-label="Location" className="shrink-0 text-faint" />
                  <span>{cu.location}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">No contact details on file.</p>
          )}
          <p className="m-0 mt-2.5 text-xs text-faint tabular-nums">
            Customer since {dateFmt(cu.createdAt)}
          </p>
        </Section>

        <Section title="This conversation">
          <dl className="m-0">
            <Row label="Status">
              {CONV_STATUS[c.status]}
              {wait != null && (
                <span className={cn('ml-1.5', wait >= 120 ? 'text-danger' : 'text-muted')}>
                  · waiting {fmtWait(wait)}
                </span>
              )}
            </Row>
            <Row label="Channel">{CHANNELS[c.channel.provider].label}</Row>
            <Row label="Last message">
              <span className="tabular-nums">{fmtAgo(c.lastMessageAt)}</span>
            </Row>
            <Row label="Assigned to">
              <select
                aria-label="Assigned agent"
                disabled={!canManage}
                value={c.assignee?.id ?? ''}
                onChange={(e) => onAssign(e.target.value || null)}
                className={fieldCls}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Row>
          </dl>
        </Section>

        {canLeads && (
          <Section title="Lead">
            <LeadSection
              c={c}
              lead={lead}
              state={leads.isPending ? 'loading' : leads.isError ? 'error' : 'ready'}
              agents={agents}
              onRetry={() => leads.refetch()}
            />
          </Section>
        )}

        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {cu.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-[3px] pl-2.5 pr-1.5 text-xs font-medium text-primary-hover"
              >
                {t}
                {canEditCustomer && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => onTags(cu.tags.filter((x) => x !== t))}
                    className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full hover:bg-white/70"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {cu.tags.length === 0 && !adding && (
              <span className="text-[13px] text-muted">No tags</span>
            )}
            {canEditCustomer &&
              (adding ? (
                <input
                  autoFocus
                  aria-label="New tag"
                  value={tag}
                  maxLength={40}
                  onChange={(e) => setTag(e.target.value)}
                  onBlur={addTag}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                    if (e.key === 'Escape') {
                      setTag('');
                      setAdding(false);
                    }
                  }}
                  className="h-6 w-28 rounded-full border border-primary px-2.5 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-input px-2.5 py-[3px] text-xs text-muted hover:bg-wash"
                >
                  <Plus size={11} />
                  Add tag
                </button>
              ))}
          </div>
        </Section>

        {canOrders && (
          <Section title="Orders">
            {orders.isPending ? (
              <div className="flex flex-col gap-2" aria-label="Loading orders">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : orders.isError ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                Couldn&apos;t load orders.{' '}
                <button
                  type="button"
                  onClick={() => orders.refetch()}
                  className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Try again
                </button>
              </p>
            ) : orders.data.data.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No orders yet.</p>
            ) : (
              <>
                <ul className="m-0 flex list-none flex-col p-0">
                  {orders.data.data.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center gap-2 border-b border-line-subtle py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink tabular-nums">
                          #{o.number}
                          <span className="ml-1.5 font-normal text-faint">
                            {dateFmt(o.createdAt)}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted">{o.itemSummary}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-semibold text-ink tabular-nums">
                          {formatMoney(o.totalMinor, o.currency)}
                        </div>
                        <div className="text-[11.5px] text-faint">
                          {STATUS_INFO[o.status].label}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {orders.data.meta.total > orders.data.data.length && (
                  <p className="m-0 mt-1.5 text-xs text-faint">
                    Showing the latest {orders.data.data.length} of {orders.data.meta.total}.
                  </p>
                )}
              </>
            )}
          </Section>
        )}

        {canCustomers && (
          <Section title="Other conversations">
            {history.isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : history.isError ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                Couldn&apos;t load conversation history.
              </p>
            ) : others.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No other conversations.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {others.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(x.id)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    >
                      <ChannelIcon channel={x.provider} size={16} decorative />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">
                          {x.preview || 'No messages'}
                        </span>
                        <span className="block text-[11.5px] text-faint">
                          {CONV_STATUS[x.status]} · {fmtAgo(x.lastMessageAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Internal notes" defaultOpen={false}>
          <textarea
            aria-label="Customer notes"
            rows={4}
            maxLength={5000}
            disabled={!canEditCustomer}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== cu.notes && onNotes(notes)}
            placeholder={
              canEditCustomer ? 'Notes about this customer — visible to your team only' : 'No notes'
            }
            className="w-full resize-y rounded-[var(--radius-input)] border border-line bg-white p-2 text-[13px] disabled:bg-wash"
          />
          <p className="m-0 mt-1 text-[11.5px] text-faint">Saved when you click away.</p>
        </Section>

        <Section title="AI summary" defaultOpen={false}>
          <div className="flex items-start gap-2 rounded-lg border border-primary-line bg-primary-tint p-3 text-[13px] text-muted">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
            No AI summary yet. Summaries will appear here once Brain is connected.
          </div>
        </Section>
      </div>
    </div>
  );
}

const SOURCE_OF = { WHATSAPP: 'WHATSAPP', INSTAGRAM: 'INSTAGRAM', MESSENGER: 'MESSENGER' } as const;

/**
 * The customer's lead record: the same one the Leads Centre shows, so a stage change here appears there.
 * Changes are confirmed by the server before the toast; stage moves use the Leads module's optimistic update.
 */
function LeadSection({
  c,
  lead,
  state,
  agents,
  onRetry,
}: {
  c: Conversation;
  lead: Lead | null;
  state: 'loading' | 'error' | 'ready';
  agents: { id: string; name: string }[];
  onRetry: () => void;
}) {
  const { toast } = useShell();
  const { workspaceId: ws, workspace, can } = useWorkspace();
  const canWrite = can('leads:write');
  const m = useLeadMutations(ws);
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  if (state === 'loading') return <Skeleton className="h-16 w-full" />;
  if (state === 'error')
    return (
      <p role="alert" className="m-0 text-[13px] text-danger">
        Couldn&apos;t load the lead.{' '}
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
        >
          Try again
        </button>
      </p>
    );

  if (!lead)
    return (
      <div className="text-[13px] text-muted">
        <p className="m-0">No lead for this customer yet.</p>
        {canWrite && (
          <button
            type="button"
            disabled={m.create.isPending}
            onClick={() =>
              m.create.mutate(
                {
                  name: c.customer.name,
                  ...(c.customer.phone && { phone: c.customer.phone }),
                  ...(c.customer.email && { email: c.customer.email }),
                  source: SOURCE_OF[c.channel.provider],
                  stage: 'NEW',
                  tags: [],
                  notes: '',
                  customerId: c.customer.id,
                },
                { onSuccess: () => toast('Lead created'), onError: err },
              )
            }
            className="mt-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold text-ink hover:bg-wash disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={13} aria-hidden />
            {m.create.isPending ? 'Creating…' : 'Create lead'}
          </button>
        )}
      </div>
    );

  const update = (body: { stage?: LeadStage; ownerId?: string | null }, ok: string) =>
    m.update.mutate({ id: lead.id, body }, { onSuccess: () => toast(ok), onError: err });

  return (
    <>
      <dl className="m-0">
        {/* A lead keeps its own name; show it when it differs so the agent knows which record this is. */}
        {lead.name !== c.customer.name && <Row label="Lead">{lead.name}</Row>}
        <Row label="Stage">
          <select
            aria-label="Lead stage"
            disabled={!canWrite}
            value={lead.stage}
            onChange={(e) => update({ stage: e.target.value as LeadStage }, 'Lead stage updated')}
            className={fieldCls}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Owner">
          <select
            aria-label="Lead owner"
            disabled={!canWrite}
            value={lead.owner?.id ?? ''}
            onChange={(e) => update({ ownerId: e.target.value || null }, 'Lead owner updated')}
            className={fieldCls}
          >
            <option value="">No owner</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Source">{SOURCE[lead.source].label}</Row>
        {lead.dealValue != null && (
          <Row label="Deal value">
            <span className="tabular-nums">
              {/* Stored in whole units of the workspace currency. */}
              {formatMoney(lead.dealValue * 100, workspace?.defaultCurrency ?? 'BDT')}
            </span>
          </Row>
        )}
        <Row label="Score">
          <span className="tabular-nums">{lead.score} / 100</span>
        </Row>
      </dl>
      <Link
        href={`/leads?lead=${encodeURIComponent(lead.id)}`}
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
      >
        View in Leads
        <ArrowUpRight size={13} aria-hidden />
      </Link>
    </>
  );
}
