'use client';

import { useQuery } from '@tanstack/react-query';
import { roleHasPermission, type Permission } from '@torio/types';
import { api } from './api';

/** The signed-in user's active workspace (first membership for now) and their permissions in it. */
export function useWorkspace() {
  const q = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workspaces');
      if (!data) throw new Error(JSON.stringify(error));
      return data;
    },
  });
  const workspace = q.data?.[0] ?? null;
  return {
    workspace,
    workspaceId: workspace?.id ?? null,
    role: workspace?.role ?? null,
    /** UI hint only — the API enforces permissions on every request. */
    can: (p: Permission) => (workspace ? roleHasPermission(workspace.role, p) : false),
    isLoading: q.isPending,
    error: q.error,
  };
}
