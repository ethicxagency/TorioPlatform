'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';
import { ApiRequestError } from '@/features/leads/queries';
import type { Interval, InvoiceStatus } from './types';

type ApiError =
  { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
const fail = (e: unknown, fallback: string, status?: number) =>
  new ApiRequestError(
    (e as ApiError)?.error?.message ?? fallback,
    (e as ApiError)?.error?.details ?? [],
    status,
  );

export const billingKeys = {
  all: (ws: string) => ['billing', ws] as const,
  overview: (ws: string) => ['billing', ws, 'overview'] as const,
  plans: (ws: string) => ['billing', ws, 'plans'] as const,
  usage: (ws: string) => ['billing', ws, 'usage'] as const,
  profile: (ws: string) => ['billing', ws, 'profile'] as const,
  cards: (ws: string) => ['billing', ws, 'cards'] as const,
  invoices: (ws: string, p: unknown) => ['billing', ws, 'invoices', p] as const,
  invoice: (ws: string, id: string) => ['billing', ws, 'invoice', id] as const,
};
const P = '/api/v1/workspaces/{workspaceId}/billing';
const path = (ws: string | null) => ({ params: { path: { workspaceId: ws! } } });

export function useOverview(ws: string | null) {
  return useQuery({
    queryKey: billingKeys.overview(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error, response } = await api.GET(`${P}/overview`, path(ws));
      if (!data) throw fail(error, 'Could not load billing', response.status);
      return data;
    },
  });
}
export function usePlans(ws: string | null) {
  return useQuery({
    queryKey: billingKeys.plans(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/plans`, path(ws));
      if (!data) throw fail(error, 'Could not load plans');
      return data.data;
    },
  });
}
export function useUsage(ws: string | null) {
  return useQuery({
    queryKey: billingKeys.usage(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/usage`, path(ws));
      if (!data) throw fail(error, 'Could not load usage');
      return data;
    },
  });
}
export function useBillingProfile(ws: string | null) {
  return useQuery({
    queryKey: billingKeys.profile(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/profile`, path(ws));
      if (!data) throw fail(error, 'Could not load billing details');
      return data;
    },
  });
}
export function useCards(ws: string | null) {
  return useQuery({
    queryKey: billingKeys.cards(ws ?? ''),
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/payment-methods`, path(ws));
      if (!data) throw fail(error, 'Could not load payment methods');
      return data.data;
    },
  });
}
export function useInvoices(ws: string | null, status: '' | InvoiceStatus, page: number) {
  return useQuery({
    queryKey: billingKeys.invoices(ws ?? '', { status, page }),
    enabled: !!ws,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/invoices`, {
        params: {
          path: { workspaceId: ws! },
          query: { page, pageSize: 10, ...(status && { status }) },
        },
      });
      if (!data) throw fail(error, 'Could not load invoices');
      return data;
    },
  });
}
export function useInvoice(ws: string | null, id: string | null) {
  return useQuery({
    queryKey: billingKeys.invoice(ws ?? '', id ?? ''),
    enabled: !!ws && !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(`${P}/invoices/{id}`, {
        params: { path: { workspaceId: ws!, id: id! } },
      });
      if (!data) throw fail(error, 'Could not load the invoice');
      return data;
    },
  });
}

type Body<K extends keyof ApiSchemas> = ApiSchemas[K];
export function useBillingMutations(ws: string | null) {
  const qc = useQueryClient();
  const w = ws ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: billingKeys.all(w) });
  return {
    saveProfile: useMutation({
      mutationFn: async (body: Body<'UpdateBillingProfileDto'>) => {
        const { data, error, response } = await api.PUT(`${P}/profile`, { ...path(w), body });
        if (!data) throw fail(error, 'Could not save billing details', response.status);
        return data;
      },
      onSuccess: (d) => {
        qc.setQueryData(billingKeys.profile(w), d);
        void refresh();
      },
    }),
    preview: useMutation({
      mutationFn: async (body: Body<'PlanChangeDto'>) => {
        const { data, error, response } = await api.POST(`${P}/subscription/preview`, {
          ...path(w),
          body,
        });
        if (!data) throw fail(error, 'Could not preview this change', response.status);
        return data;
      },
    }),
    checkout: useMutation({
      mutationFn: async (body: Body<'PlanChangeDto'>) => {
        const { data, error, response } = await api.POST(`${P}/subscription/checkout`, {
          ...path(w),
          body,
        });
        if (!data) throw fail(error, 'Could not start checkout', response.status);
        return data;
      },
    }),
    change: useMutation({
      mutationFn: async (body: Body<'PlanChangeConfirmDto'>) => {
        const { data, error, response } = await api.POST(`${P}/subscription/change`, {
          ...path(w),
          body,
        });
        if (!data) throw fail(error, 'Could not change the plan', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: async (body: Body<'CancelSubscriptionDto'>) => {
        const { data, error, response } = await api.POST(`${P}/subscription/cancel`, {
          ...path(w),
          body,
        });
        if (!data) throw fail(error, 'Could not cancel the subscription', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    resume: useMutation({
      mutationFn: async () => {
        const { data, error, response } = await api.POST(`${P}/subscription/resume`, path(w));
        if (!data) throw fail(error, 'Could not reactivate the subscription', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    cardSession: useMutation({
      mutationFn: async () => {
        const { data, error, response } = await api.POST(`${P}/payment-methods/session`, path(w));
        if (!data) throw fail(error, 'Could not open the card form', response.status);
        return data;
      },
    }),
    makeDefault: useMutation({
      mutationFn: async (id: string) => {
        const { data, error, response } = await api.POST(`${P}/payment-methods/{id}/default`, {
          params: { path: { workspaceId: w, id } },
        });
        if (!data) throw fail(error, 'Could not change the default card', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    removeCard: useMutation({
      mutationFn: async (id: string) => {
        const { data, error, response } = await api.DELETE(`${P}/payment-methods/{id}`, {
          params: { path: { workspaceId: w, id } },
        });
        if (!data) throw fail(error, 'Could not remove the card', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
    retryInvoice: useMutation({
      mutationFn: async (id: string) => {
        const { data, error, response } = await api.POST(`${P}/invoices/{id}/retry`, {
          params: { path: { workspaceId: w, id } },
        });
        if (!data) throw fail(error, 'Could not retry the payment', response.status);
        return data;
      },
      onSuccess: refresh,
    }),
  };
}

export async function downloadInvoicePdf(ws: string, id: string, name: string) {
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/billing/invoices/${id}/pdf`;
  const go = (t: string | null) =>
    fetch(url, { credentials: 'include', headers: t ? { Authorization: `Bearer ${t}` } : {} });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok) throw new Error('Could not download the invoice');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = `${name.replace(/[^\w.-]/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type { Interval };
