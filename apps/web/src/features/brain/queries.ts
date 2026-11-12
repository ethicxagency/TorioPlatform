'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BrainConfig,
  BrainMaturity,
  FeedCreateInput,
  FeedPreview,
  ImportJobDetail,
  ImportOverview as ImportOverviewT,
  ImportRecordView,
  ImportResult,
  MetaCatalogList,
  MetaCatalogStatus,
  ProductReview,
  Provenance,
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
      void qc.invalidateQueries({ queryKey: ['brain-provenance', ws] });
    },
  });
}

// ---------- XML feed ----------

export function usePreviewFeed(ws: string) {
  return useMutation({
    mutationFn: async (b: {
      url: string;
      mapping?: Record<string, string>;
      currency?: string;
    }): Promise<FeedPreview> => {
      const { data, error, response } = await api.POST(`${I}/feed/preview`, {
        params: { path: { workspaceId: ws } },
        body: b as never,
      });
      if (!data) throw fail(error, 'Could not read the feed', response.status);
      return data as unknown as FeedPreview;
    },
  });
}

export function useCreateFeed(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: FeedCreateInput): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(`${I}/feed`, {
        params: { path: { workspaceId: ws } },
        body: b as never,
      });
      if (!data) throw fail(error, 'Could not connect the feed', response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scanKey(ws) }),
  });
}

export function useSourceAction(ws: string, action: 'sync' | 'disconnect') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data, error, response } = await api.POST(`${I}/sources/{sourceId}/${action}`, {
        params: { path: { workspaceId: ws, sourceId } },
      });
      if (!data) throw fail(error, `Could not ${action}`, response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scanKey(ws) }),
  });
}

// ---------- Meta Catalog and Google Merchant Center (same shape, different provider) ----------

export type CatalogProvider = 'meta' | 'google';
const ENDPOINT = {
  meta: { list: 'catalogs', pick: 'catalog' },
  google: { list: 'accounts', pick: 'account' },
} as const;
const at = (p: CatalogProvider, rest = '') => `${I}/${p}${rest}`;
const metaKey = (ws: string, p: CatalogProvider) => ['brain-catalog-source', p, ws] as const;

export function useCatalogSource(ws: string | null, p: CatalogProvider) {
  return useQuery({
    queryKey: metaKey(ws ?? '', p),
    enabled: !!ws,
    queryFn: async (): Promise<MetaCatalogStatus> => {
      const { data, error, response } = await api.GET(
        at(p) as never,
        { params: { path: { workspaceId: ws! } } } as never,
      );
      if (!data) throw fail(error, 'Could not load the connection', response.status);
      return data as unknown as MetaCatalogStatus;
    },
  });
}

export function useCatalogConnect(ws: string, p: CatalogProvider) {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const { data, error, response } = await api.POST(
        at(p, '/connect') as never,
        { params: { path: { workspaceId: ws } } } as never,
      );
      if (!data) throw fail(error, 'Could not start the connection', response.status);
      return data as unknown as { url: string };
    },
  });
}

export function useCatalogList(ws: string, p: CatalogProvider, enabled: boolean) {
  return useQuery({
    queryKey: ['brain-catalog-list', p, ws] as const,
    enabled,
    retry: false,
    queryFn: async (): Promise<MetaCatalogList> => {
      const { data, error, response } = await api.GET(
        at(p, `/${ENDPOINT[p].list}`) as never,
        { params: { path: { workspaceId: ws } } } as never,
      );
      if (!data) throw fail(error, 'Could not list what this account has', response.status);
      return data as unknown as MetaCatalogList;
    },
  });
}

export function useCatalogSelect(ws: string, p: CatalogProvider) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { catalogId: string; name: string }) => {
      const { data, error, response } = await api.POST(
        at(p, `/${ENDPOINT[p].pick}`) as never,
        { params: { path: { workspaceId: ws } }, body: v } as never,
      );
      if (!data) throw fail(error, 'Could not choose that one', response.status);
      return data as unknown as MetaCatalogStatus;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: metaKey(ws, p) }),
  });
}

export function useCatalogPreview(ws: string, p: CatalogProvider) {
  return useMutation({
    mutationFn: async (): Promise<FeedPreview> => {
      const { data, error, response } = await api.POST(
        at(p, '/preview') as never,
        { params: { path: { workspaceId: ws } } } as never,
      );
      if (!data) throw fail(error, 'Could not read the products', response.status);
      return data as unknown as FeedPreview;
    },
  });
}

export function useCatalogSync(ws: string, p: CatalogProvider) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(
        at(p, '/sync') as never,
        { params: { path: { workspaceId: ws } } } as never,
      );
      if (!data) throw fail(error, 'Could not start the sync', response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: scanKey(ws) });
      void qc.invalidateQueries({ queryKey: metaKey(ws, p) });
    },
  });
}

