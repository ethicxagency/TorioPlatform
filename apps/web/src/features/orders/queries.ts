'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';
import { DATE_RANGES } from '@/features/leads/constants';
import { ApiRequestError } from '@/features/leads/queries';
import { parseMinor } from './money';
import type { OrderDetail, OrderFilters, OrderSort } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export const orderKeys = {
  all: (ws: string) => ['orders', ws] as const,
  list: (ws: string, p: unknown) => ['orders', ws, 'list', p] as const,
  summary: (ws: string, range: string) => ['orders', ws, 'summary', range] as const,
  one: (ws: string, id: string) => ['orders', ws, 'one', id] as const,
};
const P = '/api/v1/workspaces/{workspaceId}/orders';

export interface OrderListParams {
  filters: OrderFilters;
  sort: OrderSort;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/** Period start for the selected range (computed per request so "last 7 days" stays current). */
export const rangeStart = (r: OrderFilters['range']) => {
  const days = DATE_RANGES.find((x) => x.key === r)?.days;
  return days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
};

export function orderFilterQuery(f: OrderFilters) {
  const min = f.min ? parseMinor(f.min) : null;
  const max = f.max ? parseMinor(f.max) : null;
  const from = rangeStart(f.range);
  return {
    ...(f.q.trim() && { q: f.q.trim() }),
    ...(f.status.length && { status: f.status.join(',') }),
    ...(f.paymentStatus.length && { paymentStatus: f.paymentStatus.join(',') }),
    ...(f.fulfillmentStatus.length && { fulfillmentStatus: f.fulfillmentStatus.join(',') }),
    ...(f.channel && { channel: f.channel }),
    ...(f.method && { paymentMethod: f.method }),
    ...(from && { createdFrom: from }),
    ...(min !== null && { minTotal: min }),
    ...(max !== null && { maxTotal: max }),
  };
}

export function useOrders(ws: string | null, p: OrderListParams) {
  return useQuery({
    queryKey: orderKeys.list(ws ?? '', p),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: {
          path: { workspaceId: ws! },
          query: {
            ...orderFilterQuery(p.filters),
            sort: p.sort,
            dir: p.dir,
            page: p.page,
            pageSize: p.pageSize,
          },
        },
      });
      if (!data) throw fail(error, 'Could not load orders', response.status);
      return data;
    },
  });
}

/** A customer's most recent orders (newest first), for compact summaries such as the Inbox side panel. */
export function useCustomerOrders(ws: string | null, customerId: string | null, enabled = true) {
  return useQuery({
    queryKey: orderKeys.list(ws ?? '', { customerId }),
    enabled: !!ws && !!customerId && enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET(P, {
        params: {
          path: { workspaceId: ws! },
          query: { customerId: customerId!, sort: 'createdAt', dir: 'desc', page: 1, pageSize: 5 },
        },
      });
      if (!data) throw fail(error, 'Could not load orders', response.status);
      return data;
    },
  });
}

export function useOrderSummary(ws: string | null, range: OrderFilters['range']) {
  return useQuery({
    queryKey: orderKeys.summary(ws ?? '', range),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = rangeStart(range);
      const { data, error } = await api.GET(`${P}/summary`, {
        params: { path: { workspaceId: ws! }, query: { ...(from && { createdFrom: from }) } },
      });
      if (!data) throw fail(error, 'Could not load order metrics');
      return data;
    },
  });
}

