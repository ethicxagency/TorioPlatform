'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';
import { DATE_RANGES } from '@/features/leads/constants';
import { ApiRequestError } from '@/features/leads/queries';
import type { CustomerFilters, CustomerSort } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export const customerKeys = {
  all: (ws: string) => ['customers', ws] as const,
  list: (ws: string, p: unknown) => ['customers', ws, 'list', p] as const,
  summary: (ws: string) => ['customers', ws, 'summary'] as const,
  one: (ws: string, id: string) => ['customers', ws, 'one', id] as const,
  notes: (ws: string, id: string) => ['customers', ws, 'notes', id] as const,
  activity: (ws: string, id: string) => ['customers', ws, 'activity', id] as const,
  conversations: (ws: string, id: string) => ['customers', ws, 'conversations', id] as const,
};

export interface CustomerListParams {
  filters: CustomerFilters;
  sort: CustomerSort;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function customerFilterQuery(f: CustomerFilters) {
  const days = DATE_RANGES.find((r) => r.key === f.range)?.days;
  return {
    ...(f.q.trim() && { q: f.q.trim() }),
    ...(f.status && { status: f.status }),
    ...(f.sources.length && { sources: f.sources.join(',') }),
    ...(f.owner && { owner: f.owner }),
    ...(f.tag && { tag: f.tag }),
    segment: f.segment,
    ...(days && { createdFrom: new Date(Date.now() - days * 86_400_000).toISOString() }),
  };
}

const P = '/api/v1/workspaces/{workspaceId}/customers';

export function useCustomers(ws: string | null, p: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(ws ?? '', p),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: {
          path: { workspaceId: ws! },
          query: {
            ...customerFilterQuery(p.filters),
            sort: p.sort,
            dir: p.dir,
            page: p.page,
            pageSize: p.pageSize,
          },
        },
      });
      if (!data) throw fail(error, 'Could not load customers', response.status);
      return data;
    },
  });
}

export function useCustomerSummary(ws: string | null) {
  return useQuery({
    queryKey: customerKeys.summary(ws ?? ''),
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

export function useCustomer(
  ws: string | null,
  id: string | null,
  initial?: ApiSchemas['CustomerItemDto'],
) {
  return useQuery({
    queryKey: customerKeys.one(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    ...(initial && { initialData: initial }),
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/{customerId}`, {
        params: { path: { workspaceId: ws!, customerId: id! } },
      });
      if (!data) throw fail(error, 'Could not load the customer');
      return data;
    },
  });
}

export function useCustomerNotes(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: customerKeys.notes(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/{customerId}/notes`, {
        params: { path: { workspaceId: ws!, customerId: id! } },
      });
      if (!data) throw fail(error, 'Could not load notes');
      return data.data;
    },
  });
}

export function useCustomerActivity(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: customerKeys.activity(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/{customerId}/activity`, {
        params: { path: { workspaceId: ws!, customerId: id! } },
      });
      if (!data) throw fail(error, 'Could not load activity');
      return data.data;
    },
  });
}

export function useCustomerConversations(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: customerKeys.conversations(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/{customerId}/conversations`, {
        params: { path: { workspaceId: ws!, customerId: id! } },
      });
      if (!data) throw fail(error, 'Could not load conversations');
      return data.data;
    },
  });
}

type CreateBody = ApiSchemas['CreateCustomerDto'];
type UpdateBody = ApiSchemas['UpdateCustomerDto'];
type BulkBody = ApiSchemas['CustomerBulkDto'];

export function useCustomerMutations(ws: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    // Tag edits change the workspace tag list used by the Inbox and Customers filters too.
    void qc.invalidateQueries({ queryKey: ['inbox', ws ?? '', 'conversations', 'tags'] });
    return qc.invalidateQueries({ queryKey: customerKeys.all(ws ?? '') });
  };
  const path = (customerId: string) => ({ workspaceId: ws!, customerId });
  return {
    create: useMutation({
      mutationFn: async (body: CreateBody) => {
        const { data, error, response } = await api.POST(P, {
          params: { path: { workspaceId: ws! } },
          body,
        });
        if (!data) throw fail(error, 'Could not save the customer', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
        const { data, error, response } = await api.PATCH(`${P}/{customerId}`, {
          params: { path: path(id) },
          body,
        });
        if (!data) throw fail(error, 'Could not update the customer', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(`${P}/{customerId}`, {
          params: { path: path(id) },
        });
        if (!response.ok) throw fail(error, 'Could not delete the customer', response.status);
      },
      onSuccess: invalidate,
    }),
    addNote: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }) => {
        const { data, error } = await api.POST(`${P}/{customerId}/notes`, {
          params: { path: path(id) },
          body: { body },
        });
        if (!data) throw fail(error, 'Could not add the note');
        return data.data;
      },
      onSuccess: invalidate,
    }),
    editNote: useMutation({
      mutationFn: async ({ id, noteId, body }: { id: string; noteId: string; body: string }) => {
        const { data, error } = await api.PATCH(`${P}/{customerId}/notes/{noteId}`, {
          params: { path: { ...path(id), noteId } },
          body: { body },
        });
        if (!data) throw fail(error, 'Could not edit the note');
        return data.data;
      },
      onSuccess: invalidate,
    }),
    deleteNote: useMutation({
      mutationFn: async ({ id, noteId }: { id: string; noteId: string }) => {
        const { data, error } = await api.DELETE(`${P}/{customerId}/notes/{noteId}`, {
          params: { path: { ...path(id), noteId } },
        });
        if (!data) throw fail(error, 'Could not delete the note');
        return data.data;
      },
      onSuccess: invalidate,
    }),
    bulk: useMutation({
      mutationFn: async (body: BulkBody) => {
        const { data, error, response } = await api.POST(`${P}/bulk`, {
          params: { path: { workspaceId: ws! } },
          body,
        });
        if (!data) throw fail(error, 'Bulk action failed', response.status);
        return data;
      },
      onSuccess: invalidate,
    }),
    importRows: useMutation({
      mutationFn: async (rows: Record<string, string>[]) => {
        const { data, error } = await api.POST(`${P}/import`, {
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

export async function downloadCustomersCsv(ws: string, filters: CustomerFilters, ids?: string[]) {
  const qs = new URLSearchParams(
    Object.entries({
      ...customerFilterQuery(filters),
      ...(ids?.length && { ids: ids.join(',') }),
    }).map(([k, v]) => [k, String(v)]),
  );
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/customers/export?${qs}`;
  const go = (t: string | null) =>
    fetch(url, { credentials: 'include', headers: t ? { Authorization: `Bearer ${t}` } : {} });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok)
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'You do not have permission to export customers'
        : 'Export failed',
    );
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `torio-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
