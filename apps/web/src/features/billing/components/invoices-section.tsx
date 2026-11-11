'use client';

import { Download, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/card';
import { controlCls } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeZone } from '@/features/settings/queries';
import { cn } from '@/lib/utils';
import { downloadInvoicePdf, useBillingMutations, useInvoices } from '../queries';
import type { InvoiceItem, InvoiceStatus } from '../types';
import { fmtDate, InvoiceBadge, money, Notice } from './bits';
import { InvoiceDrawer } from './other-tabs';

const FILTERS: { key: '' | InvoiceStatus; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'PAID', label: 'Paid' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'REFUNDED', label: 'Refunded' },
];

/**
 * The invoice list: search, status and issue-date filters, pagination, invoice details and PDF download. Everything shown
 * is the workspace's own invoice records as the payment provider reported them; nothing is generated here. The summary
 * cards describe the whole history and are not narrowed by the filters.
 */
export function InvoicesSection({ ws, canManage }: { ws: string; canManage: boolean }) {
  const { toast } = useShell();
  const tz = useTimeZone();
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  // Search waits for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const badRange = !!from && !!to && from > to;
  const query = useInvoices(ws, {
    status,
    q,
    from: badRange ? '' : from,
    to: badRange ? '' : to,
    page,
  });
  const m = useBillingMutations(ws);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const download = (i: InvoiceItem) =>
    downloadInvoicePdf(ws, i.id, i.number ?? 'invoice').catch(err);
  const meta = query.data?.meta;
  const sum = query.data?.summary;
  const filtered = !!(status || q.trim() || from || to);
  const clear = () => {
    setStatus('');
    setSearch('');
    setQ('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <section aria-label="Invoices" className="flex flex-col gap-3">
      {sum && (
        <ul
          aria-label="Billing overview"
          className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3"
        >
          <li>
            <MetricCard label="Total invoices" value={sum.total} valueClassName="text-[22px]" />
          </li>
          <li>
            <MetricCard label="Paid invoices" value={sum.paid} valueClassName="text-[22px]" />
          </li>
          <li>
            <MetricCard
              label="Outstanding"
              value={
                sum.outstanding.length
                  ? sum.outstanding.map((o) => money(o.amountMinor, o.currency)).join(' · ')
                  : 'None'
              }
              sub={sum.outstanding.length ? 'Pending and failed invoices' : 'Nothing is due'}
              valueClassName="text-[22px]"
            />
          </li>
        </ul>
      )}

      <div className="rounded-card border border-line bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="m-0 mr-auto text-[15px] font-semibold">Invoices</h2>
          <label className="relative">
            <span className="sr-only">Search invoices</span>
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              placeholder="Search invoices"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(controlCls, 'w-[240px] pl-8')}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            From
            <input
              type="date"
              aria-label="From date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={cn(controlCls, 'w-[140px]')}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            To
            <input
              type="date"
              aria-label="To date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={cn(controlCls, 'w-[140px]')}
            />
          </label>
        </div>
        <div
          role="group"
          aria-label="Filter invoices by status"
          className="mb-3 flex flex-wrap items-center gap-1.5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={status === f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={cn(
                'h-7 cursor-pointer rounded-full border px-3 text-[12.5px] transition-colors duration-150 motion-reduce:transition-none',
                status === f.key
                  ? 'border-[rgba(91,92,226,0.25)] bg-primary-soft font-semibold text-primary-hover'
                  : 'border-line bg-white text-muted hover:bg-wash',
              )}
            >
              {f.label}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={clear}
              className="ml-1 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-medium text-primary"
            >
              <X size={12} aria-hidden /> Clear filters
            </button>
          )}
        </div>
        {badRange && (
          <Notice tone="warn">
            The start date is after the end date, so the date filter is ignored.
          </Notice>
        )}

        {query.isPending && <Skeleton className="mt-3 h-40 w-full" />}
        {query.isError && !query.data && <Notice tone="bad">Couldn&apos;t load invoices.</Notice>}
        {query.data && query.data.data.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
            {filtered
              ? 'No invoices match your filters.'
              : 'No invoices yet. Your invoices will appear here when a payment provider issues them.'}
          </div>
        )}
        {query.data && query.data.data.length > 0 && (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-xs text-faint">
                    {['Invoice', 'Date', 'Description', 'Amount', 'Currency', 'Status', ''].map(
                      (h, i) => (
                        <th key={i} scope="col" className="px-2 py-2 font-medium">
                          {h || <span className="sr-only">Actions</span>}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((i) => (
                    <tr key={i.id} className="border-b border-line-subtle last:border-0">
                      <td className="px-2 py-2.5 font-medium">{i.number ?? i.id.slice(0, 8)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5">{fmtDate(i.issuedAt, tz)}</td>
                      <td className="px-2 py-2.5">{i.description}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                        {money(i.totalMinor, i.currency)}
                      </td>
                      <td className="px-2 py-2.5 text-xs uppercase text-muted">{i.currency}</td>
                      <td className="px-2 py-2.5">
                        <InvoiceBadge status={i.status} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(i.id)}>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Download PDF for ${i.number ?? 'invoice'}`}
                          onClick={() => void download(i)}
                        >
                          <Download size={13} /> PDF
                        </Button>
                        {i.canRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManage || m.retryInvoice.isPending}
                            title={
                              canManage ? undefined : 'Only the workspace owner can retry payments'
                            }
                            onClick={() =>
                              m.retryInvoice.mutate(i.id, {
                                onSuccess: (r) => toast(r.message),
                                onError: err,
                              })
                            }
                          >
                            Retry payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span aria-live="polite">
                {meta?.total} invoice{meta?.total === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-2">
                Page {meta?.page} of {meta?.totalPages}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= (meta?.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
      {open && (
        <InvoiceDrawer
          ws={ws}
          id={open}
          onClose={() => setOpen(null)}
          onDownload={(n) => downloadInvoicePdf(ws, open, n).catch(err)}
        />
      )}
    </section>
  );
}
