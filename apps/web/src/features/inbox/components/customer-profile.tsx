'use client';

import { SearchSelect, type SearchSelectOption } from './search-select';
import { DEFAULT_CURRENCY, formatMoney } from '@torio/contracts';
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Mail,
  MapPin,
  Phone,
  Plus,
  X,
  Sparkles,
  AtSign,
  Check,
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
import { OrderStatusBadge } from '@/features/orders/components/badges';
import { STATUS_INFO } from '@/features/orders/constants';
import { useCustomerOrders, useOrderMutations } from '@/features/orders/queries';
import { ORDER_STATUS_LABEL, statusBlockReason, type OrderStatus } from '@torio/contracts';
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
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Real item count, shown quietly beside the title when known. */
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Content is clipped only while the section animates, so dropdowns inside an open section aren't cut off.
  const [clip, setClip] = useState(!defaultOpen);
  const toggle = () => {
    if (open) {
      setClip(true);
      setOpen(false);
    } else {
      setOpen(true);
      setTimeout(() => setClip(false), 220);
    }
  };
  const id = `pf-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="border-b border-line-subtle">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="flex h-12 w-full cursor-pointer items-center justify-between px-4 text-[14px] font-semibold text-ink transition-colors duration-150 hover:bg-wash/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <span className="flex items-center gap-2">
            {title}
            {count != null && count > 0 && (
              <span className="rounded-full bg-wash-2 px-1.5 text-[11px] font-medium tabular-nums text-muted">
                {count}
              </span>
            )}
          </span>
          <ChevronDown
            size={15}
            aria-hidden
            className={cn(
              'text-muted transition-transform duration-200 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div
        id={id}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-[var(--ease-standard)] motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className={cn('min-h-0', (clip || !open) && 'overflow-hidden')}>
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Compact label/value row; callers skip rows without a value instead of showing empty fields. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2 py-1.5 text-[13.5px]">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** Searchable agent picker with initials, used for the conversation assignee and the lead owner. */
function AgentSelect({
  label,
  none,
  agents,
  value,
  disabled,
  onChange,
}: {
  label: string;
  none: string;
  agents: { id: string; name: string }[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <SearchSelect
      label={label}
      hideLabel
      anyLabel={none}
      searchPlaceholder="Search team members"
      emptyText="No team members."
      disabled={disabled}
      options={agents.map((a) => ({
        value: a.id,
        label: a.name,
        lead: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
            {initialsOf(a.name)}
          </span>
        ),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

/** A contact row: icon, the real value (a tel:/mailto: link when it is a phone or email) and a copy action. */
function ContactLine({
  icon,
  value,
  href,
  copyLabel,
  mono,
}: {
  icon: React.ReactNode;
  value: string;
  href?: string;
  copyLabel?: string;
  mono?: boolean;
}) {
  const { toast } = useShell();
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="shrink-0 text-faint">{icon}</span>
      {href ? (
        <a
          href={href}
          className={cn(
            'min-w-0 flex-1 break-all text-ink no-underline hover:text-primary hover:underline',
            mono && 'tabular-nums',
          )}
        >
          {value}
        </a>
      ) : (
        <span className="min-w-0 flex-1 break-all">{value}</span>
      )}
      {copyLabel && (
        <button
          type="button"
          aria-label={`Copy ${copyLabel}`}
          title={`Copy ${copyLabel}`}
          onClick={() =>
            void navigator.clipboard?.writeText(value).then(
              () => {
                toast(`${copyLabel[0]!.toUpperCase()}${copyLabel.slice(1)} copied`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => toast("Couldn't copy"),
            )
          }
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-wash-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      )}
    </li>
  );
}
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
      {/* Sticky identity header: who this is and on which channel, always visible while the body scrolls. */}
      <div className="glass-header flex shrink-0 items-start gap-3.5 border-b border-line-subtle px-4 pb-3.5 pt-4">
        <span className="relative shrink-0">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wash-2 text-[15px] font-semibold text-muted ring-1 ring-inset ring-line-subtle">
            {initialsOf(cu.name)}
          </span>
          <span className="absolute -bottom-1 -left-1">
            <ChannelBadge provider={c.channel.provider} size={18} />
          </span>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="m-0 truncate font-section-title text-[20px] text-ink">{cu.name}</h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
            <span className="shrink-0">{CHANNELS[c.channel.provider].label}</span>
            {c.channel.displayName &&
              c.channel.displayName !== CHANNELS[c.channel.provider].label && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{c.channel.displayName}</span>
                </>
              )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lead && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
                style={{ background: STAGE[lead.stage].bg, color: STAGE[lead.stage].color }}
              >
                {STAGE[lead.stage].label} lead
              </span>
            )}
            {cu.isSample && (
              <span className="rounded-md bg-wash-2 px-1.5 py-0.5 text-[11.5px] text-muted">
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
          className="-mr-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fullProfileHref && (
          <div className="border-b border-line-subtle px-4 py-3">
            <Link
              href={fullProfileHref}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink no-underline transition-colors duration-150 hover:border-line-input hover:bg-wash hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              View full profile
              <ArrowUpRight size={14} aria-hidden className="text-faint" />
            </Link>
          </div>
        )}

        <Section title="Contact">
          {hasContact ? (
            <ul className="m-0 flex list-none flex-col p-0 text-[13.5px] text-ink">
              {cu.phone && (
                <ContactLine
                  icon={<Phone size={15} aria-label="Phone" />}
                  value={cu.phone}
                  href={`tel:${cu.phone}`}
                  copyLabel="phone"
                  mono
                />
              )}
              {cu.email && (
                <ContactLine
                  icon={<Mail size={15} aria-label="Email" />}
                  value={cu.email}
                  href={`mailto:${cu.email}`}
                  copyLabel="email"
                />
              )}
              {cu.handle && (
                <ContactLine
                  icon={<AtSign size={15} aria-label="Handle" />}
                  value={cu.handle.replace(/^@/, '')}
                />
              )}
              {cu.location && (
                <ContactLine
                  icon={<MapPin size={15} aria-label="Location" />}
                  value={cu.location}
                />
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
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-wash-2 px-2 py-0.5 text-xs font-medium text-ink-secondary">
                  {CONV_STATUS[c.status]}
                </span>
                {wait != null && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      wait >= 120 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                    )}
                  >
                    Waiting {fmtWait(wait)}
                  </span>
                )}
              </span>
            </Row>
            <Row label="Channel">
              <span className="flex items-center gap-2">
                <ChannelIcon channel={c.channel.provider} size={16} decorative />
                {CHANNELS[c.channel.provider].label}
              </span>
            </Row>
            <Row label="Last message">
              <span className="tabular-nums">{fmtAgo(c.lastMessageAt)}</span>
            </Row>
            <Row label="Assigned to">
              <AgentSelect
                label="Assigned agent"
                none="Unassigned"
                agents={agents}
                value={c.assignee?.id ?? ''}
                disabled={!canManage}
                onChange={(id) => onAssign(id || null)}
              />
            </Row>
          </dl>
        </Section>

        {canLeads && (
          <Section title="Lead">
            <LeadSection
              orders={orders.data?.data ?? []}
              ordersState={orders.isPending ? 'loading' : orders.isError ? 'error' : 'ready'}
              canOrders={canOrders}
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
          <Section title="Orders" count={orders.data?.meta.total}>
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
                    <li key={o.id} className="border-b border-line-subtle last:border-b-0">
                      <Link
                        href={`/orders/${o.id}`}
                        className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 text-inherit no-underline transition-colors duration-150 hover:bg-wash hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
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
                          <div className="mt-0.5">
                            <OrderStatusBadge status={o.status} />
                          </div>
                        </div>
                      </Link>
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
          <Section title="Other conversations" count={others.length}>
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
          <p
            role="status"
            className={cn(
              'm-0 mt-1.5 flex items-center gap-1.5 text-[11.5px]',
              notes !== cu.notes ? 'text-muted' : 'text-faint',
            )}
          >
            {notes !== cu.notes ? (
              <>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#9AA0AB]" />
                Unsaved · saves when you click away
              </>
            ) : (
              <>
                <Check size={12} aria-hidden />
                Saved · visible to your team only
              </>
            )}
          </p>
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

type OrderRow = NonNullable<ReturnType<typeof useCustomerOrders>['data']>['data'][number];

const TONE_DOT = {
  ok: '#16803A',
  warn: '#A15C00',
  bad: '#C53030',
  info: '#2563EB',
  neutral: '#8B8E97',
} as const;
const Dot = ({ color }: { color: string }) => (
  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
);

/**
 * Status of the customer's order, through the existing order lifecycle. Orders belong to the customer, not to a
 * lead, so with several orders there is no single order to change: those show a read-only summary instead.
 */
function OrderStatusField({ orders }: { orders: OrderRow[] }) {
  const { toast } = useShell();
  const { workspaceId: ws, can } = useWorkspace();
  const m = useOrderMutations(ws);
  if (orders.length === 0) return <span className="text-muted">No orders yet</span>;
  if (orders.length > 1)
    return (
      <span className="text-muted">
        {orders.length} orders <span className="text-faint">· set each from its order</span>
      </span>
    );
  const o = orders[0]!;
  const keys = Object.keys(STATUS_INFO) as OrderStatus[];
  const options: SearchSelectOption[] = keys.map((k) => {
    const reason =
      k === o.status
        ? null
        : k === 'CANCELLED'
          ? 'Cancel from the order page, where refunds are explained'
          : statusBlockReason(o, k);
    return {
      value: k,
      label: ORDER_STATUS_LABEL[k],
      lead: <Dot color={TONE_DOT[STATUS_INFO[k].tone]} />,
      disabled: !!reason,
      ...(reason && { hint: reason }),
    };
  });
  return (
    <SearchSelect
      label="Order status"
      hideLabel
      searchable={false}
      searchPlaceholder="Status"
      emptyText="No statuses."
      disabled={!can('orders:write') || m.setStatus.isPending}
      options={options}
      value={o.status}
      onChange={(v) =>
        m.setStatus.mutate(
          { id: o.id, status: v as Exclude<OrderStatus, 'PENDING'> },
          {
            onSuccess: () =>
              toast(`Order #${o.number} ${ORDER_STATUS_LABEL[v as OrderStatus].toLowerCase()}`),
            onError: (e) => toast(e instanceof Error ? e.message : 'Something went wrong'),
          },
        )
      }
    />
  );
}

