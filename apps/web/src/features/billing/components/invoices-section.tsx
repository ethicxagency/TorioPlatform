'use client';

import { Select } from '@/components/ui/select';
import {
  CircleCheck,
  Download,
  Eye,
  Receipt,
  RotateCw,
  Search,
  SearchX,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeZone } from '@/features/settings/queries';
import { Pagination } from '@/components/ui/pagination';
import { usePageSize } from '@/lib/table-prefs';
import { cn } from '@/lib/utils';
import {
  downloadInvoicePdf,
  useBillingMutations,
  useInvoices,
  type InvoiceFilters,
} from '../queries';
import type { InvoiceItem, InvoiceStatus } from '../types';
import { fmtDate, money } from './bits';
import { DateRangeFilter, IconTile, RowMenu, StatusBadge, type MenuAction } from './billing-ui';
import { InvoiceDrawer } from './other-tabs';

const FILTERS: { key: '' | InvoiceStatus; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'PAID', label: 'Paid' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'REFUNDED', label: 'Refunded' },
];
const SORTS: { key: InvoiceFilters['sort']; label: string }[] = [
  { key: 'date_desc', label: 'Newest first' },
  { key: 'date_asc', label: 'Oldest first' },
  { key: 'amount_desc', label: 'Amount: high to low' },
  { key: 'amount_asc', label: 'Amount: low to high' },
];

function Kpi({
  icon,
  color,
  label,
  value,
  hint,
}: {
  icon: typeof Receipt;
  color: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-[13px] border border-line bg-white p-4 transition-[border-color,box-shadow] duration-150 hover:border-line-input hover:shadow-[0_2px_10px_-4px_rgba(23,24,28,0.12)] motion-reduce:transition-none">
      <IconTile icon={icon} color={color} size={36} />
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-muted">{label}</div>
        <div className="mt-0.5 text-[22px] font-semibold leading-tight tabular-nums text-ink">
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11.5px] text-faint">{hint}</div>}
      </div>
    </li>
  );
}

/**
 * Billing overview and invoice management. Every figure and row is the workspace's own invoice record as the payment
 * provider reported it, formatted in that invoice's own currency; nothing is generated or assumed here. The overview
 * describes the whole history and is not narrowed by the filters.
 */