export function useOrder(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: orderKeys.one(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/{orderId}`, {
        params: { path: { workspaceId: ws!, orderId: id! } },
      });
      if (!data) throw fail(error, 'Could not load the order', response.status);
      return data;
    },
  });
}

type Body<K extends keyof ApiSchemas> = ApiSchemas[K];
export type CreateOrderBody = Body<'CreateOrderDto'>;
export type UpdateOrderBody = Body<'UpdateOrderDto'>;
export type PaymentBody = Body<'RecordPaymentDto'>;
export type FulfillmentBody = Body<'SetFulfillmentDto'>;
export type OrderStatusTarget = Body<'SetOrderStatusDto'>['status'];

export function useOrderMutations(ws: string | null) {
  const qc = useQueryClient();
  const w = ws ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: orderKeys.all(w) });
  /** Mutations that return the fresh order write it to the detail cache, then refresh lists and KPIs. */
  const settle = (o: OrderDetail) => {
    qc.setQueryData(orderKeys.one(w, o.id), o);
    void refresh();
  };
  const ids = (id: string) => ({ params: { path: { workspaceId: w, orderId: id } } });
  return {
    create: useMutation({
      mutationFn: async (body: CreateOrderBody) => {
        const { data, error, response } = await api.POST(P, {
          params: { path: { workspaceId: w } },
          body,
        });
        if (!data) throw fail(error, 'Could not create the order', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: UpdateOrderBody }) => {
        const { data, error, response } = await api.PATCH(`${P}/{orderId}`, {
          ...ids(id),
          body,
        });
        if (!data) throw fail(error, 'Could not update the order', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: OrderStatusTarget }) => {
        const { data, error, response } = await api.POST(`${P}/{orderId}/status`, {
          ...ids(id),
          body: { status },
        });
        if (!data) throw fail(error, 'Could not change the status', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    recordPayment: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: PaymentBody }) => {
        const { data, error, response } = await api.POST(`${P}/{orderId}/payments`, {
          ...ids(id),
          body,
        });
        if (!data) throw fail(error, 'Could not record the payment', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    setFulfillment: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: FulfillmentBody }) => {
        const { data, error, response } = await api.PUT(`${P}/{orderId}/fulfillment`, {
          ...ids(id),
          body,
        });
        if (!data) throw fail(error, 'Could not update fulfillment', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    addNote: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }) => {
        const { data, error, response } = await api.POST(`${P}/{orderId}/notes`, {
          ...ids(id),
          body: { body },
        });
        if (!data) throw fail(error, 'Could not add the note', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    updateNote: useMutation({
      mutationFn: async ({ id, noteId, body }: { id: string; noteId: string; body: string }) => {
        const { data, error, response } = await api.PATCH(`${P}/{orderId}/notes/{noteId}`, {
          params: { path: { workspaceId: w, orderId: id, noteId } },
          body: { body },
        });
        if (!data) throw fail(error, 'Could not save the note', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    removeNote: useMutation({
      mutationFn: async ({ id, noteId }: { id: string; noteId: string }) => {
        const { data, error, response } = await api.DELETE(`${P}/{orderId}/notes/{noteId}`, {
          params: { path: { workspaceId: w, orderId: id, noteId } },
        });
        if (!data) throw fail(error, 'Could not delete the note', response.status);
        return data;
      },
      onSuccess: settle,
    }),
    bulk: useMutation({
      mutationFn: async (body: Body<'OrderBulkDto'>) => {
        const { data, error, response } = await api.POST(`${P}/bulk`, {
          params: { path: { workspaceId: w } },
          body,
        });
        if (!data) throw fail(error, 'Could not update the orders', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
  };
}

export async function downloadOrdersCsv(ws: string, filters: OrderFilters, ids?: string[]) {
  const qs = new URLSearchParams(
    Object.entries({
      ...orderFilterQuery(filters),
      ...(ids?.length && { ids: ids.join(',') }),
    }).map(([k, v]) => [k, String(v)]),
  );
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/orders/export?${qs}`;
  const go = (t: string | null) =>
    fetch(url, { credentials: 'include', headers: t ? { Authorization: `Bearer ${t}` } : {} });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok)
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'You do not have permission to export orders'
        : 'Export failed',
    );
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `torio-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** The order's invoice PDF, rendered by the server from the live order. Named by the server (TORIO-INV-00001.pdf). */
export async function fetchInvoicePdf(
  ws: string,
  orderId: string,
  download = false,
): Promise<{ blob: Blob; filename: string }> {
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/orders/${orderId}/invoice${download ? '?download=1' : ''}`;
  const go = (t: string | null) =>
    fetch(url, { credentials: 'include', headers: t ? { Authorization: `Bearer ${t}` } : {} });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok) {
    let msg = '';
    try {
      msg =
        ((await res.json()) as { message?: string; error?: { message?: string } }).message ?? '';
    } catch {
      /* not JSON */
    }
    throw new Error(
      res.status === 403
        ? 'You do not have permission to print invoices'
        : res.status === 404
          ? 'This order was not found'
          : msg || 'Could not create the invoice',
    );
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1];
  return { blob: await res.blob(), filename: name ?? 'TORIO-invoice.pdf' };
}

/** Saves the invoice PDF through the browser. */
export async function downloadInvoice(ws: string, orderId: string) {
  const { blob, filename } = await fetchInvoicePdf(ws, orderId, true);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * Opens the browser's print dialog for the invoice only (never the order screen). The PDF loads in a hidden frame; if the
 * browser will not print from a frame it opens in a new tab instead, where its PDF viewer can print and save.
 */
export async function printInvoice(ws: string, orderId: string) {
  const { blob } = await fetchInvoicePdf(ws, orderId);
  const href = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(href);
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(cleanup, 120_000);
    } catch {
      window.open(href, '_blank', 'noopener');
      setTimeout(cleanup, 120_000);
    }
  };
  frame.src = href;
  document.body.appendChild(frame);
}
