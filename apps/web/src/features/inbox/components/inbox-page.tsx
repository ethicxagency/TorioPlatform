'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { SNOOZE_OPTIONS } from '../constants';
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
} from '../queries';
import {
  DEFAULT_FILTERS,
  type Conversation,
  type InboxFilters,
  type LeadStatus,
  type ListView,
  type Message,
} from '../types';
import { ChatPanel } from './chat-panel';
import type { HeaderMenu } from './chat-header';
import { ConfirmDialog } from './confirm-dialog';
import { ConversationList } from './conversation-list';
import { CustomerProfile } from './customer-profile';
import { InboxLayout } from '../inbox-layout';
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import type { ComposerMode } from './message-composer';

const CHANNEL_PARAMS: Record<string, ListView> = {
  WHATSAPP: 'WHATSAPP',
  INSTAGRAM: 'INSTAGRAM',
  MESSENGER: 'MESSENGER',
};

export function InboxPage() {
  const shell = useShell();
  const { toast, mobile, vw, registerEscape } = shell;
  const { user } = useAuth();
  const { workspaceId: ws, can, isLoading: wsLoading, error: wsError } = useWorkspace();
  const now = useNow();
  const params = useSearchParams();
  const paramChannel = params.get('channel') ?? '';

  const [filters, setFilters] = useState<InboxFilters>(() => ({
    ...DEFAULT_FILTERS,
    view: CHANNEL_PARAMS[paramChannel] ?? 'all',
  }));
  // Sidebar sub-links (?channel=…) drive the channel chip. Derived during render, not in an effect.
  const [seenParam, setSeenParam] = useState(paramChannel);
  if (seenParam !== paramChannel) {
    setSeenParam(paramChannel);
    setFilters((f) => ({ ...f, view: CHANNEL_PARAMS[paramChannel] ?? 'all' }));
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
  const [menu, setMenu] = useState<HeaderMenu>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [modes, setModes] = useState<Record<string, ComposerMode>>({});
  const [replyTos, setReplyTos] = useState<
    Record<string, { id: string; text: string; who: string } | null>
  >({});
  const { drafts, setDraft } = useDrafts();
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
  const tags = useMemo(
    () => [...new Set(conversations.flatMap((c) => c.customer.tags))].sort(),
    [conversations],
  );

  const canManage = can('conversations:manage');
  const canReply = can('conversations:reply');
  const canEditCustomer = can('customers:update');
  const err = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong');

  const patchFilters = useCallback((patch: Partial<InboxFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    if ('status' in patch || 'view' in patch) setSelected(new Set());
  }, []);
  const clearFilters = useCallback(
    () => setFilters((f) => ({ ...DEFAULT_FILTERS, status: f.status, order: f.order })),
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

  const bulk = (action: 'ASSIGN_ME' | 'MARK_READ' | 'SNOOZE' | 'RESOLVE') => {
    if (action === 'RESOLVE' && !confirmBulk) return setConfirmBulk(true);
    const labels = {
      ASSIGN_ME: 'Assigned to you',
      MARK_READ: 'Marked as read',
      SNOOZE: 'Snoozed until tomorrow',
      RESOLVE: 'Resolved',
    };
    const until = SNOOZE_OPTIONS.find((o) => o.key === 'tomorrow')!.until(new Date());
    m.bulk.mutate(
      {
        ids: [...selected],
        action,
        ...(action === 'SNOOZE' && { snoozedUntil: until.toISOString() }),
      },
      {
        onSuccess: (r) => {
          toast(`${labels[action]} · ${r.updated} conversation${r.updated === 1 ? '' : 's'}`);
          setSelected(new Set());
          setConfirmBulk(false);
        },
        onError: (e) => {
          err(e);
          setConfirmBulk(false);
        },
      },
    );
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
      filters={filters}
      agents={agents}
      tags={tags}
      activeId={activeId}
      selected={selected}
      now={now}
      state={listState}
      fetching={list.isFetching && !list.isPending}
      errorMessage={list.error?.message}
      canManage={canManage}
      bulkBusy={m.bulk.isPending}
      onRetry={() => list.refetch()}
      onFilters={patchFilters}
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
      onSelectAll={() => setSelected(new Set(conversations.map((c) => c.id)))}
      onClearSelection={() => setSelected(new Set())}
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
      showLabels={vw - 340 - (profileOpen ? 320 : 0) >= 760}
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
      onToggleAi={() => setAiOpen((v) => !v)}
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
        onClose={profileDismiss}
        onLead={(s: LeadStatus) =>
          m.updateCustomer.mutate(
            { customerId: active.customer.id, body: { leadStatus: s } },
            { onSuccess: () => toast('Lead status updated'), onError: err },
          )
        }
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
      {shortcuts && <KeyboardShortcutsDialog onClose={() => setShortcuts(false)} />}
      {confirmBulk && (
        <ConfirmDialog
          title={`Resolve ${selected.size} conversation${selected.size === 1 ? '' : 's'}?`}
          body="They'll move to Resolved. You can reopen any of them later."
          confirmLabel="Resolve"
          busy={m.bulk.isPending}
          onConfirm={() => bulk('RESOLVE')}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </>
  );
}
