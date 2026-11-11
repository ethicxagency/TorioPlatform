'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roleHasPermission, type Permission } from '@torio/types';
import type { CreateStoreInput } from '@torio/contracts';
import { api } from './api';

/** A store is a workspace: one independently managed business under the person's single account. */
export const workspacesKey = ['workspaces'] as const;

/**
 * The signed-in user's stores and the active one (the server marks it: the last store they used, else the oldest),
 * with their permissions in it. `stores` is every store they can open, active first.
 */
export function useWorkspace() {
  const q = useQuery({
    queryKey: workspacesKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces');
      if (!data) throw new Error(JSON.stringify(error));
      return data;
    },
  });
  const stores = q.data ?? [];
  const workspace = stores.find((s) => s.active) ?? stores[0] ?? null;
  return {
    workspace,
    workspaceId: workspace?.id ?? null,
    role: workspace?.role ?? null,
    stores,
    /** UI hint only — the API enforces permissions on every request. */
    can: (p: Permission) => (workspace ? roleHasPermission(workspace.role, p) : false),
    isLoading: q.isPending,
    error: q.error,
  };
}

/**
 * After the active store changes, nothing from the previous store may linger: every cached query except the store
 * list itself is dropped, so each screen refetches under the new store (their keys also carry the store id).
 */
function resetStoreScopedCache(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({ predicate: (query) => query.queryKey[0] !== workspacesKey[0] });
}

export function useSwitchStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await api.PUT('/api/v1/workspaces/active', { body: { workspaceId } });
      if (!data) throw new Error(JSON.stringify(error));
      return data;
    },
    onSuccess: (stores) => {
      resetStoreScopedCache(qc);
      qc.setQueryData(workspacesKey, stores);
    },
  });
}

export class StoreFormError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
    readonly status = 0,
  ) {
    super(message);
  }
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateStoreInput) => {
      const { data, error, response } = await api.POST('/api/v1/workspaces', {
        body: body as never,
      });
      if (!data) {
        const e = error as
          | { error?: { message?: string; details?: { path: string; message: string }[] } }
          | undefined;
        const fields: Record<string, string> = {};
        for (const d of e?.error?.details ?? [])
          fields[d.path.split('.').pop() ?? d.path] = d.message;
        throw new StoreFormError(
          response.status === 409
            ? 'This store address is already taken.'
            : (e?.error?.message ?? 'Could not create the store. Try again.'),
          fields,
          response.status,
        );
      }
      return data;
    },
    onSuccess: () => {
      resetStoreScopedCache(qc);
      return qc.invalidateQueries({ queryKey: workspacesKey });
    },
  });
}

export async function checkStoreSlug(slug: string) {
  const { data } = await api.GET('/api/v1/workspaces/slug-check', { params: { query: { slug } } });
  return data ?? null;
}
