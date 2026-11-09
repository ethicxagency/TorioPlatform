'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { LIST_WIDTH } from '../constants';
import { orderSummaryText, snoozeLabel } from '../format';
import { useDrafts } from '../use-drafts';
import { useInboxShortcuts } from '../use-inbox-shortcuts';
import { useNow } from '../use-now';
import {
  useConversation,
  useConversationList,
  useInboxMutations,
  useInboxRealtime,
  useMembers,
  useMessages,
  useSavedReplies,
  useWorkspaceTags,
} from '../queries';
import {
  DEFAULT_FILTERS,
  type Conversation,
  type InboxFilters,
  type Provider,
  type Message,
} from '../types';
import { ChatPanel } from './chat-panel';
import type { HeaderMenu } from './chat-header';
import { ConfirmDialog } from './confirm-dialog';
import type { BulkRequest } from './bulk-actions-toolbar';
import { ConversationList } from './conversation-list';
import { CreateOrderModal } from './create-order-modal';
import { CustomerProfile } from './customer-profile';
import { formatMoney } from '@torio/contracts';
import { useOrderMutations } from '@/features/orders/queries';
import { InboxLayout } from '../inbox-layout';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import type { ComposerMode } from './message-composer';

const CHANNEL_PARAMS: Record<string, Provider> = {
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  MESSENGER: 'MESSENGER',
};

