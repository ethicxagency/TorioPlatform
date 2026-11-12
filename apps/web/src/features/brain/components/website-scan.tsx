'use client';

import type { ImportRecordView } from '@torio/contracts';
import {
  Check,
  CircleAlert,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import {
  useBulkReview,
  useCancelScan,
  useImportApproved,
  useRetryScan,
  useReviewRecord,
  useScanJob,
  useScanRecords,
  useScanStep,
  useStartScan,
} from '../queries';

type Cat = ImportRecordView['category'];
const CATS: { key: Cat; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'product', label: 'Products' },
  { key: 'policy', label: 'Policies' },
  { key: 'faq', label: 'FAQs' },
];
const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  category: 'Category',
  country: 'Country',
  website: 'Website',
  email: 'Email',
  phone: 'Phone',
  social: 'Social links',
  price: 'Price',
  currency: 'Currency',
  stock: 'Availability',
  colors: 'Colours',
  url: 'Page',
  image: 'Image',
  q: 'Question',
  a: 'Answer',
  kind: 'Policy',
  text: 'Text',
};
const LONG = new Set(['description', 'a', 'text']);
// shown for review but never imported into Brain
const INFO_ONLY = new Set(['email', 'phone', 'social', 'url', 'image', 'kind']);

const level = (c: number) =>
  c >= 80
    ? { label: 'High', cls: 'bg-success-soft text-success' }
    : c >= 60
      ? { label: 'Medium', cls: 'bg-warning-soft text-warning' }
      : { label: 'Low', cls: 'bg-danger-soft text-danger' };

function host(u: string | null) {
  try {
    return u ? new URL(u).pathname.replace(/\/$/, '') || '/' : '';
  } catch {
    return u ?? '';
  }
}

