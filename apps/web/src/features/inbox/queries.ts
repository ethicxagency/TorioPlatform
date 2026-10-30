'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';
import type { InboxFilters } from './types';

type ApiError = { error?: { message?: string } } | undefined;
const fail = (e: unknown, fallback: string) =>
  new Error((e as ApiError)?.error?.message ?? fallback);

export const keys = {
  conversations: (ws: string) => ['inbox', ws, 'conversations'] as const,
  list: (ws: string, f: unknown) => ['inbox', ws, 'conversations', 'list', f] as const,
  messages: (ws: string, id: string) => ['inbox', ws, 'messages', id] as const,
  savedReplies: (ws: string) => ['inbox', ws, 'saved-replies'] as const,
  members: (ws: string) => ['inbox', ws, 'members'] as const,
  search: (ws: string, q: string) => ['inbox', ws, 'search', q] as const,
};

const PROVIDERS = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const;

export function useConversationList(ws: string | null, f: InboxFilters) {
  return useQuery({
    queryKey: keys.list(ws ?? '', f),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const channel = (PROVIDERS as readonly string[]).includes(f.view)
        ? (f.view as (typeof PROVIDERS)[number])
        : undefined;
      const view =
        f.view === 'mine' || f.view === 'unassigned' || f.view === 'unread' ? f.view : 'all';
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/conversations', {
        params: {
          path: { workspaceId: ws! },
          query: {
            page: 1,
            pageSize: 100,
            status: f.status,
            view,
            order: f.order,
            ...(channel && { channel }),
            ...(f.q.trim() && { q: f.q.trim() }),
            ...(f.assigneeId && { assigneeId: f.assigneeId }),
            ...(f.tag && { tag: f.tag }),
            ...(f.priority && { priority: f.priority }),
          },
        },
      });
      if (!data) throw fail(error, 'Could not load conversations');
      return data;
    },
  });
}

export function useMessages(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: keys.messages(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}/messages',
        {
          params: {
            path: { workspaceId: ws!, conversationId: id! },
            query: { page: 1, pageSize: 200 },
          },
        },
      );
      if (!data) throw fail(error, 'Could not load messages');
      return data;
    },
  });
}

export function useMembers(ws: string | null) {
  return useQuery({
    queryKey: keys.members(ws ?? ''),
    enabled: !!ws,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/members', {
        params: { path: { workspaceId: ws! }, query: { page: 1, pageSize: 100, status: 'ACTIVE' } },
      });
      if (!data) throw fail(error, 'Could not load team');
      return data.data;
    },
  });
}

export function useSavedReplies(ws: string | null) {
  return useQuery({
    queryKey: keys.savedReplies(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/saved-replies', {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load saved replies');
      return data;
    },
  });
}

export function useGlobalSearch(ws: string | null, q: string) {
  return useQuery({
    queryKey: keys.search(ws ?? '', q),
    enabled: !!ws && q.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/search', {
        params: { path: { workspaceId: ws! }, query: { q: q.trim() } },
      });
      if (!data) throw fail(error, 'Search failed');
      return data;
    },
  });
}

type UpdateBody = ApiSchemas['UpdateConversationDto'];
type BulkBody = ApiSchemas['BulkDto'];
type SendBody = ApiSchemas['SendMessageDto'];
type CustomerBody = ApiSchemas['UpdateCustomerDto'];

/** All inbox mutations. They invalidate server state rather than guessing it (no optimistic writes except read-state). */
export function useInboxMutations(ws: string | null) {
  const qc = useQueryClient();
  const refresh = (conversationId?: string) => {
    void qc.invalidateQueries({ queryKey: keys.conversations(ws ?? '') });
    if (conversationId)
      void qc.invalidateQueries({ queryKey: keys.messages(ws ?? '', conversationId) });
  };
  const path = (conversationId: string) => ({ workspaceId: ws!, conversationId });

  return {
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
        const { data, error } = await api.PATCH(
          '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}',
          { params: { path: path(id) }, body },
        );
        if (!data) throw fail(error, 'Could not update the conversation');
        return data;
      },
      onSettled: (_d, _e, v) => refresh(v.id),
    }),
    send: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: SendBody }) => {
        const { data, error } = await api.POST(
          '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}/messages',
          { params: { path: path(id) }, body },
        );
        if (!data) throw fail(error, 'Could not send the message');
        return data;
      },
      onSettled: (_d, _e, v) => refresh(v.id),
    }),
    setRead: useMutation({
      mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
        const route = read
          ? '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}/read'
          : '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}/unread';
        const { data, error } = await api.POST(route, { params: { path: path(id) } });
        if (!data) throw fail(error, 'Could not update read state');
        return data;
      },
      onSettled: () => refresh(),
    }),
    bulk: useMutation({
      mutationFn: async (body: BulkBody) => {
        const { data, error } = await api.POST(
          '/api/v1/workspaces/{workspaceId}/conversations/bulk',
          { params: { path: { workspaceId: ws! } }, body },
        );
        if (!data) throw fail(error, 'Bulk action failed');
        return data;
      },
      onSettled: () => refresh(),
    }),
    updateCustomer: useMutation({
      mutationFn: async ({ customerId, body }: { customerId: string; body: CustomerBody }) => {
        const { data, error } = await api.PATCH(
          '/api/v1/workspaces/{workspaceId}/customers/{customerId}',
          { params: { path: { workspaceId: ws!, customerId } }, body },
        );
        if (!data) throw fail(error, 'Could not update the customer');
        return data;
      },
      onSettled: () => refresh(),
    }),
  };
}

/**
 * Live updates. The server only emits ids; we invalidate and refetch through REST, so no
 * private message content travels over the socket. Reconnects use a freshly refreshed token.
 */
export function useInboxRealtime(ws: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ws) return;
    const socket = io(`${env.NEXT_PUBLIC_API_URL}/realtime`, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
      withCredentials: true,
    });
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: keys.conversations(ws) });
      void qc.invalidateQueries({ queryKey: ['inbox', ws, 'messages'] });
    };
    socket.on('connect', () => socket.emit('workspace:join', { workspaceId: ws }));
    socket.on('system:resync', invalidate);
    for (const ev of ['message:created', 'conversation:updated', 'conversation:read'])
      socket.on(ev, invalidate);
    // Token expired (server drops us) or rejected: renew, then reconnect with the new token.
    const renew = () => void refreshSession().then((s) => s && socket.connect());
    socket.on('disconnect', (reason) => reason === 'io server disconnect' && renew());
    socket.on('connect_error', (err) => err.message === 'unauthorized' && renew());
    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [ws, qc]);
}

export function useConversation(
  ws: string | null,
  id: string | null,
  initial?: ApiSchemas['ConversationDto'],
) {
  return useQuery({
    queryKey: [...keys.conversations(ws ?? ''), 'one', id ?? ''],
    enabled: !!ws && !!id,
    ...(initial && { initialData: initial }),
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/api/v1/workspaces/{workspaceId}/conversations/{conversationId}',
        {
          params: { path: { workspaceId: ws!, conversationId: id! } },
        },
      );
      if (!data) throw fail(error, 'Could not load the conversation');
      return data;
    },
  });
}
