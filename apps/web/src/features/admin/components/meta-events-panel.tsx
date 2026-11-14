'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, Panel } from './common';

type Events = ApiSchemas['MetaEventListDto'];
const BASE = '/integrations/platform/torio_meta_pixel';
const TONE: Record<string, string> = {
  SENT: 'bg-success-soft text-success',
  PENDING: 'bg-wash-2 text-muted',
  FAILED: 'bg-warning-soft text-warning',
  DEAD: 'bg-danger-soft text-danger',
};
const LABEL: Record<string, string> = {
  SENT: 'Sent',
  PENDING: 'Sending',
  FAILED: 'Retrying',
  DEAD: 'Failed',
};

/** Torio's own Conversions API events: what was sent, what failed and why, and a manual retry. Tokens and raw personal data are never shown. */
export function MetaEventsPanel() {
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'integrations', 'meta-events', page],
    queryFn: () => adminRequest<Events>(`${BASE}/events`, { query: { page, pageSize: 10 } }),
  });
  const retry = useMutation({
    mutationFn: () =>
      adminRequest<{ retried: number }>(`${BASE}/events/retry`, { method: 'POST', body: {} }),
    onSuccess: (r) => {
      toast(
        r.retried ? `Retried ${r.retried} event${r.retried === 1 ? '' : 's'}` : 'Nothing to retry',
      );
      void qc.invalidateQueries({ queryKey: ['admin', 'integrations', 'meta-events'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const d = q.data;
  const failed = (d?.summary.counts.FAILED ?? 0) + (d?.summary.counts.DEAD ?? 0);
  return (
    <Panel
      title="Recent events"
      action={
        <Button
          size="sm"
          variant="outline"
          loading={retry.isPending}
          disabled={failed === 0}
          onClick={() => retry.mutate()}
        >
          Retry failed
        </Button>
      }
    >
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">{q.error.message}</Notice>}
      {d && (
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid gap-2 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-xs text-faint">Server tracking</dt>
              <dd className="m-0 font-medium">{d.summary.serverTrackingOn ? 'On' : 'Off'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Browser tracking</dt>
              <dd className="m-0 font-medium">
                {d.summary.browserTrackingOn ? 'On (after visitor consent)' : 'Off'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Last event Meta accepted</dt>
              <dd className="m-0 font-medium">
                {d.summary.lastSentAt ? fmtDateTime(d.summary.lastSentAt) : 'None yet'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Counts</dt>
              <dd className="m-0 font-medium">
                {Object.entries(d.summary.counts)
                  .map(([k, n]) => `${n} ${(LABEL[k] ?? k).toLowerCase()}`)
                  .join(' · ') || 'No events'}
              </dd>
            </div>
          </dl>
          {d.data.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              No server events yet. A verified registration sends <b>CompleteRegistration</b> once
              server tracking is on.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <caption className="sr-only">Recent Conversions API events</caption>
                <thead className="bg-[#FBFBFC] text-left text-xs text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((e) => (
                    <tr key={e.id} className="border-t border-line-subtle">
                      <td className="px-3 py-2">
                        <span className="block font-medium">{e.eventName}</span>
                        <span className="text-xs text-faint">server · {e.eventId}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {fmtDateTime(e.eventTime)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-xs font-medium',
                            TONE[e.status],
                          )}
                        >
                          {LABEL[e.status] ?? e.status}
                        </span>
                        {e.lastError && (
                          <span className="mt-0.5 block text-xs text-danger">{e.lastError}</span>
                        )}
                        {e.nextTryAt && (
                          <span className="block text-xs text-faint">
                            Next try {fmtDateTime(e.nextTryAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{e.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary disabled:cursor-not-allowed disabled:text-faint"
              >
                Previous
              </button>
              <span>
                Page {d.meta.page} of {d.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= d.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary disabled:cursor-not-allowed disabled:text-faint"
              >
                Next
              </button>
            </div>
          )}
          <p className="m-0 text-xs text-faint">
            Events carry only hashed identifiers. A failed event is retried automatically with a
            growing delay (up to five attempts), and Meta rejects events older than seven days.
            Events from Torio&apos;s own Pixel are separate from any store&apos;s Pixel. Purchase
            and checkout events arrive with SSLCommerz checkout.
          </p>
        </div>
      )}
    </Panel>
  );
}
