'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@torio/api-client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, Panel } from './common';

type List = ApiSchemas['GatewayTxListDto'];
const BASE = '/integrations/platform/sslcommerz';
const TONE: Record<string, string> = {
  PAID: 'bg-success-soft text-success',
  FAILED: 'bg-danger-soft text-danger',
  REJECTED: 'bg-warning-soft text-warning',
  REVIEW: 'bg-warning-soft text-warning',
};
const money = (minor: number, cur: string) =>
  `${cur} ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/** SSLCommerz payments across every workspace, with the reason for each failure and a reconcile that asks the gateway again. */
export function GatewayTransactions() {
  const qc = useQueryClient();
  const { toast } = useAdminShell();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['admin', 'integrations', 'ssl-tx', status, page],
    queryFn: () =>
      adminRequest<List>(`${BASE}/transactions`, {
        query: { page, pageSize: 10, ...(status ? { status } : {}) },
      }),
  });
  const reconcile = useMutation({
    mutationFn: (tranId: string) =>
      adminRequest<ApiSchemas['GatewayTxDto']>(`${BASE}/transactions/${tranId}/reconcile`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (t) => {
      toast(`${t.tranId}: ${t.status.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ['admin', 'integrations', 'ssl-tx'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <Panel title="Recent payments">
      {q.isPending && <Loading />}
      {q.isError && <Notice tone="bad">{q.error.message}</Notice>}
      {d && (
        <div className="flex flex-col gap-3">
          <label className="flex w-fit items-center gap-2 text-xs text-muted">
            Show
            <FieldSelect
              aria-label="Filter payments by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-[200px]"
            >
              <option value="">All payments</option>
              {['PAID', 'PENDING', 'FAILED', 'CANCELLED', 'REJECTED', 'REVIEW'].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </FieldSelect>
          </label>
          {d.data.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              No payments yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <caption className="sr-only">Recent SSLCommerz payments</caption>
                <thead className="bg-[#FBFBFC] text-left text-xs text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Transaction</th>
                    <th className="px-3 py-2 font-medium">Store</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((t) => (
                    <tr key={t.id} className="border-t border-line-subtle">
                      <td className="px-3 py-2">
                        <span className="block font-medium">{t.tranId}</span>
                        <span className="text-xs text-faint">
                          {fmtDateTime(t.paidAt ?? t.createdAt)} · {t.environment}
                          {t.gatewayRef ? ` · ref ${t.gatewayRef}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {t.workspaceName ?? '—'}
                        <span className="block text-xs text-faint capitalize">
                          {t.planKey} · {t.interval === 'YEAR' ? 'yearly' : 'monthly'}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{money(t.amountMinor, t.currency)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-xs font-medium',
                            TONE[t.status] ?? 'bg-wash-2 text-muted',
                          )}
                        >
                          {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                        </span>
                        {t.reason && (
                          <span className="mt-0.5 block text-xs text-danger">{t.reason}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.status !== 'PAID' && t.status !== 'REFUNDED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Check ${t.tranId} with SSLCommerz`}
                            loading={reconcile.isPending && reconcile.variables === t.tranId}
                            onClick={() => reconcile.mutate(t.tranId)}
                          >
                            Check again
                          </Button>
                        )}
                      </td>
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
            A plan starts only after SSLCommerz&apos;s server-side validation matches the
            transaction, amount and currency Torio created. “Check again” asks the gateway about a
            payment whose callback never arrived. Refunds are not automated yet: a refunded payment
            must be handled in the SSLCommerz merchant panel.
          </p>
        </div>
      )}
    </Panel>
  );
}