export function InboxPage() {
  const shell = useShell();
  const { toast, mobile, contentWidth, registerEscape } = shell;
  const { user } = useAuth();
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const now = useNow();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paramChannel = params.get('channel') ?? '';

  const [filters, setFilters] = useState<InboxFilters>(() => ({
    ...DEFAULT_FILTERS,
    channel: CHANNEL_PARAMS[paramChannel] ?? '',
  }));
  // ?channel=… (sidebar sub-links and the channel tabs) drives the channel filter. Derived during render, not in an effect.
  const [seenParam, setSeenParam] = useState(paramChannel);
  if (seenParam !== paramChannel) {
    setSeenParam(paramChannel);
    setFilters((f) => ({ ...f, channel: CHANNEL_PARAMS[paramChannel] ?? '' }));
  }

  const paramConv = params.get('conversation');
  const [activeId, setActiveId] = useState<string | null>(paramConv);
  const [seenConv, setSeenConv] = useState(paramConv);
  if (seenConv !== paramConv) {
    setSeenConv(paramConv);
    if (paramConv) setActiveId(paramConv);
  }
  const [profileOpen, setProfileOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState(false);
  const [menu, setMenu] = useState<HeaderMenu>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [modes, setModes] = useState<Record<string, ComposerMode>>({});
  const [replyTos, setReplyTos] = useState<
    Record<string, { id: string; text: string; who: string } | null>
  >({});
  const { drafts, setDraft } = useDrafts();
  const orderMutations = useOrderMutations(ws);
  const [orderFor, setOrderFor] = useState<Conversation | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const list = useConversationList(ws, filters);
  const members = useMembers(ws);
  const savedReplies = useSavedReplies(ws);
  const m = useInboxMutations(ws);
  useInboxRealtime(ws);
  const { mutate: markRead } = m.setRead;

  const conversations = useMemo(() => list.data?.data ?? [], [list.data]);
  const fromList = conversations.find((c) => c.id === activeId);
  const one = useConversation(ws, activeId, fromList);
  const active: Conversation | null = one.data ?? fromList ?? null;
  const messages = useMessages(ws, activeId);

  const agents = useMemo(
    () => (members.data ?? []).map((x) => ({ id: x.userId, name: x.name })),
    [members.data],
  );
  const canManage = can('conversations:manage');
  const canReadCustomers = can('customers:read');
  const workspaceTags = useWorkspaceTags(canReadCustomers ? ws : null);
  // Without customers:read the tag list falls back to the tags on the loaded conversations.
  const tags = useMemo(
    () =>
      canReadCustomers
        ? (workspaceTags.data ?? [])
        : [...new Set(conversations.flatMap((c) => c.customer.tags))].sort(),
    [canReadCustomers, workspaceTags.data, conversations],
  );
  // A selection only ever covers conversations still in the list (filters, realtime and resolves move them).
  const selection = useMemo(() => {
    const visible = new Set(conversations.map((c) => c.id));
    return new Set([...selected].filter((id) => visible.has(id)));
  }, [selected, conversations]);
  const canReply = can('conversations:reply');
  const canEditCustomer = can('customers:update');
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  const patchFilters = useCallback((patch: Partial<InboxFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    if ('status' in patch || 'view' in patch || 'channel' in patch) setSelected(new Set());
  }, []);
  // Channel tabs write ?channel= so the sidebar's channel links and a reload agree with the list.
  const changeChannel = useCallback(
    (channel: '' | Provider) => {
      patchFilters({ channel });
      const next = new URLSearchParams(params.toString());
      if (channel) next.set('channel', channel);
      else next.delete('channel');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, patchFilters, router],
  );
  const clearFilters = useCallback(
    // The channel tab is navigation, not a filter: clearing keeps it, as it keeps status and sort.
    () =>
      setFilters((f) => ({
        ...DEFAULT_FILTERS,
        status: f.status,
        order: f.order,
        channel: f.channel,
      })),
    [],
  );

  const focusComposer = () => setTimeout(() => composerRef.current?.focus(), 30);

  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      setMenu(null);
      const c = conversations.find((x) => x.id === id);
      if (c && c.unreadCount > 0) markRead({ id, read: true });
    },
    [conversations, markRead],
  );

  /** X: closes the panel only. Never touches conversation status. */
  const closeChat = () => {
    setActiveId(null);
    setProfileOpen(false);
    setMenu(null);
  };

  const order = conversations.map((c) => c.id);
  const step = (dir: 1 | -1) => {
    if (!order.length) return;
    const i = activeId ? order.indexOf(activeId) : -1;
    openConversation(order[Math.max(0, Math.min(order.length - 1, i < 0 ? 0 : i + dir))]!);
  };
  const advanceFrom = (id: string) => {
    const rest = order.filter((x) => x !== id);
    if (!rest.length) return closeChat();
    openConversation(rest[Math.min(Math.max(order.indexOf(id), 0), rest.length - 1)]!);
  };

  const update = (
    id: string,
    body: Parameters<typeof m.update.mutate>[0]['body'],
    okMsg: string,
    after?: () => void,
  ) =>
    m.update.mutate(
      { id, body },
      {
        onSuccess: () => {
          toast(okMsg);
          after?.();
        },
        onError: err,
      },
    );

  const actions = {
    assign: (agentId: string | null) => {
      if (!activeId) return;
      setMenu(null);
      update(activeId, { assigneeId: agentId }, agentId ? 'Assigned' : 'Unassigned');
    },
    snooze: (until: Date) => {
      if (!activeId) return;
      setMenu(null);
      const id = activeId;
      update(
        id,
        { status: 'SNOOZED', snoozedUntil: until.toISOString() },
        'Snoozed',
        () => filters.status === 'OPEN' && advanceFrom(id),
      );
    },
    resolveToggle: () => {
      if (!active || !canManage) return;
      const id = active.id;
      if (active.status === 'RESOLVED')
        return update(id, { status: 'OPEN' }, 'Conversation reopened');
      update(
        id,
        { status: 'RESOLVED' },
        `Resolved ${active.customer.name}`,
        () => filters.status === 'OPEN' && advanceFrom(id),
      );
    },
    urgent: () => {
      if (!active) return;
      setMenu(null);
      update(
        active.id,
        { priority: active.priority === 'HIGH' ? 'NORMAL' : 'HIGH' },
        active.priority === 'HIGH' ? 'Urgent removed' : 'Marked as urgent',
      );
    },
    unread: () => {
      if (!activeId) return;
      setMenu(null);
      m.setRead.mutate(
        { id: activeId, read: false },
        {
          onSuccess: () => {
            toast('Marked as unread');
            if (mobile) closeChat();
          },
          onError: err,
        },
      );
    },
  };

  const send = () => {
    if (!activeId || !active) return;
    const id = activeId;
    const mode = modes[id] ?? 'reply';
    const body = (drafts[id] ?? '').trim();
    if (!body) return;
    m.send.mutate(
      {
        id,
        body: {
          kind: mode === 'note' ? 'NOTE' : 'REPLY',
          body,
          ...(replyTos[id] && mode === 'reply' && { replyToId: replyTos[id]!.id }),
        },
      },
      {
        onSuccess: () => {
          setDraft(id, '');
          setReplyTos((r) => ({ ...r, [id]: null }));
          if (mode === 'note') toast('Internal note added — only your team can see it');
        },
        onError: err,
      },
    );
  };

  const bulk = (req: BulkRequest) => {
    if (req.action === 'RESOLVE' && !confirmBulk) return setConfirmBulk(true);
    const ids = [...selection];
    if (!ids.length) return;
    const agentName = (id: string | null) =>
      id === null
        ? null
        : id === user?.id
          ? 'you'
          : (agents.find((a) => a.id === id)?.name ?? 'agent');
    const label =
      req.action === 'ASSIGN'
        ? req.assigneeId
          ? `Assigned to ${agentName(req.assigneeId)}`
          : 'Unassigned'
        : req.action === 'MARK_READ'
          ? 'Marked as read'
          : req.action === 'MARK_UNREAD'
            ? 'Marked as unread'
            : req.action === 'SET_PRIORITY'
              ? `Priority set to ${req.priority === 'HIGH' ? 'urgent' : req.priority.toLowerCase()}`
              : req.action === 'SNOOZE'
                ? `Snoozed until ${snoozeLabel(req.until.toISOString())}`
                : 'Resolved';
    m.bulk.mutate(
      {
        ids,
        action: req.action,
        ...(req.action === 'ASSIGN' && { assigneeId: req.assigneeId }),
        ...(req.action === 'SET_PRIORITY' && { priority: req.priority }),
        ...(req.action === 'SNOOZE' && { snoozedUntil: req.until.toISOString() }),
      },
      {
        onSuccess: (r) => {
          // The API skips ids that no longer exist in this workspace; say so instead of hiding it.
          const skipped = ids.length - r.updated;
          toast(
            `${label} · ${r.updated} conversation${r.updated === 1 ? '' : 's'}` +
              (skipped > 0 ? ` · ${skipped} no longer available` : ''),
          );
          setSelected(new Set());
          setConfirmBulk(false);
        },
        onError: (e) => {
          // Nothing was changed; keep the selection so the action can be retried.
          err(e);
          setConfirmBulk(false);
        },
      },
    );
  };
  const toggleManage = () => {
    setManaging((v) => !v);
    setSelected(new Set());
  };

  const profileDismiss = useCallback(() => setProfileOpen(false), []);
  useEffect(
    () =>
      registerEscape(() => {
        setMenu(null);
        setShortcuts(false);
        setConfirmBulk(false);
        setProfileOpen(false);
      }),
    [registerEscape],
  );

  useInboxShortcuts({
    next: () => step(1),
    prev: () => step(-1),
    hasActive: !!active,
    reply: () => {
      if (activeId) {
        setModes((x) => ({ ...x, [activeId]: 'reply' }));
        focusComposer();
      }
    },
    note: () => {
      if (activeId) {
        setModes((x) => ({ ...x, [activeId]: 'note' }));
        focusComposer();
      }
    },
    resolve: actions.resolveToggle,
    snooze: () => canManage && setMenu((v) => (v === 'snooze' ? null : 'snooze')),
    assign: () => canManage && setMenu((v) => (v === 'assign' ? null : 'assign')),
    profile: () => setProfileOpen((v) => !v),
    help: () => setShortcuts(true),
  });

  // --- render ---
  if (wsLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  if (wsError || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );

  const listState = list.isPending ? 'loading' : list.isError && !list.data ? 'error' : 'ready';
  const mode = activeId ? (modes[activeId] ?? 'reply') : 'reply';

  const listNode = (
    <ConversationList
      conversations={conversations}
      counts={list.data?.counts}
      channelCounts={list.data?.channelCounts}
      filters={filters}
      agents={agents}
      agentsLoading={members.isPending}
      tags={tags}
      tagsLoading={canReadCustomers && workspaceTags.isPending}
      meId={user?.id ?? ''}
      activeId={activeId}
      selected={selection}
      now={now}
      state={listState}
      fetching={list.isFetching && !list.isPending}
      errorMessage={list.error?.message}
      canManage={canManage}
      managing={managing && canManage}
      bulkBusy={m.bulk.isPending}
      onRetry={() => list.refetch()}
      onFilters={patchFilters}
      onChannel={changeChannel}
      onClearFilters={clearFilters}
      onOpen={openConversation}
      onToggle={(id) =>
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        })
      }
      onManage={toggleManage}
      onToggleAll={() =>
        setSelected(
          selection.size === conversations.length
            ? new Set()
            : new Set(conversations.map((c) => c.id)),
        )
      }
      onBulk={bulk}
    />
  );

  const chatNode = active ? (
    <ChatPanel
      ref={composerRef}
      c={active}
      agents={agents}
      meId={user?.id ?? ''}
      canManage={canManage}
      canReply={canReply}
      onShowProfile={() => setProfileOpen(true)}
      assigning={
        m.update.isPending &&
        m.update.variables?.id === active.id &&
        m.update.variables.body.assigneeId !== undefined
      }
      savedReplies={savedReplies.data ?? []}
      messages={messages.data?.data}
      messagesLoading={messages.isPending}
      messagesError={messages.error?.message}
      onRetryMessages={() => messages.refetch()}
      mode={mode}
      draft={drafts[active.id] ?? ''}
      replyTo={replyTos[active.id] ?? null}
      sending={m.send.isPending}
      aiOpen={aiOpen}
      profileOpen={profileOpen}
      showBack={mobile}
      // The list's default width decides how much room the chat really has.
      showLabels={contentWidth - LIST_WIDTH.default - (profileOpen ? 320 : 0) >= 560}
      menu={menu}
      onMenu={setMenu}
      onBack={closeChat}
      onAssign={actions.assign}
      onSnooze={actions.snooze}
      onResolveToggle={actions.resolveToggle}
      onToggleUrgent={actions.urgent}
      onMarkUnread={actions.unread}
      onToggleProfile={() => setProfileOpen((v) => !v)}
      onCloseChat={closeChat}
      onMode={(x) => {
        setModes((s) => ({ ...s, [active.id]: x }));
        focusComposer();
      }}
      onDraft={(t) => setDraft(active.id, t)}
      onSend={send}
      onReplyTo={(msg: Message) => {
        setReplyTos((r) => ({
          ...r,
          [active.id]: {
            id: msg.id,
            text: msg.body,
            who: msg.kind === 'OUTBOUND' ? 'You' : active.customer.name,
          },
        }));
        setModes((s) => ({ ...s, [active.id]: 'reply' }));
        focusComposer();
      }}
      onClearReplyTo={() => setReplyTos((r) => ({ ...r, [active.id]: null }))}
      onCopy={(msg) => {
        void navigator.clipboard?.writeText(msg.body).then(
          () => toast('Message copied'),
          () => toast("Couldn't copy"),
        );
      }}
      onRetrySend={
        canReply
          ? (msg) =>
              m.retry.mutate(
                { id: active.id, messageId: msg.id },
                {
                  onSuccess: (r) =>
                    toast(
                      r.result === 'sent' ? 'Message sent' : 'Still not delivered — see the reason',
                    ),
                  onError: err,
                },
              )
          : undefined
      }
      onToggleAi={() => setAiOpen((v) => !v)}
      onCreateOrder={can('orders:write') ? () => setOrderFor(active) : undefined}
    />
  ) : null;

  const profileNode =
    active && profileOpen ? (
      <CustomerProfile
        key={active.customer.id}
        c={active}
        agents={agents}
        canEditCustomer={canEditCustomer}
        canManage={canManage}
        fullProfileHref={
          can('customers:read')
            ? `/customers?customer=${encodeURIComponent(active.customer.id)}`
            : undefined
        }
        onClose={profileDismiss}
        onTags={(t) =>
          m.updateCustomer.mutate(
            { customerId: active.customer.id, body: { tags: t } },
            { onError: err },
          )
        }
        onNotes={(n) =>
          m.updateCustomer.mutate(
            { customerId: active.customer.id, body: { notes: n } },
            { onSuccess: () => toast('Notes saved'), onError: err },
          )
        }
        onAssign={actions.assign}
        onOpenConversation={openConversation}
      />
    ) : null;

  return (
    <>
      <InboxLayout
        list={listNode}
        chat={chatNode}
        profile={profileNode}
        onProfileDismiss={profileDismiss}
      />
      {orderFor && (
        <CreateOrderModal
          c={orderFor}
          offerSummary={canReply}
          onClose={() => setOrderFor(null)}
          onCreate={async (body, { addSummary }) => {
            const o = await orderMutations.create.mutateAsync(body);
            const id = orderFor.id;
            setOrderFor(null);
            toast(`Order #${o.number} created`);
            if (addSummary) {
              const prev = (drafts[id] ?? '').trimEnd();
              setDraft(id, (prev ? `${prev}\n\n` : '') + orderSummaryText(o, formatMoney));
              if (id === activeId) focusComposer();
            }
          }}
        />
      )}
      {shortcuts && <KeyboardShortcutsDialog onClose={() => setShortcuts(false)} />}
      {confirmBulk && (
        <ConfirmDialog
          title={`Resolve ${selection.size} conversation${selection.size === 1 ? '' : 's'}?`}
          body="They'll move to Resolved. You can reopen any of them later."
          confirmLabel="Resolve"
          busy={m.bulk.isPending}
          onConfirm={() => bulk({ action: 'RESOLVE' })}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </>
  );
}
