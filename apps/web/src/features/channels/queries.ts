'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api } from '@/lib/api';
import { ApiRequestError } from '@/features/leads/queries';
import type { ChannelFilters } from './types';

type ApiError = { error?: { message?: string } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError((e as ApiError)?.error?.message ?? fallback, [], status);

export const channelKeys = {
  all: (ws: string) => ['channels', ws] as const,
  list: (ws: string, f: unknown) => ['channels', ws, 'list', f] as const,
  summary: (ws: string) => ['channels', ws, 'summary'] as const,
  providers: (ws: string) => ['channels', ws, 'providers'] as const,
  activity: (ws: string, id: string) => ['channels', ws, 'activity', id] as const,
};
const P = '/api/v1/workspaces/{workspaceId}/channels';

export function useChannels(ws: string | null, f: ChannelFilters) {
  return useQuery({
    queryKey: channelKeys.list(ws ?? '', f),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: {
          path: { workspaceId: ws! },
          query: {
            sort: f.sort,
            ...(f.q.trim() && { q: f.q.trim() }),
            ...(f.provider && { provider: f.provider }),
            ...(f.status && { status: f.status }),
          },
        },
      });
      if (!data) throw fail(error, 'Could not load channels', response.status);
      return data.data;
    },
  });
}

export function useChannelSummary(ws: string | null) {
  return useQuery({
    queryKey: channelKeys.summary(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/summary`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load summary');
      return data;
    },
  });
}

export function useProviders(ws: string | null, enabled: boolean) {
  return useQuery({
    queryKey: channelKeys.providers(ws ?? ''),
    enabled: !!ws && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/providers`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load providers');
      return data.data;
    },
  });
}

export function useChannelActivity(ws: string | null, id: string, enabled: boolean) {
  return useQuery({
    queryKey: channelKeys.activity(ws ?? '', id),
    enabled: !!ws && enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/{channelId}/activity`, {
        params: { path: { workspaceId: ws!, channelId: id } },
      });
      if (!data) throw fail(error, 'Could not load activity');
      return data.data;
    },
  });
}

type UpdateBody = ApiSchemas['UpdateChannelDto'];
export function useChannelMutations(ws: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: channelKeys.all(ws ?? '') });
  return {
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
        const { data, error, response } = await api.PATCH(`${P}/{channelId}`, {
          params: { path: { workspaceId: ws!, channelId: id } },
          body,
        });
        if (!data) throw fail(error, 'Could not update the channel', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    disconnect: useMutation({
      mutationFn: async (id: string) => {
        const { data, error, response } = await api.POST(`${P}/{channelId}/disconnect`, {
          params: { path: { workspaceId: ws!, channelId: id } },
        });
        if (!data) throw fail(error, 'Could not disconnect the channel', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
  };
}

type ConnectWhatsAppBody = ApiSchemas['ConnectWhatsAppDto'];
/** Connects a WhatsApp Cloud API number. The server verifies it with Meta before anything is stored. */
export function useConnectWhatsApp(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ConnectWhatsAppBody) => {
      const { data, error, response } = await api.POST(`${P}/whatsapp/connect`, {
        params: { path: { workspaceId: ws! } },
        body,
      });
      if (!data) throw fail(error, 'Could not connect WhatsApp', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all(ws ?? '') }),
  });
}

export function useMetaConfig(ws: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['channels', ws ?? '', 'meta-config'] as const,
    enabled: !!ws && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/meta/config`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load Meta settings');
      return data;
    },
  });
}

/** Asks the server for the signed Meta authorization URL. The browser then goes to Meta; no token ever passes through it. */
export function useMetaStart(ws: string | null) {
  return useMutation({
    mutationFn: async (provider: 'MESSENGER' | 'INSTAGRAM') => {
      const { data, error, response } = await api.POST(`${P}/meta/start`, {
        params: { path: { workspaceId: ws! } },
        body: { provider },
      });
      if (!data) throw fail(error, 'Could not start the Meta connection', response.status);
      return data.url;
    },
  });
}

export function useMetaSession(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: ['channels', ws ?? '', 'meta-session', id] as const,
    enabled: !!ws && !!id,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/meta/sessions/{sessionId}`, {
        params: { path: { workspaceId: ws!, sessionId: id! } },
      });
      if (!data) throw fail(error, 'Could not load the authorized accounts', response.status);
      return data;
    },
  });
}

export function useMetaSelect(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { sessionId: string; candidateId: string; displayName?: string }) => {
      const { data, error, response } = await api.POST(`${P}/meta/sessions/{sessionId}/select`, {
        params: { path: { workspaceId: ws!, sessionId: a.sessionId } },
        body: { candidateId: a.candidateId, ...(a.displayName && { displayName: a.displayName }) },
      });
      if (!data) throw fail(error, 'Could not connect this account', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all(ws ?? '') }),
  });
}

export function useEmbeddedSignup(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      code: string;
      phoneNumberId: string;
      wabaId: string;
      displayName: string;
    }) => {
      const { data, error, response } = await api.POST(`${P}/whatsapp/embedded-signup`, {
        params: { path: { workspaceId: ws! } },
        body,
      });
      if (!data) throw fail(error, 'Could not finish WhatsApp setup', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all(ws ?? '') }),
  });
}

/** A real check against the provider; updates the channel's status and last-verified time. */
export function useChannelHealth(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST(`${P}/{channelId}/health`, {
        params: { path: { workspaceId: ws!, channelId: id } },
      });
      if (!data) throw fail(error, 'Could not check the connection', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all(ws ?? '') }),
  });
}
