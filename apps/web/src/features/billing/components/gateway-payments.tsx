'use client';

import { useTimeZone } from '@/features/settings/queries';
import { cn } from '@/lib/utils';
import { useGatewayPayments } from '../queries';
import { Card, fmtDate, money } from './bits';

const LABEL: Record<string, { text: string; cls: string }> = {
  PAID: { text: 'Paid', cls: 'bg-success-soft text-success' },
  PENDING: { text: 'Pending', cls: 'bg-wash-2 text-muted' },
  INITIATED: { text: 'Started', cls: 'bg-wash-2 text-muted' },
  FAILED: { text: 'Failed', cls: 'bg-danger-soft text-danger' },
  CANCELLED: { text: 'Cancelled', cls: 'bg-wash-2 text-muted' },
  REFUNDED: { text: 'Refunded', cls: 'bg-warning-soft text-warning' },
  REJECTED: { text: 'Needs review', cls: 'bg-warning-soft text-warning' },
  REVIEW: { text: 'Needs review', cls: 'bg-warning-soft text-warning' },
};

/** The workspace's SSLCommerz payments. Shown only once there is at least one; invoices for paid ones are in the list above. */
export function GatewayPayments({ ws, enabled }: { ws: string; enabled: boolean }) {
  const tz = useTimeZone();
  const q = useGatewayPayments(ws, enabled);
  const rows = q.data?.data ?? [];
  if (!enabled || q.isPending || q.isError || rows.length === 0) return null;
  return (
    <Card title="SSLCommerz payments">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <caption className="sr-only">SSLCommerz payments</caption>
          <thead className="bg-[#FBFBFC] text-left text-xs text-faint">
            <tr>
              <th className="px-3 py-2 font-medium">Transaction</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const s = LABEL[t.status] ?? { text: t.status, cls: 'bg-wash-2 text-muted' };
              return (
                <tr key={t.id} className="border-t border-line-subtle">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{t.tranId}</span>
                    {t.gatewayRef && (
                      <span className="text-xs text-faint">Gateway ref {t.gatewayRef}</span>
                    )}
                    {t.environment === 'sandbox' && (
                      <span className="ml-1 text-xs text-warning">sandbox</span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {t.planKey} · {t.interval === 'YEAR' ? 'yearly' : 'monthly'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(t.amountMinor, t.currency)}</td>
                  <td className="px-3 py-2 text-muted">{t.paymentMethod ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {fmtDate(t.paidAt ?? t.createdAt, tz)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', s.cls)}>
                      {s.text}
                    </span>
                    {t.reason && t.status !== 'PAID' && (
                      <span className="mt-0.5 block text-xs text-faint">{t.reason}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
