'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CatalogBulkResult,
  CatalogFeed,
  CatalogImportPreview,
  CatalogImportResult,
  CatalogList,
  CatalogListQuery,
  CatalogProduct,
  CatalogProductInput,
  CatalogProductUpdate,
  CatalogStats,
  OutboundFeed,
  OutboundFeedPreview,
  SalesChannels,
  SyncActivity,
} from '@torio/contracts';
import { ApiRequestError } from '@/features/leads/queries';
import { api } from '@/lib/api';

/**
 * The generated client types these paths and bodies from the server's OpenAPI document. The shapes below are the shared
 * contracts the server validates against, so results are cast to them (the generated types are looser).
 */
type Loose = (
  path: string,
  init?: unknown,
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') =>
  (api as unknown as Record<string, Loose>)[method]!;

const BASE = '/api/v1/workspaces/{workspaceId}/catalog';
type ApiError = { error?: { message?: string } } | undefined;

async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  ws: string,
  path: string,
  extra: { body?: unknown; query?: unknown; id?: string } = {},
): Promise<T> {
  const { data, error, response } = await call(method)(`${BASE}${path}`, {
    params: { path: { workspaceId: ws, ...(extra.id && { id: extra.id }) }, query: extra.query },
    body: extra.body,
  });
  if (response.status >= 400 || (data === undefined && !response.ok))
    throw new ApiRequestError(
      (error as ApiError)?.error?.message ?? 'Something went wrong.',
      [],
      response.status,
    );
  return data as T;
}

export const catalogKey = (ws: string) => ['catalog', ws] as const;

export function useCatalogList(ws: string | null, q: Partial<CatalogListQuery>) {
  return useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'list', q],
    enabled: !!ws,
    placeholderData: (prev) => prev,
    queryFn: () => send<CatalogList>('GET', ws!, '/products', { query: q }),
  });
}
export const useCatalogStats = (ws: string | null) =>
  useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'stats'],
    enabled: !!ws,
    queryFn: () => send<CatalogStats>('GET', ws!, '/stats'),
  });
export const useCatalogProduct = (ws: string | null, id: string | null) =>
  useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'product', id],
    enabled: !!ws && !!id,
    queryFn: () => send<CatalogProduct>('GET', ws!, '/products/{id}', { id: id! }),
  });
export const useCatalogFeeds = (ws: string | null) =>
  useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'feeds'],
    enabled: !!ws,
    queryFn: () => send<CatalogFeed[]>('GET', ws!, '/feeds'),
  });
export const useCatalogActivity = (ws: string | null) =>
  useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'activity'],
    enabled: !!ws,
    queryFn: () => send<SyncActivity[]>('GET', ws!, '/activity'),
  });
export const useSalesChannels = (ws: string | null, enabled: boolean) =>
  useQuery({
    queryKey: [...catalogKey(ws ?? ''), 'channels'],
    enabled: !!ws && enabled,
    queryFn: () => send<SalesChannels>('GET', ws!, '/channels'),
  });

export function useCatalogMutations(ws: string | null) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: catalogKey(ws ?? '') });
    // Catalog products are Brain products: the Intelligent page and the order picker must refetch too.
    void qc.invalidateQueries({ queryKey: ['brain', ws ?? ''] });
  };
  const useM = <V, R>(fn: (v: V) => Promise<R>) =>
    useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    create: useM((b: CatalogProductInput) =>
      send<CatalogProduct>('POST', ws!, '/products', { body: b }),
    ),
    update: useM((v: { id: string; body: CatalogProductUpdate }) =>
      send<CatalogProduct>('PUT', ws!, '/products/{id}', { id: v.id, body: v.body }),
    ),
    bulkStatus: useM((b: { ids: string[]; status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' }) =>
      send<CatalogBulkResult>('POST', ws!, '/products/bulk-status', { body: b }),
    ),
    bulkDelete: useM((b: { ids: string[] }) =>
      send<CatalogBulkResult>('POST', ws!, '/products/bulk-delete', { body: b }),
    ),
    preview: useMutation({
      mutationFn: (b: unknown) =>
        send<CatalogImportPreview>('POST', ws!, '/import/preview', { body: b }),
    }),
    runImport: useM((b: unknown) => send<CatalogImportResult>('POST', ws!, '/import', { body: b })),
    syncFeed: useM((id: string) =>
      send<CatalogImportResult>('POST', ws!, '/feeds/{id}/sync', { id }),
    ),
    pauseFeed: useM((id: string) => send<CatalogFeed>('POST', ws!, '/feeds/{id}/pause', { id })),
    resumeFeed: useM((id: string) => send<CatalogFeed>('POST', ws!, '/feeds/{id}/resume', { id })),
    updateFeed: useM((v: { id: string; body: unknown }) =>
      send<CatalogFeed>('PATCH', ws!, '/feeds/{id}', v),
    ),
    deleteFeed: useM((id: string) => send<unknown>('DELETE', ws!, '/feeds/{id}', { id })),
    createOutbound: useM((b: unknown) =>
      send<OutboundFeed>('POST', ws!, '/channels/feeds', { body: b }),
    ),
    updateOutbound: useM((v: { id: string; body: unknown }) =>
      send<OutboundFeed>('PATCH', ws!, '/channels/feeds/{id}', v),
    ),
    rotateOutbound: useM((id: string) =>
      send<OutboundFeed>('POST', ws!, '/channels/feeds/{id}/rotate', { id }),
    ),
    deleteOutbound: useM((id: string) =>
      send<unknown>('DELETE', ws!, '/channels/feeds/{id}', { id }),
    ),
    previewOutbound: (id: string) =>
      send<OutboundFeedPreview>('GET', ws!, '/channels/feeds/{id}/preview', { id }),
  };
}
