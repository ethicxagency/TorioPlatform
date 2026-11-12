'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BrainConfig,
  BrainMaturity,
  ImportJobDetail,
  ImportOverview as ImportOverviewT,
  ImportRecordView,
  ImportResult,
  WebsiteScanInput,
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

// ---------- website scan ----------

const I = `${P}/imports`;
const scanKey = (ws: string) => ['brain-imports', ws] as const;

export function useStartScan(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: WebsiteScanInput): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(`${I}/website`, {
        params: { path: { workspaceId: ws } },
        body: b,
      });
      if (!data) throw fail(error, 'Could not start the scan', response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scanKey(ws) }),
  });
}

export function useScanJob(ws: string, jobId: string | null) {
  return useQuery({
    queryKey: ['brain-import-job', ws, jobId] as const,
    enabled: !!jobId,
    queryFn: async (): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.GET(`${I}/jobs/{jobId}`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
      });
      if (!data) throw fail(error, 'Could not load the scan', response.status);
      return data as unknown as ImportJobDetail;
    },
  });
}

/** One time-boxed step of an active scan; the page calls it in a loop until the scan is no longer active. */
export function useScanStep(ws: string, jobId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(`${I}/jobs/{jobId}/step`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
      });
      if (!data) throw fail(error, 'The scan could not continue', response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: (d) => {
      qc.setQueryData(['brain-import-job', ws, jobId], d);
      if (d.job.status !== 'RUNNING' && d.job.status !== 'QUEUED') {
        void qc.invalidateQueries({ queryKey: scanKey(ws) });
        void qc.invalidateQueries({ queryKey: ['brain-import-records', ws, jobId] });
      }
    },
  });
}

function useJobAction(ws: string, jobId: string | null, action: 'cancel' | 'retry') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(`${I}/jobs/{jobId}/${action}`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
      });
      if (!data) throw fail(error, `Could not ${action} the scan`, response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scanKey(ws) }),
  });
}
export const useCancelScan = (ws: string, jobId: string | null) =>
  useJobAction(ws, jobId, 'cancel');
export const useRetryScan = (ws: string, jobId: string | null) => useJobAction(ws, jobId, 'retry');

export function useScanRecords(ws: string, jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['brain-import-records', ws, jobId] as const,
    enabled: !!jobId && enabled,
    queryFn: async (): Promise<ImportRecordView[]> => {
      const { data, error, response } = await api.GET(`${I}/jobs/{jobId}/records`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
      });
      if (!data) throw fail(error, 'Could not load what the scan found', response.status);
      return (data as unknown as { data: ImportRecordView[] }).data;
    },
  });
}

export function useReviewRecord(ws: string, jobId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED';
      data?: Record<string, string>;
    }) => {
      const { data, error, response } = await api.PATCH(`${I}/records/{recordId}`, {
        params: { path: { workspaceId: ws, recordId: v.id } },
        body: { status: v.status, data: v.data },
      });
      if (!data) throw fail(error, 'Could not update the entry', response.status);
      return data as unknown as ImportRecordView;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain-import-records', ws, jobId] }),
  });
}

export function useBulkReview(ws: string, jobId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      categories?: ('business' | 'product' | 'faq' | 'policy')[];
    }) => {
      const { data, error, response } = await api.POST(`${I}/jobs/{jobId}/records/review`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
        body: v,
      });
      if (!data) throw fail(error, 'Could not update the entries', response.status);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain-import-records', ws, jobId] }),
  });
}

export function useImportApproved(ws: string, jobId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const { data, error, response } = await api.POST(`${I}/jobs/{jobId}/import`, {
        params: { path: { workspaceId: ws, jobId: jobId! } },
        body: {},
      });
      if (!data) throw fail(error, 'Could not import', response.status);
      return data as unknown as ImportResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['brain-import-records', ws, jobId] });
      void qc.invalidateQueries({ queryKey: scanKey(ws) });
    },
  });
}
