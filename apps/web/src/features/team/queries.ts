'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api } from '@/lib/api';
import { ApiRequestError } from '@/features/leads/queries';
import type { MemberFilters } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export const teamKeys = {
  all: (ws: string) => ['team', ws] as const,
  members: (ws: string, p: unknown) => ['team', ws, 'members', p] as const,
  summary: (ws: string) => ['team', ws, 'summary'] as const,
  member: (ws: string, id: string) => ['team', ws, 'member', id] as const,
  activity: (ws: string, id: string) => ['team', ws, 'activity', id] as const,
  invitations: (ws: string) => ['team', ws, 'invitations'] as const,
  teams: (ws: string) => ['team', ws, 'teams'] as const,
};
const P = '/api/v1/workspaces/{workspaceId}';

export interface MemberParams {
  filters: MemberFilters;
  sort: string;
  page: number;
  pageSize: number;
}

export function useTeamMembers(ws: string | null, p: MemberParams) {
  return useQuery({
    queryKey: teamKeys.members(ws ?? '', p),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const f = p.filters;
      const { data, error, response } = await api.GET(`${P}/members`, {
        params: {
          path: { workspaceId: ws! },
          query: {
            page: p.page,
            pageSize: p.pageSize,
            sort: p.sort,
            ...(f.q.trim() && { q: f.q.trim() }),
            ...(f.role && { role: f.role }),
            ...(f.status && { status: f.status }),
            ...(f.team && { team: f.team }),
          },
        },
      });
      if (!data) throw fail(error, 'Could not load members', response.status);
      return data;
    },
  });
}

export function useTeamSummary(ws: string | null) {
  return useQuery({
    queryKey: teamKeys.summary(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/team/summary`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load summary');
      return data;
    },
  });
}

export function useMemberDetail(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: teamKeys.member(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/members/{memberId}`, {
        params: { path: { workspaceId: ws!, memberId: id! } },
      });
      if (!data) throw fail(error, 'Could not load the member');
      return data;
    },
  });
}

export function useMemberActivity(ws: string | null, id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: teamKeys.activity(ws ?? '', id ?? ''),
    enabled: !!ws && !!id && enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/members/{memberId}/activity`, {
        params: { path: { workspaceId: ws!, memberId: id! } },
      });
      if (!data) throw fail(error, 'Could not load activity');
      return data.data;
    },
  });
}

export function useInvitations(ws: string | null, enabled: boolean) {
  return useQuery({
    queryKey: teamKeys.invitations(ws ?? ''),
    enabled: !!ws && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/invitations`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load invitations');
      return data.data;
    },
  });
}

export function useTeams(ws: string | null) {
  return useQuery({
    queryKey: teamKeys.teams(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/teams`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load teams');
      return data.data;
    },
  });
}

type UpdateMember = ApiSchemas['UpdateMemberDto'];
type InviteBody = ApiSchemas['InvitationInputDto'];
type TeamBody = ApiSchemas['TeamInputDto'];
type UpdateTeam = ApiSchemas['UpdateTeamDto'];

/** Permission-sensitive: no optimistic updates. The UI changes only after the server confirms, then everything is refetched. */
export function useTeamMutations(ws: string | null) {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: teamKeys.all(ws ?? '') }),
      qc.invalidateQueries({ queryKey: ['inbox', ws, 'members'] }),
    ]);
  return {
    updateMember: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateMember }) => {
        const { data, error, response } = await api.PATCH(`${P}/members/{memberId}`, {
          params: { path: { workspaceId: ws!, memberId: id } },
          body,
        });
        if (!data) throw fail(error, 'Could not update the member', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    removeMember: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(`${P}/members/{memberId}`, {
          params: { path: { workspaceId: ws!, memberId: id } },
        });
        if (!response.ok) throw fail(error, 'Could not remove the member', response.status);
      },
      onSuccess: invalidate,
    }),
    invite: useMutation({
      mutationFn: async (body: InviteBody) => {
        const { data, error, response } = await api.POST(`${P}/invitations`, {
          params: { path: { workspaceId: ws! } },
          body,
        });
        if (!data) throw fail(error, 'Could not create the invitation', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    resend: useMutation({
      mutationFn: async (id: string) => {
        const { data, error } = await api.POST(`${P}/invitations/{invitationId}/resend`, {
          params: { path: { workspaceId: ws!, invitationId: id } },
        });
        if (!data) throw fail(error, 'Could not resend the invitation');
        return data;
      },
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(`${P}/invitations/{invitationId}`, {
          params: { path: { workspaceId: ws!, invitationId: id } },
        });
        if (!response.ok) throw fail(error, 'Could not cancel the invitation', response.status);
      },
      onSuccess: invalidate,
    }),
    createTeam: useMutation({
      mutationFn: async (body: TeamBody) => {
        const { data, error, response } = await api.POST(`${P}/teams`, {
          params: { path: { workspaceId: ws! } },
          body,
        });
        if (!data) throw fail(error, 'Could not create the team', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    updateTeam: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateTeam }) => {
        const { data, error, response } = await api.PATCH(`${P}/teams/{teamId}`, {
          params: { path: { workspaceId: ws!, teamId: id } },
          body,
        });
        if (!data) throw fail(error, 'Could not update the team', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    deleteTeam: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(`${P}/teams/{teamId}`, {
          params: { path: { workspaceId: ws!, teamId: id } },
        });
        if (!response.ok) throw fail(error, 'Could not delete the team', response.status);
      },
      onSuccess: invalidate,
    }),
  };
}
