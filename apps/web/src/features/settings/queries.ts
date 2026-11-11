'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkspaceTimeZone } from '@/lib/datetime';
import { ApiRequestError } from '@/features/leads/queries';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export type Profile = ApiSchemas['ProfileDto'];
export type SessionInfo = ApiSchemas['SessionListDto']['data'][number];
export type AuditEntry = ApiSchemas['AuditListDto']['data'][number];
export type ProfileBody = ApiSchemas['UpdateProfileDto'];
export type WorkspaceBody = ApiSchemas['UpdateWorkspaceDto'];

export const settingsKeys = {
  profile: ['profile'] as const,
  sessions: ['sessions'] as const,
  audit: (ws: string, p: unknown) => ['audit', ws, p] as const,
};

export function useProfile() {
  const { status } = useAuth();
  return useQuery({
    queryKey: settingsKeys.profile,
    enabled: status === 'authed',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/users/me');
      if (!data) throw fail(error, 'Could not load your profile', response.status);
      return data;
    },
  });
}

/** The workspace's time zone: every member sees the same dates and times, whatever their browser says. */
export const useTimeZone = () => useWorkspaceTimeZone() ?? undefined;

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { patchUser } = useAuth();
  return useMutation({
    mutationFn: async (body: ProfileBody) => {
      const { data, error, response } = await api.PATCH('/api/v1/users/me', { body });
      if (!data) throw fail(error, 'Could not save your profile', response.status);
      return data;
    },
    onSuccess: (p) => {
      qc.setQueryData(settingsKeys.profile, p);
      patchUser({ name: p.name });
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const { data, error, response } = await api.POST('/api/v1/users/me/password', { body });
      if (!data) throw fail(error, 'Could not change your password', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.sessions }),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: settingsKeys.sessions,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/sessions');
      if (!data) throw fail(error, 'Could not load your devices');
      return data.data;
    },
  });
}

export function useSessionMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: settingsKeys.sessions });
  return {
    revoke: useMutation({
      mutationFn: async (id: string) => {
        const { data, error, response } = await api.DELETE(
          '/api/v1/users/me/sessions/{sessionId}',
          {
            params: { path: { sessionId: id } },
          },
        );
        if (!data) throw fail(error, 'Could not sign that device out', response.status);
        return data;
      },
      onSuccess: done,
    }),
    revokeOthers: useMutation({
      mutationFn: async () => {
        const { data, error, response } = await api.POST('/api/v1/users/me/sessions/revoke-others');
        if (!data) throw fail(error, 'Could not sign the other devices out', response.status);
        return data;
      },
      onSuccess: done,
    }),
  };
}

export function useUpdateWorkspace(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkspaceBody) => {
      const { data, error, response } = await api.PATCH('/api/v1/workspaces/{workspaceId}', {
        params: { path: { workspaceId: ws! } },
        body,
      });
      if (!data) throw fail(error, 'Could not save the workspace', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useAudit(ws: string | null, p: { page: number; q: string; pageSize?: number }) {
  return useQuery({
    queryKey: settingsKeys.audit(ws ?? '', p),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/workspaces/{workspaceId}/audit', {
        params: {
          path: { workspaceId: ws! },
          query: { page: p.page, pageSize: p.pageSize ?? 25, ...(p.q.trim() && { q: p.q.trim() }) },
        },
      });
      if (!data) throw fail(error, 'Could not load the audit log', response.status);
      return data;
    },
  });
}

/** Downloads the caller's own account data as JSON. Nothing is claimed until the server has returned it. */
export async function downloadMyData() {
  const { data, error, response } = await api.GET('/api/v1/users/me/export');
  if (!data) throw fail(error, 'Could not export your data', response.status);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `torio-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type PrivacyRequest = ApiSchemas['MineDto']['data'][number];

/** The signed-in person's own privacy requests (today: account deletion), newest first. */
export function usePrivacyRequests() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['privacy-requests'] as const,
    enabled: status === 'authed',
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/account-deletion/my-requests');
      if (!data) throw fail(error, 'Could not load your privacy requests', response.status);
      return data.data;
    },
  });
}

/** Asks for deletion. With a password the request is verified at once; without one an emailed link confirms it. */
export function useRequestDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { password?: string; reason?: string }) => {
      const { data, error, response } = await api.POST('/api/v1/account-deletion/requests/me', {
        body: { ...b, confirm: true },
      });
      if (!data)
        throw fail(
          error,
          response.status === 401
            ? 'That password is not correct.'
            : 'The request could not be created. Try again shortly.',
          response.status,
        );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['privacy-requests'] }),
  });
}
