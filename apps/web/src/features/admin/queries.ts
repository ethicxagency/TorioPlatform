'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { adminRequest } from '@/lib/admin-api';

export type AdminProfile = ApiSchemas['AdminProfileDto'];
export type Dashboard = ApiSchemas['AdminDashboardDto'];
export type CustomerList = ApiSchemas['AdminCustomerListDto'];
export type CustomerItem = CustomerList['data'][number];
export type CustomerDetail = ApiSchemas['AdminCustomerDetailDto'];
export type WorkspaceList = ApiSchemas['AdminWorkspaceListDto'];
export type WorkspaceItem = WorkspaceList['data'][number];
export type WorkspaceDetail = ApiSchemas['AdminWorkspaceDetailDto'];
export type SubscriptionList = ApiSchemas['AdminSubscriptionListDto'];
export type SubscriptionItem = SubscriptionList['data'][number];
export type SubscriptionDetail = ApiSchemas['AdminSubscriptionDetailDto'];
export type PlanItem = ApiSchemas['AdminPlanDto'];
export type ActivityList = ApiSchemas['AdminActivityListDto'];
export type AdminSettings = ApiSchemas['AdminSettingsDto'];
export type AdminResult = ApiSchemas['AdminResultDto'];

export const useAdminMe = () =>
  useQuery({
    queryKey: ['admin', 'me'],
    retry: false,
    staleTime: 60_000,
    queryFn: () => adminRequest<AdminProfile>('/auth/me'),
  });

/** A list query. `key` carries the filters so each filter combination is cached separately. */
export function useAdminList<T>(path: string, query: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', path, query] as QueryKey,
    placeholderData: keepPreviousData,
    queryFn: () => adminRequest<T>(path, { query }),
  });
}
export const useAdminOne = <T>(path: string, enabled = true) =>
  useQuery({ queryKey: ['admin', path], enabled, queryFn: () => adminRequest<T>(path) });

/** POST/PATCH helper that refreshes every admin query after success. */
export function useAdminAction<T = unknown, B = unknown>(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string | ((b: B) => string),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: B) =>
      adminRequest<T>(typeof path === 'function' ? path(body) : path, { method, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
