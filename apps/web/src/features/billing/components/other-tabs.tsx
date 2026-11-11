'use client';

import { Download, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeZone } from '@/features/settings/queries';
import { useInvoice } from '../queries';
import { fmtDate, InvoiceBadge, money, Notice } from './bits';

// ---------- Invoice details ----------

export function InvoiceDrawer({
  ws,
  id,
  onClose,
  onDownload,
}: {
  ws: string;
  id: string;
  onClose: () => void;
  onDownload: (n: string) => void;
}) {
  const { registerEscape } = useShell();
  const tz = useTimeZone();
  const q = useInvoice(ws, id);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);
  const i = q.data;
  const c = i?.customer;
  return (
    <>
      <div className="fixed inset-0 z-[70] glass-scrim" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Invoice details"
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[520px]"
      >
        <header className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <h2 className="m-0 flex-1 text-base font-semibold">Invoice {i?.number ?? ''}</h2>
          {i && <InvoiceBadge status={i.status} />}
          <button
            ref={closeRef}
            type="button"
            aria-label="Close invoice"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          {q.isPending && <Skeleton className="h-40 w-full" />}
          {q.isError && <Notice tone="bad">Couldn&apos;t load this invoice.</Notice>}
          {i && c && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-faint">From</div>
                  <div className="font-medium">{i.seller.name}</div>
                  <div className="text-xs text-muted">{i.seller.note}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Bill to</div>
                  <div className="font-medium">
                    {c.companyName ?? c.contactName ?? 'No billing details saved'}
                  </div>
                  <div className="text-xs text-muted">
                    {[c.addressLine, c.city, c.state, c.postalCode, c.country]
                      .filter(Boolean)
                      .join(', ')}
                    {c.billingEmail && <div>{c.billingEmail}</div>}
                    {c.taxId && <div>Tax ID: {c.taxId}</div>}
                  </div>
                </div>
              </div>
              <dl className="m-0 mb-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-faint">Invoice date</dt>
                <dd className="m-0">{fmtDate(i.issuedAt, tz)}</dd>
                <dt className="text-faint">Billing period</dt>
                <dd className="m-0">
                  {i.periodStart
                    ? `${fmtDate(i.periodStart, tz)} – ${fmtDate(i.periodEnd, tz)}`
                    : '—'}
                </dd>
                <dt className="text-faint">Plan</dt>
                <dd className="m-0 capitalize">{i.planKey ?? '—'}</dd>
                <dt className="text-faint">Payment</dt>
                <dd className="m-0">
                  {i.paymentSummary ?? (i.status === 'PAID' ? 'Paid' : 'Not paid')}
                </dd>
              </dl>
              <table className="mb-3 w-full border-collapse">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-xs text-faint">
                    <th className="py-1.5 font-medium">Item</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {i.lines.map((l, k) => (
                    <tr key={k} className="border-b border-line-subtle">
                      <td className="py-2">
                        {l.quantity} × {l.description}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(l.amountMinor, i.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ml-auto flex w-[220px] flex-col gap-1">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{money(i.subtotalMinor, i.currency)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Tax</span>
                  <span className="tabular-nums">{money(i.taxMinor, i.currency)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(i.totalMinor, i.currency)}</span>
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <Button onClick={() => onDownload(i.number ?? 'invoice')}>
                  <Download size={14} /> Download PDF
                </Button>
                {i.hostedUrl && (
                  <Button asChild variant="outline">
                    <a href={i.hostedUrl} target="_blank" rel="noopener noreferrer">
                      Open provider invoice
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------- Billing information ----------