export function useCatalogDisconnect(ws: string, p: CatalogProvider) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        at(p, '/disconnect') as never,
        { params: { path: { workspaceId: ws } } } as never,
      );
      if (!data) throw fail(error, 'Could not disconnect', response.status);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: metaKey(ws, p) });
      void qc.invalidateQueries({ queryKey: scanKey(ws) });
    },
  });
}

// ---------- product review across sources ----------

const reviewKey = (ws: string) => ['brain-product-review', ws] as const;

export function useProductReview(ws: string | null) {
  return useQuery({
    queryKey: reviewKey(ws ?? ''),
    enabled: !!ws,
    queryFn: async (): Promise<ProductReview> => {
      const { data, error, response } = await api.GET(`${I}/products`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load products waiting for review', response.status);
      return data as unknown as ProductReview;
    },
  });
}

function useReviewInvalidate(ws: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: reviewKey(ws) });
    void qc.invalidateQueries({ queryKey: scanKey(ws) });
    void qc.invalidateQueries({ queryKey: ['brain-import-records', ws] });
    void qc.invalidateQueries({ queryKey: ['brain-provenance', ws] });
  };
}

export function useProductStatus(ws: string) {
  const done = useReviewInvalidate(ws);
  return useMutation({
    mutationFn: async (v: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }) => {
      const { data, error, response } = await api.PATCH(`${I}/records/{recordId}`, {
        params: { path: { workspaceId: ws, recordId: v.id } },
        body: { status: v.status },
      });
      if (!data) throw fail(error, 'Could not update the product', response.status);
      return data;
    },
    onSuccess: done,
  });
}

export function useResolveProduct(ws: string) {
  const done = useReviewInvalidate(ws);
  return useMutation({
    mutationFn: async (b: {
      recordIds: string[];
      winnerId: string | null;
      fields: Record<string, string>;
      updateBrain: boolean;
    }) => {
      const { data, error, response } = await api.POST(`${I}/products/resolve`, {
        params: { path: { workspaceId: ws } },
        body: b as never,
      });
      if (!data) throw fail(error, 'Could not settle that product', response.status);
      return data;
    },
    onSuccess: done,
  });
}

export function useApproveClear(ws: string) {
  const done = useReviewInvalidate(ws);
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(`${I}/products/approve-clear`, {
        params: { path: { workspaceId: ws } },
      });
      if (!data) throw fail(error, 'Could not approve', response.status);
      return data as unknown as { updated: number };
    },
    onSuccess: done,
  });
}

export function useImportProducts(ws: string) {
  const done = useReviewInvalidate(ws);
  return useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const { data, error, response } = await api.POST(`${I}/products/import`, {
        params: { path: { workspaceId: ws } },
      });
      if (!data) throw fail(error, 'Could not import', response.status);
      return data as unknown as ImportResult;
    },
    onSuccess: done,
  });
}

/** Where imported products and FAQs came from. Empty until something has been imported. */
export function useProvenance(ws: string | null) {
  return useQuery({
    queryKey: ['brain-provenance', ws ?? ''] as const,
    enabled: !!ws,
    staleTime: 30_000,
    queryFn: async (): Promise<Provenance> => {
      const { data, error, response } = await api.GET(`${I}/provenance`, {
        params: { path: { workspaceId: ws! } },
      });
      if (!data) throw fail(error, 'Could not load where knowledge came from', response.status);
      return data as unknown as Provenance;
    },
  });
}

// ---------- CSV file import ----------

export function useCsvPreview(ws: string) {
  return useMutation({
    mutationFn: async (b: {
      type: 'products' | 'faqs';
      csv: string;
      mapping?: Record<string, string>;
      currency?: string;
    }): Promise<FeedPreview> => {
      const { data, error, response } = await api.POST(`${I}/csv/preview`, {
        params: { path: { workspaceId: ws } },
        body: b as never,
      });
      if (!data) throw fail(error, 'Could not read the file', response.status);
      return data as unknown as FeedPreview;
    },
  });
}

export function useCsvCreate(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: {
      type: 'products' | 'faqs';
      csv: string;
      name: string;
      mapping?: Record<string, string>;
      currency?: string;
    }): Promise<ImportJobDetail> => {
      const { data, error, response } = await api.POST(`${I}/csv`, {
        params: { path: { workspaceId: ws } },
        body: b as never,
      });
      if (!data) throw fail(error, 'Could not import the file', response.status);
      return data as unknown as ImportJobDetail;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: scanKey(ws) }),
  });
}