function EditDialog({
  r,
  busy,
  onSave,
  onClose,
}: {
  r: ImportRecordView;
  busy: boolean;
  onSave: (data: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Record<string, string>>({ ...r.data });
  const keys = Object.keys(r.original).filter((k) =>
    !INFO_ONLY.has(k) || k === 'kind' ? !INFO_ONLY.has(k) : false,
  );
  return (
    <Modal
      title={`Edit ${r.title}`}
      onClose={onClose}
      className="max-w-[560px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(d)} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1 text-[12.5px] font-medium">
            {FIELD_LABEL[k] ?? k}
            {LONG.has(k) ? (
              <textarea
                rows={4}
                value={d[k] ?? ''}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
                className={cn(controlCls, 'h-auto resize-y p-2 font-normal')}
              />
            ) : (
              <input
                value={d[k] ?? ''}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
                className={cn(controlCls, 'font-normal')}
              />
            )}
            {r.original[k] !== undefined && r.original[k] !== d[k] && (
              <span className="text-xs font-normal text-faint">
                Found on the site: {r.original[k]}
              </span>
            )}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function Row({
  r,
  onStatus,
  onEdit,
}: {
  r: ImportRecordView;
  onStatus: (s: 'PENDING' | 'APPROVED' | 'REJECTED') => void;
  onEdit: () => void;
}) {
  const lv = level(r.confidence);
  const imported = r.status === 'IMPORTED';
  const shown = Object.entries(r.data).filter(([k]) => !['name', 'q'].includes(k));
  return (
    <li
      className={cn(
        'rounded-xl border bg-white p-3.5',
        r.status === 'APPROVED' ? 'border-primary-line' : 'border-line',
        r.status === 'REJECTED' && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="m-0 text-[13.5px] font-semibold">{r.title}</h4>
            <span
              className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', lv.cls)}
              title={`Confidence ${r.confidence}/100`}
            >
              {lv.label} confidence
            </span>
            {r.edited && (
              <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11px] text-muted">
                Edited
              </span>
            )}
            {imported && (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                Imported
              </span>
            )}
          </div>
          <dl className="m-0 mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-muted">
            {shown.slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-[86px] shrink-0 text-faint">{FIELD_LABEL[k] ?? k}</dt>
                <dd className="m-0 min-w-0 flex-1 break-words">
                  {v.length > 220 ? `${v.slice(0, 220)}…` : v}
                </dd>
              </div>
            ))}
          </dl>
          {r.warnings.length > 0 && (
            <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-xs text-warning">
              {r.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1">
                  <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          {r.sourceUrl && (
            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary"
            >
              {host(r.sourceUrl)} <ExternalLink size={11} aria-hidden />
            </a>
          )}
        </div>
        {!imported && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" aria-label={`Edit ${r.title}`} onClick={onEdit}>
              <Pencil size={13} aria-hidden /> Edit
            </Button>
            <Button
              size="sm"
              variant={r.status === 'REJECTED' ? 'primary' : 'outline'}
              aria-pressed={r.status === 'REJECTED'}
              aria-label={`Reject ${r.title}`}
              onClick={() => onStatus(r.status === 'REJECTED' ? 'PENDING' : 'REJECTED')}
            >
              <X size={13} aria-hidden /> Reject
            </Button>
            <Button
              size="sm"
              variant={r.status === 'APPROVED' ? 'primary' : 'outline'}
              aria-pressed={r.status === 'APPROVED'}
              aria-label={`Approve ${r.title}`}
              onClick={() => onStatus(r.status === 'APPROVED' ? 'PENDING' : 'APPROVED')}
            >
              <Check size={13} aria-hidden /> {r.status === 'APPROVED' ? 'Approved' : 'Approve'}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function Review({
  ws,
  jobId,
  onImported,
}: {
  ws: string;
  jobId: string;
  onImported: () => void;
}) {
  const recs = useScanRecords(ws, jobId, true);
  const review = useReviewRecord(ws, jobId);
  const bulk = useBulkReview(ws, jobId);
  const imp = useImportApproved(ws, jobId);
  const [tab, setTab] = useState<'all' | Cat>('all');
  const [editing, setEditing] = useState<ImportRecordView | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const list = useMemo(() => recs.data ?? [], [recs.data]);
  const counts = useMemo(() => {
    const c = { all: list.length } as Record<string, number>;
    for (const k of CATS) c[k.key] = list.filter((r) => r.category === k.key).length;
    return c;
  }, [list]);
  const [limit, setLimit] = useState(50);
  const all = tab === 'all' ? list : list.filter((r) => r.category === tab);
  const shown = all.slice(0, limit);
  const approved = list.filter((r) => r.status === 'APPROVED').length;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong');

  if (recs.isPending) return <Skeleton className="h-40 w-full" />;
  if (recs.isError)
    return (
      <p
        role="alert"
        className="m-0 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load what the scan found.
      </p>
    );
  if (list.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Found entries" className="flex flex-wrap gap-1.5">
        {[{ key: 'all' as const, label: 'All' }, ...CATS.filter((c) => counts[c.key])].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setLimit(50);
            }}
            className={cn(
              'h-8 cursor-pointer rounded-full border px-3 text-[12.5px] transition-colors duration-150',
              tab === t.key
                ? 'border-primary-line bg-primary-soft font-semibold text-primary-hover'
                : 'border-line bg-white text-muted hover:bg-wash',
            )}
          >
            {t.label} <span className="tabular-nums text-faint">{counts[t.key]}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending}
          onClick={() =>
            bulk.mutate(
              { status: 'APPROVED', categories: tab === 'all' ? undefined : [tab] },
              { onError: fail },
            )
          }
        >
          Approve {tab === 'all' ? 'all' : 'these'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending}
          onClick={() =>
            bulk.mutate(
              { status: 'PENDING', categories: tab === 'all' ? undefined : [tab] },
              { onError: fail },
            )
          }
        >
          Clear approvals
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((r) => (
          <Row
            key={r.id}
            r={r}
            onEdit={() => setEditing(r)}
            onStatus={(s) => review.mutate({ id: r.id, status: s }, { onError: fail })}
          />
        ))}
      </ul>
      {error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
        >
          {error}
        </p>
      )}
      {note && (
        <p
          role="status"
          className="m-0 rounded-xl bg-success-soft px-3 py-2 text-[12.5px] text-success"
        >
          {note}
        </p>
      )}
      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-popover">
        <span className="text-[13px] text-muted">
          <b className="text-ink">{approved}</b> approved. Only approved entries are added to your
          Brain.
        </span>
        <span className="flex-1" />
        <Button
          disabled={approved === 0 || imp.isPending}
          onClick={() => {
            setError('');
            imp.mutate(undefined, {
              onSuccess: (r) => {
                setNote(
                  `Imported ${r.imported} ${r.imported === 1 ? 'entry' : 'entries'} into Brain.${r.notes.length ? ' ' + r.notes.join(' ') : ''}`,
                );
                onImported();
              },
              onError: fail,
            });
          }}
        >
          {imp.isPending ? 'Importing…' : `Import ${approved} approved`}
        </Button>
      </div>
      {editing && (
        <EditDialog
          r={editing}
          busy={review.isPending}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            review.mutate(
              { id: editing.id, data },
              { onSuccess: () => setEditing(null), onError: fail },
            )
          }
        />
      )}
    </div>
  );
}

/**
 * Loads a scan or feed job and, while it is active, keeps asking the server for the next small step. Each call is
 * time-boxed on the server, so the work happens in pieces and survives leaving and returning to the page.
 */
export function useJobRunner(ws: string, jobId: string | null) {
  const job = useScanJob(ws, jobId);
  const step = useScanStep(ws, jobId);
  const cancel = useCancelScan(ws, jobId);
  const retry = useRetryScan(ws, jobId);
  const status = job.data?.job.status;
  const active = status === 'QUEUED' || status === 'RUNNING';
  const stepping = useRef(false);

  // While a scan is active, keep asking it to do the next small step. Each call is time-boxed on the server.
  useEffect(() => {
    if (!active || stepping.current) return;
    stepping.current = true;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const d = await step.mutateAsync();
          if (d.job.status !== 'QUEUED' && d.job.status !== 'RUNNING') break;
        } catch {
          break;
        }
      }
      stepping.current = false;
    })();
    return () => {
      stop = true;
      stepping.current = false;
    };
    // `step` is a stable mutation handle; the loop must restart only when activity starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, jobId]);

  return { job, step, cancel, retry, active, status };
}

/**
 * The website scan: a short form, live progress while the scan advances in small steps, then a review screen. Nothing found
 * is active until it is approved and imported; imports add to Brain and never overwrite what is already there.
 */
export function WebsiteScan({
  ws,
  initialJobId,
  defaults,
  onImported,
}: {
  ws: string;
  initialJobId: string | null;
  defaults: { url: string; country: string; category: string };
  onImported: () => void;
}) {
  // undefined = follow the resumable scan the server reports; a value (or null) is the person's own choice.
  const [chosen, setJobId] = useState<string | null | undefined>(undefined);
  const jobId = chosen === undefined ? initialJobId : chosen;
  const [url, setUrl] = useState(defaults.url);
  const [country, setCountry] = useState(defaults.country);
  const [category, setCategory] = useState(defaults.category);
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const start = useStartScan(ws);
  const { job, cancel, retry, active, status } = useJobRunner(ws, jobId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    start.mutate(
      {
        url: url.trim(),
        ...(country.trim() && { country: country.trim() }),
        ...(category.trim() && { category: category.trim() }),
        ...(notes.trim() && { instructions: notes.trim() }),
      },
      { onSuccess: (d) => setJobId(d.job.id), onError: (er) => setError(er.message) },
    );
  };

  const d = job.data;
  const finished = status === 'NEEDS_REVIEW' || status === 'COMPLETED';

  return (
    <div className="flex flex-col gap-4">
      {(!jobId || status === 'FAILED' || status === 'CANCELLED' || (finished && false)) && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          {(status === 'FAILED' || status === 'CANCELLED') && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
            >
              <span className="min-w-0 flex-1">
                {status === 'CANCELLED'
                  ? 'The scan was cancelled.'
                  : (d?.job.error ?? 'The scan failed.')}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate(undefined, {
                    onSuccess: (n) => setJobId(n.job.id),
                    onError: (er) => setError(er.message),
                  })
                }
              >
                <RotateCcw size={13} aria-hidden /> Retry
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[12.5px] font-medium">
              Website address
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-website.com"
                inputMode="url"
                autoComplete="url"
                className={cn(controlCls, 'font-normal')}
              />
            </label>
            <Button type="submit" disabled={start.isPending || url.trim().length < 4}>
              {start.isPending ? 'Starting…' : 'Scan website'}
            </Button>
          </div>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className="w-fit cursor-pointer border-none bg-transparent p-0 text-xs font-medium text-primary"
          >
            {more ? 'Hide details' : 'Add details (optional)'}
          </button>
          {more && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Business country
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={cn(controlCls, 'font-normal')}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium">
                Business category
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={cn(controlCls, 'font-normal')}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium sm:col-span-2">
                Additional instructions
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(controlCls, 'h-auto resize-y p-2 font-normal')}
                />
              </label>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
            >
              {error}
            </p>
          )}
        </form>
      )}

      {jobId && job.isPending && <Skeleton className="h-20 w-full" />}

      {d && active && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-xl border border-line bg-wash p-3.5"
        >
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Loader2
              size={15}
              className="animate-spin text-primary motion-reduce:animate-none"
              aria-hidden
            />
            <span className="font-medium">
              Scanning {d.url ? host(d.url) && new URL(d.url).hostname : 'your website'}
            </span>
            <span className="text-muted tabular-nums">
              {d.progress.pages} of up to {d.progress.maxPages} pages
            </span>
            <span className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel
            </Button>
          </div>
          <div
            role="progressbar"
            aria-label="Pages scanned"
            aria-valuemin={0}
            aria-valuemax={d.progress.maxPages}
            aria-valuenow={d.progress.pages}
            className="h-1.5 overflow-hidden rounded-full bg-wash-2"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, (d.progress.pages / d.progress.maxPages) * 100)}%` }}
            />
          </div>
          <p className="m-0 text-xs text-muted">
            Torio reads only public pages, follows the site&apos;s robots.txt and stops after{' '}
            {d.progress.maxPages} pages. You can leave this page; the scan continues when you come
            back.
          </p>
        </div>
      )}

      {d && finished && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-wash px-3.5 py-2.5 text-[13px]">
            <span className="flex items-center gap-1.5 font-medium">
              <Globe size={14} aria-hidden /> {d.url ? new URL(d.url).hostname : 'Scan'}
            </span>
            {d.job.stats &&
              Object.entries(d.job.stats).map(([k, v]) => (
                <span key={k} className="text-muted tabular-nums">
                  {v} {k}
                </span>
              ))}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setJobId(null)}
              className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-primary"
            >
              Scan another website
            </button>
          </div>
          {d.warnings.length > 0 && (
            <details className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[12.5px] text-muted">
              <summary className="cursor-pointer font-medium text-ink">
                {d.warnings.length} note{d.warnings.length === 1 ? '' : 's'} about this scan
              </summary>
              <ul className="m-0 mt-1.5 list-disc pl-5">
                {d.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <Review ws={ws} jobId={jobId!} onImported={onImported} />
          {status === 'COMPLETED' &&
            d.job.stats &&
            Object.values(d.job.stats).every((n, i) => i === 0 || n === 0) && (
              <p className="m-0 text-[13px] text-muted">
                Nothing recognisable was found, and nothing was guessed. Pages need structured
                product data, FAQ markup or clearly named policy pages for Torio to propose entries.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
