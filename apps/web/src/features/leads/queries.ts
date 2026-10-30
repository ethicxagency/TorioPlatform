'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';
import { DATE_RANGES } from './constants';
import type { Lead, LeadFilters, LeadSortField } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly details: { path: string; message: string }[] = [],
    readonly status?: number,
  ) {
    super(message);
  }
}
const fail = (e: unknown, fallback: string, status?: number) => {
  const err = (e as ApiError)?.error;
  return new ApiRequestError(err?.message ?? fallback, err?.details ?? [], status);
};

export const leadKeys = {
  all: (ws: string) => ['leads', ws] as const,
  list: (ws: string, p: unknown) => ['leads', ws, 'list', p] as const,
  summary: (ws: string) => ['leads', ws, 'summary'] as const,
  one: (ws: string, id: string) => ['leads', ws, 'one', id] as const,
  activities: (ws: string, id: string) => ['leads', ws, 'activities', id] as const,
};

export interface ListParams {
  filters: LeadFilters;
  sort: LeadSortField;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/** Translates UI filter state into API query params (shared by list and export). */
export function filterQuery(f: LeadFilters) {
  const days = DATE_RANGES.find((r) => r.key === f.range)?.days;
  return {
    ...(f.q.trim() && { q: f.q.trim() }),
    ...(f.stages.length && { stages: f.stages.join(',') }),
    ...(f.sources.length && { sources: f.sources.join(',') }),
    ...(f.owner && { owner: f.owner }),
    ...(f.tag && { tag: f.tag }),
    ...(days && { createdFrom: new Date(Date.now() - days * 86_400_000).toISOString() }),
    ...(f.minScore && { minScore: Number(f.minScore) }),
  };
}

export function useLeads(ws: string | null, p: ListParams) {
  return useQuery({
    queryKey: leadKeys.list(ws ?? '', p),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/workspaces/{workspaceId}/leads', {
        params: {
          path: { workspaceId: ws! },
          query: {
            ...filterQuery(p.filters),
            sort: p.sort,
            dir: p.dir,
            page: p.page,
            pageSize: p.pageSize,
          },
        },
      });
      if (!data) throw fail(error, 'Could not load leads', response.status);
      return data;
    },
  });
}

export function useLeadSummary(ws: string | null) {
  return useQuery({
    queryKey: leadKeys.summary(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/leads/summary', {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load summary');
      return data;
    },
  });
}

export function useLead(ws: string | null, id: string | null, initial?: Lead) {
  return useQuery({
    queryKey: leadKeys.one(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    ...(initial && { initialData: initial }),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces/{workspaceId}/leads/{leadId}', {
        params: { path: { workspaceId: ws!, leadId: id! } },
      });
      if (!data) throw fail(error, 'Could not load the lead');
      return data;
    },
  });
}

export function useLeadActivities(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: leadKeys.activities(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(
        '/api/v1/workspaces/{workspaceId}/leads/{leadId}/activities',
        { params: { path: { workspaceId: ws!, leadId: id! } } },
      );
      if (!data) throw fail(error, 'Could not load activity');
      return data.data;
    },
  });
}

type CreateBody = ApiSchemas['CreateLeadDto'];
type UpdateBody = ApiSchemas['UpdateLeadDto'];
type BulkBody = ApiSchemas['LeadBulkDto'];

export function useLeadMutations(ws: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: leadKeys.all(ws ?? '') });
  const path = (leadId: string) => ({ workspaceId: ws!, leadId });

  return {
    create: useMutation({
      mutationFn: async (body: CreateBody) => {
        const { data, error, response } = await api.POST('/api/v1/workspaces/{workspaceId}/leads', {
          params: { path: { workspaceId: ws! } },
          body,
        });
        if (!data) throw fail(error, 'Could not save the lead', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    /** Optimistically patches cached lists for quick stage moves; rolls back if the server rejects. */
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
        const { data, error, response } = await api.PATCH(
          '/api/v1/workspaces/{workspaceId}/leads/{leadId}',
          { params: { path: path(id) }, body },
        );
        if (!data) throw fail(error, 'Could not update the lead', response.status);
        return data;
      },
      onMutate: async ({ id, body }) => {
        if (!body.stage || Object.keys(body).length !== 1) return undefined;
        await qc.cancelQueries({ queryKey: ['leads', ws, 'list'] });
        const snapshot = qc.getQueriesData<{ data: Lead[] }>({ queryKey: ['leads', ws, 'list'] });
        qc.setQueriesData<{ data: Lead[] }>({ queryKey: ['leads', ws, 'list'] }, (old) =>
          old
            ? {
                ...old,
                data: old.data.map((l) => (l.id === id ? { ...l, stage: body.stage! } : l)),
              }
            : old,
        );
        return { snapshot } as { snapshot: [QueryKey, { data: Lead[] } | undefined][] };
      },
      onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
      onSettled: invalidate,
    }),
    addNote: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }) => {
        const { data, error } = await api.POST(
          '/api/v1/workspaces/{workspaceId}/leads/{leadId}/notes',
          { params: { path: path(id) }, body: { body } },
        );
        if (!data) throw fail(error, 'Could not add the note');
        return data.data;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(
          '/api/v1/workspaces/{workspaceId}/leads/{leadId}',
          { params: { path: path(id) } },
        );
        if (!response.ok) throw fail(error, 'Could not delete the lead', response.status);
      },
      onSuccess: invalidate,
    }),
    bulk: useMutation({
      mutationFn: async (body: BulkBody) => {
        const { data, error, response } = await api.POST(
          '/api/v1/workspaces/{workspaceId}/leads/bulk',
          { params: { path: { workspaceId: ws! } }, body },
        );
        if (!data) throw fail(error, 'Bulk action failed', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    importRows: useMutation({
      mutationFn: async (rows: Record<string, string>[]) => {
        const { data, error } = await api.POST('/api/v1/workspaces/{workspaceId}/leads/import', {
          params: { path: { workspaceId: ws! } },
          body: { rows },
        });
        if (!data) throw fail(error, 'Import failed');
        return data;
      },
      onSuccess: invalidate,
    }),
  };
}

/** Downloads a CSV from the server (respects the caller's permissions). Pass ids to export a selection. */
export async function downloadLeadsCsv(ws: string, filters: LeadFilters, ids?: string[]) {
  const qs = new URLSearchParams(
    Object.entries({ ...filterQuery(filters), ...(ids?.length && { ids: ids.join(',') }) }).map(
      ([k, v]) => [k, String(v)],
    ),
  );
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/leads/export?${qs}`;
  const go = (token: string | null) =>
    fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok)
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'You do not have permission to export leads'
        : 'Export failed',
    );
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `torio-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