export function InvoicesSection({ ws, canManage }: { ws: string; canManage: boolean }) {
  const { toast } = useShell();
  const tz = useTimeZone();
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = usePageSize('invoices', 10);
  const [sort, setSort] = useState<InvoiceFilters['sort']>('date_desc');
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
    sort,
    page,
    pageSize,
  });
  const m = useBillingMutations(ws);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong');
  const download = (i: InvoiceItem) =>
    downloadInvoicePdf(ws, i.id, i.number ?? 'invoice').catch(err);
  const rows = query.data?.data ?? [];
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
  const label = (i: InvoiceItem) => i.number ?? i.id.slice(0, 8);
  const retry = (i: InvoiceItem) =>
    m.retryInvoice.mutate(i.id, { onSuccess: (r) => toast(r.message), onError: err });
  const menuFor = (i: InvoiceItem): MenuAction[] => [
    { label: 'Download PDF', icon: Download, onSelect: () => void download(i) },
    ...(i.canRetry
      ? [
          {
            label: 'Retry payment',
            icon: RotateCw,
            disabled: !canManage,
            onSelect: () => retry(i),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Billing overview */}
      <ul
        aria-label="Billing overview"
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3"
      >
        <Kpi
          icon={Receipt}
          color="#5B5CE2"
          label="Total invoices"
          value={sum ? sum.total : <Skeleton className="mt-1 h-6 w-10" />}
          hint={sum && sum.total > 0 ? 'All time' : undefined}
        />
        <Kpi
          icon={CircleCheck}
          color="#16A34A"
          label="Paid invoices"
          value={sum ? sum.paid : <Skeleton className="mt-1 h-6 w-10" />}
          hint={sum && sum.total > 0 ? `${sum.paid} of ${sum.total}` : undefined}
        />
        <Kpi
          icon={Wallet}
          color="#D97706"
          label="Outstanding balance"
          value={
            !sum ? (
              <Skeleton className="mt-1 h-6 w-16" />
            ) : sum.outstanding.length ? (
              <span className="flex flex-col">
                {sum.outstanding.map((o) => (
                  <span key={o.currency}>{money(o.amountMinor, o.currency)}</span>
                ))}
              </span>
            ) : (
              'None'
            )
          }
          hint={
            !sum || sum.total === 0
              ? undefined
              : sum.outstanding.length
                ? 'Pending and failed invoices'
                : 'Nothing is due'
          }
        />
      </ul>

      {/* Invoice management */}
      <section aria-label="Invoices" className="rounded-[14px] border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 mr-auto text-[15px] font-semibold">Invoices</h2>
            <label className="relative min-w-[200px] flex-1 sm:flex-none">
              <span className="sr-only">Search invoices</span>
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                placeholder="Search by invoice number"
                value={search}
                maxLength={80}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(controlCls, 'w-full pl-8 sm:w-[240px]')}
              />
            </label>
            <DateRangeFilter
              from={from}
              to={to}
              onChange={(f, t) => {
                setFrom(f);
                setTo(t);
                setPage(1);
              }}
            />
            <label>
              <span className="sr-only">Sort invoices</span>
              <Select
                aria-label="Sort invoices"
                value={sort}
                onChange={(v) => {
                  setSort(v as InvoiceFilters['sort']);
                  setPage(1);
                }}
                options={[...SORTS.map((s) => ({ value: s.key, label: s.label }))]}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter invoices by status"
              className="inline-flex rounded-[10px] border border-line bg-wash p-0.5"
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
                    'h-7 cursor-pointer rounded-lg border-none px-3 text-[12.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none',
                    status === f.key
                      ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(23,24,28,0.08)]'
                      : 'bg-transparent font-medium text-muted hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filtered && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-medium text-primary"
              >
                <X size={12} aria-hidden /> Clear filters
              </button>
            )}
            {badRange && (
              <span role="status" className="text-xs text-warning">
                The start date is after the end date, so the dates are ignored.
              </span>
            )}
          </div>
        </div>

        {query.isPending && (
          <div className="flex flex-col gap-2 p-4 sm:p-5" aria-busy="true">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-11 w-full" />
            ))}
          </div>
        )}
        {query.isError && !query.data && (
          <div
            role="alert"
            className="m-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424] sm:m-5"
          >
            Couldn&apos;t load invoices.
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {query.data && rows.length === 0 && (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span
              aria-hidden
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-[13px] bg-primary-soft text-primary"
            >
              {filtered ? <SearchX size={20} /> : <Receipt size={20} />}
            </span>
            {filtered && (
              <h3 className="m-0 text-[14.5px] font-semibold text-ink">
                No invoices match your filters
              </h3>
            )}
            <p className="m-0 mt-1 max-w-[360px] text-[13px] text-muted">
              {filtered
                ? 'Try a different search or widen the dates.'
                : 'Invoices appear here with their payment status and a download option.'}
            </p>
            {filtered && (
              <Button size="sm" variant="outline" className="mt-3" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint">
                    {['Invoice', 'Date', 'Description', 'Amount', 'Status', ''].map((h, i) => (
                      <th
                        key={i}
                        scope="col"
                        className={cn(
                          'px-4 py-2.5 first:pl-5 last:pr-5',
                          h === 'Amount' && 'text-right',
                        )}
                      >
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-line-subtle transition-colors duration-150 last:border-0 hover:bg-[#FAFAFC] motion-reduce:transition-none"
                    >
                      <td className="whitespace-nowrap px-4 py-3 pl-5 font-medium text-ink">
                        {label(i)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {fmtDate(i.issuedAt, tz)}
                      </td>
                      <td className="px-4 py-3 text-ink">{i.description}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
                        {money(i.totalMinor, i.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={i.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 pr-4 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          {i.canRetry && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mr-1"
                              disabled={!canManage || m.retryInvoice.isPending}
                              title={
                                canManage
                                  ? undefined
                                  : 'Only the workspace owner can retry payments'
                              }
                              onClick={() => retry(i)}
                            >
                              Retry payment
                            </Button>
                          )}
                          <button
                            type="button"
                            aria-label={`View invoice ${label(i)}`}
                            title="View invoice"
                            onClick={() => setOpen(i.id)}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none"
                          >
                            <Eye size={15} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Download PDF for ${label(i)}`}
                            title="Download PDF"
                            onClick={() => void download(i)}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none"
                          >
                            <Download size={15} aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* phone: compact cards, with the secondary actions in an overflow menu */}
            <ul className="m-0 list-none divide-y divide-line-subtle p-0 md:hidden">
              {rows.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{label(i)}</span>
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-muted">{i.description}</div>
                      <div className="text-xs text-faint">{fmtDate(i.issuedAt, tz)}</div>
                    </div>
                    <span className="text-[16px] font-semibold tabular-nums text-ink">
                      {money(i.totalMinor, i.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button size="sm" variant="outline" onClick={() => setOpen(i.id)}>
                      <Eye size={13} aria-hidden /> View invoice
                    </Button>
                    <RowMenu label={`More actions for ${label(i)}`} actions={menuFor(i)} />
                  </div>
                </li>
              ))}
            </ul>

            {meta && meta.total > 0 && (
              <Pagination
                page={meta.page}
                total={meta.total}
                pageSize={meta.pageSize}
                onPage={setPage}
                onPageSize={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </section>

      {open && (
        <InvoiceDrawer
          ws={ws}
          id={open}
          onClose={() => setOpen(null)}
          onDownload={(n) => downloadInvoicePdf(ws, open, n).catch(err)}
        />
      )}
    </div>
  );
}
