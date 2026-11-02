'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import type { DateRange } from '@torio/contracts';
import { api } from '@/lib/api';

export type Analytics = ApiSchemas['DashboardAnalyticsDto'];

/**
 * One request per distinct (workspace, range). The query key makes concurrent changes safe: only the
 * response for the currently selected key is ever shown, and a late response for an earlier selection is ignored.
 */
export function useDashboardAnalytics(
  ws: string | null,
  r: DateRange,
  channel?: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER',
  granularity?: 'day' | 'week' | 'month',
) {
  return useQuery({
    queryKey: ['dashboard-analytics', ws, r.from, r.to, channel ?? 'all', granularity ?? 'auto'],
    enabled: !!ws,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET(
        '/api/v1/workspaces/{workspaceId}/dashboard/analytics',
        {
          params: {
            path: { workspaceId: ws! },
            query: {
              from: r.from,
              to: r.to,
              ...(channel && { channel }),
              ...(granularity && { granularity }),
            },
          },
          signal,
        },
      );
      if (!data)
        throw new Error(
          (error as { error?: { message?: string } } | undefined)?.error?.message ??
            'Could not load analytics',
        );
      return data;
    },
  });
}
