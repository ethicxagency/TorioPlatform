'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { adminRequest } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';
import { fmtDateTime, Loading, Notice, PageHead, Panel } from './common';

interface Row {
  id: string;
  reference: string;
  email: string;
  reason: string | null;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  createdAt: string;
  verifiedAt: string | null;
  processedAt: string | null;
  rejectionReason: string | null;
  summary: Record<string, unknown> | null;
}
const TONE: Record<Row['status'], string> = {
  PENDING_VERIFICATION: 'bg-wash-2 text-muted',
  VERIFIED: 'bg-warning-soft text-warning',
  PROCESSING: 'bg-primary-soft text-primary-hover',
  COMPLETED: 'bg-success-soft text-success',
  REJECTED: 'bg-danger-soft text-danger',
};
const LABEL: Record<Row['status'], string> = {
  PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

/** Super Admin: review customers' account deletion requests. Only a verified request can be processed; rejecting needs a reason. */
export function DeletionRequestsPage() {
  const { toast } = useAdminShell();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [ask, setAsk] = useState<{ row: Row; kind: 'process' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'deletions', filter],
    queryFn: () =>
      adminRequest<{ data: Row[] }>(`/account-deletions${filter ? `?status=${filter}` : ''}`),
  });
  const done = () => {
    setAsk(null);
    setReason('');
    void qc.invalidateQueries({ queryKey: ['admin', 'deletions'] });
  };
  const act = useMutation({
    mutationFn: (a: { row: Row; kind: 'process' | 'reject' }) =>
      adminRequest(`/account-deletions/${a.row.id}/${a.kind}`, {
        method: 'POST',
        body: a.kind === 'reject' ? { reason } : {},
      }),
    onSuccess: (_r, a) => {
      toast(a.kind === 'process' ? 'Request processed' : 'Request rejected');
      done();
    },
    onError: (e) => {
      toast.error(e.message);
      done();
    },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Notice tone="bad">{q.error.message}</Notice>;
  const rows = q.data.data;
  return (
    <div>
      <PageHead
        title="Deletion requests"
        description="Customers’ requests to delete their account. Processing anonymizes the account, removes access and disconnects channels in workspaces nobody else uses."
      />
      <Panel>
        <div className="mb-3 flex items-center gap-2 text-[12.5px]">
          <label htmlFor="del-filter" className="font-medium">
            Status
          </label>
          <select
            id="del-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={cn(controlCls, 'max-w-[220px]')}
          >
            <option value="">All</option>
            {Object.entries(LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-muted">No deletion requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-3 font-medium">Reference</th>
                  <th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Requested</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line-subtle align-top">
                    <td className="py-2.5 pr-3 font-mono">{r.reference}</td>
                    <td className="py-2.5 pr-3">
                      {r.email}
                      {r.reason && <div className="text-muted">“{r.reason}”</div>}
                      {r.rejectionReason && <div className="text-danger">{r.rejectionReason}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[11.5px] font-semibold',
                          TONE[r.status],
                        )}
                      >
                        {LABEL[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">{fmtDateTime(r.createdAt)}</td>
                    <td className="py-2.5">
                      {(r.status === 'VERIFIED' || r.status === 'PENDING_VERIFICATION') && (
                        <div className="flex gap-1.5">
                          {r.status === 'VERIFIED' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setAsk({ row: r, kind: 'process' })}
                            >
                              Process
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAsk({ row: r, kind: 'reject' })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {r.summary && (
                        <div className="text-muted">
                          {Object.entries(r.summary)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {ask?.kind === 'process' && (
        <ConfirmDialog
          title="Permanently delete this account?"
          body={`${ask.row.reference}: the account is anonymized, its sessions and sign-in links removed, and channels in workspaces nobody else uses are disconnected. This cannot be undone.`}
          confirmLabel="Process deletion"
          onCancel={() => setAsk(null)}
          onConfirm={() => act.mutate(ask)}
        />
      )}
      {ask?.kind === 'reject' && (
        <div className="mt-4">
          <Panel title={`Reject ${ask.row.reference}`}>
            <div className="flex flex-col gap-2 text-[12.5px]">
              <label htmlFor="reject-reason" className="font-medium">
                Reason shown to the customer
              </label>
              <input
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={controlCls}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reason.trim().length < 3}
                  loading={act.isPending}
                  onClick={() => act.mutate(ask)}
                >
                  Reject request
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAsk(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
