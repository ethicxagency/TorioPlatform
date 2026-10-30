'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api } from '@/lib/api';
import { ApiRequestError } from '@/features/leads/queries';
import { PAGE_SIZE } from './constants';
import type { DirectoryFilters } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export const autoKeys = {
  all: (ws: string) => ['automation', ws] as const,
  list: (ws: string, p: unknown) => ['automation', ws, 'list', p] as const,
  summary: (ws: string) => ['automation', ws, 'summary'] as const,
  one: (ws: string, id: string) => ['automation', ws, 'one', id] as const,
  runs: (ws: string, p: unknown) => ['automation', ws, 'runs', p] as const,
  run: (ws: string, id: string) => ['automation', ws, 'run', id] as const,
};
const P = '/api/v1/workspaces/{workspaceId}/automations';

export function useAutomations(
  ws: string | null,
  f: DirectoryFilters,
  status: string[],
  page: number,
) {
  return useQuery({
    queryKey: autoKeys.list(ws ?? '', { f, status, page }),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: {
          path: { workspaceId: ws! },
          query: {
            sort: f.sort,
            dir: f.dir,
            page,
            pageSize: PAGE_SIZE,
            ...(f.q.trim() && { q: f.q.trim() }),
            ...(f.trigger && { trigger: f.trigger }),
            ...(status.length && { status: status.join(',') }),
          },
        },
      });
      if (!data) throw fail(error, 'Could not load automations', response.status);
      return data;
    },
  });
}

export function useAutomationSummary(ws: string | null) {
  return useQuery({
    queryKey: autoKeys.summary(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/summary`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load metrics');
      return data;
    },
  });
}

export function useAutomation(ws: string | null, id: string) {
  return useQuery({
    queryKey: autoKeys.one(ws ?? '', id),
    enabled: !!ws,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/{automationId}`, {
        params: { path: { workspaceId: ws!, automationId: id } },
      });
      if (!data) throw fail(error, 'Could not load this automation', response.status);
      return data;
    },
  });
}

export function useExecutions(
  ws: string | null,
  p: { status: string[]; automationId: string; page: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: autoKeys.runs(ws ?? '', p),
    enabled: !!ws && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/executions`, {
        params: {
          path: { workspaceId: ws! },
          query: {
            page: p.page,
            pageSize: PAGE_SIZE,
            ...(p.automationId && { automationId: p.automationId }),
            ...(p.status.length && { status: p.status.join(',') }),
          },
        },
      });
      if (!data) throw fail(error, 'Could not load run history', response.status);
      return data;
    },
  });
}

export function useExecution(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: autoKeys.run(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/executions/{executionId}`, {
        params: { path: { workspaceId: ws!, executionId: id! } },
      });
      if (!data) throw fail(error, 'Could not load this run');
      return data;
    },
  });
}

export type CreateBody = ApiSchemas['CreateAutomationDto'];
export type UpdateBody = ApiSchemas['UpdateAutomationDto'];

export function useAutomationMutations(ws: string | null) {
  const qc = useQueryClient();
  const w = ws ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: autoKeys.all(w) });
  const settle = (a: ApiSchemas['AutomationDetailDto']) => {
    qc.setQueryData(autoKeys.one(w, a.id), a);
    void refresh();
  };
  const ids = (id: string) => ({ params: { path: { workspaceId: w, automationId: id } } });
  const out = (
    r: { data?: ApiSchemas['AutomationDetailDto']; error?: unknown; response: Response },
    fallback: string,
  ) => {
    if (!r.data) throw fail(r.error, fallback, r.response.status);
    return r.data;
  };
  const publish = async (id: string) =>
    out(await api.POST(`${P}/{automationId}/publish`, ids(id)), 'Could not activate');
  const deactivate = async (id: string) =>
    out(await api.POST(`${P}/{automationId}/deactivate`, ids(id)), 'Could not deactivate');
  const duplicate = async (id: string) =>
    out(await api.POST(`${P}/{automationId}/duplicate`, ids(id)), 'Could not duplicate');
  return {
    create: useMutation({
      mutationFn: async (body: CreateBody) => {
        const { data, error, response } = await api.POST(P, {
          params: { path: { workspaceId: w } },
          body,
        });
        if (!data) throw fail(error, 'Could not create the automation', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
        const { data, error, response } = await api.PATCH(`${P}/{automationId}`, {
          ...ids(id),
          body,
        });
        if (!data) throw fail(error, 'Could not save', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    publish: useMutation({ mutationFn: publish, onSuccess: settle }),
    deactivate: useMutation({ mutationFn: deactivate, onSuccess: settle }),
    duplicate: useMutation({ mutationFn: duplicate, onSuccess: settle }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error, response } = await api.DELETE(`${P}/{automationId}`, ids(id));
        if (!response.ok) throw fail(error, 'Could not delete the automation', response.status);
      },
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: async ({
        id,
        sample,
      }: {
        id: string;
        sample: Record<string, string | number | boolean | string[]>;
      }) => {
        const { data, error, response } = await api.POST(`${P}/{automationId}/test`, {
          ...ids(id),
          body: { sample },
        });
        if (!data) throw fail(error, 'The test could not run', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: async (executionId: string) => {
        const { data, error, response } = await api.POST(`${P}/executions/{executionId}/retry`, {
          params: { path: { workspaceId: w, executionId } },
        });
        if (!data) throw fail(error, 'Could not retry this run', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
  };
}
