'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BrainConfig,
  BrainMaturity,
  ImportOverview as ImportOverviewT,
} from '@torio/contracts';
import { api } from '@/lib/api';
import { ApiRequestError } from '@/features/leads/queries';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError((e as ApiError)?.error?.message ?? fallback, [], status);

export interface BrainDoc {
  config: BrainConfig;
  /** The server's evaluation of this saved document. */
  maturity: BrainMaturity;
  version: number;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}
const P = '/api/v1/workspaces/{workspaceId}/brain';
export const brainKey = (ws: string) => ['brain', ws] as const;

export function useBrain(ws: string | null) {
  return useQuery({
    queryKey: brainKey(ws ?? ''),
    enabled: !!ws,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<BrainDoc> => {
      const { data, error, response } = await api.GET(P, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load Brain', response.status);
      // The server validated this document against the shared schema; the generated OpenAPI type is looser.
      return data as unknown as BrainDoc;
    },
  });
}

/** Saves the draft. Success only after the server confirms; a 409 means someone else saved first. */
export function useSaveBrain(ws: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      config,
      baseVersion,
    }: {
      config: BrainConfig;
      baseVersion: number;
    }): Promise<BrainDoc> => {
      const { data, error, response } = await api.PUT(P, {
        params: { path: { workspaceId: ws! } },
        body: { config, baseVersion } as never,
      });
      if (!data) throw fail(error, 'Could not save Brain', response.status);
      return data as unknown as BrainDoc;
    },
    onSuccess: (doc) => qc.setQueryData(brainKey(ws ?? ''), doc),
  });
}

export type ImportOverview = ImportOverviewT;

/** Import sources and recent jobs for the store. `ready` is false until the database has the import tables. */
export function useImports(ws: string | null) {
  return useQuery({
    queryKey: ['brain-imports', ws ?? ''] as const,
    enabled: !!ws,
    queryFn: async (): Promise<ImportOverviewT> => {
      const { data, error, response } = await api.GET(`${P}/imports`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load imports', response.status);
      return data as unknown as ImportOverviewT;
    },
  });
}