const SOURCE_OF = { WHATSAPP: 'WHATSAPP', INSTAGRAM: 'INSTAGRAM', MESSENGER: 'MESSENGER' } as const;

/**
 * The customer's lead record: the same one the Leads Centre shows, so a stage change here appears there.
 * Changes are confirmed by the server before the toast; stage moves use the Leads module's optimistic update.
 */
function LeadSection({
  orders,
  ordersState,
  canOrders,
  c,
  lead,
  state,
  agents,
  onRetry,
}: {
  orders: OrderRow[];
  ordersState: 'loading' | 'error' | 'ready';
  canOrders: boolean;
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
          <SearchSelect
            label="Lead stage"
            hideLabel
            searchable={false}
            searchPlaceholder="Stage"
            emptyText="No stages."
            disabled={!canWrite}
            options={STAGES.map((s) => ({
              value: s.key,
              label: s.label,
              lead: <Dot color={s.color} />,
            }))}
            value={lead.stage}
            onChange={(v) => update({ stage: v as LeadStage }, 'Lead stage updated')}
          />
        </Row>
        <Row label="Owner">
          <AgentSelect
            label="Lead owner"
            none="No owner"
            agents={agents}
            value={lead.owner?.id ?? ''}
            disabled={!canWrite}
            onChange={(id) => update({ ownerId: id || null }, 'Lead owner updated')}
          />
        </Row>
        <Row label="Source">{SOURCE[lead.source].label}</Row>
        {lead.dealValue != null && (
          <Row label="Deal value">
            <span className="tabular-nums">
              {/* Stored in whole units of the workspace currency. */}
              {formatMoney(lead.dealValue * 100, workspace?.defaultCurrency ?? DEFAULT_CURRENCY)}
            </span>
          </Row>
        )}
        <Row label="Score">
          <span className="tabular-nums">{lead.score} / 100</span>
        </Row>
        {canOrders && ordersState === 'ready' && (
          <Row label="Order status">
            <OrderStatusField orders={orders} />
          </Row>
        )}
      </dl>
      <Link
        href={`/leads?lead=${encodeURIComponent(lead.id)}`}
        className="mt-2.5 inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary no-underline transition-colors duration-150 hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        View in Leads
        <ArrowUpRight size={13} aria-hidden />
      </Link>
    </>
  );
}
