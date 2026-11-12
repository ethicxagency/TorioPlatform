'use client';

import type { FeedPreview } from '@torio/contracts';
import { CircleAlert, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useCreateFeed, usePreviewFeed } from '../queries';
import { Review, useJobRunner } from './website-scan';

const FIELDS: [string, string, boolean][] = [
  ['name', 'Name', true],
  ['price', 'Price', false],
  ['externalId', 'Product ID', false],
  ['description', 'Description', false],
  ['category', 'Category', false],
  ['stock', 'Availability', false],
  ['colors', 'Colours', false],
  ['sizes', 'Sizes', false],
  ['url', 'Product page', false],
  ['image', 'Image', false],
];
const FREQ = [
  { value: 'manual', label: 'Only when I sync' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-wash px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cn(
          'text-[17px] font-semibold tabular-nums',
          warn && value > 0 && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Connect an XML feed: check it first (nothing is stored), review the field mapping and a sample, then start the import.
 * The products still go through review before anything reaches Brain.
 */
export function FeedDialog({
  ws,
  onClose,
  onStarted,
}: {
  ws: string;
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [freq, setFreq] = useState<'manual' | 'daily' | 'weekly'>('manual');
  const [currency, setCurrency] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<FeedPreview | null>(null);
  const [error, setError] = useState('');
  const preview = usePreviewFeed(ws);
  const create = useCreateFeed(ws);
  const cur = /^[A-Za-z]{3}$/.test(currency.trim()) ? currency.trim().toUpperCase() : undefined;

  const check = (m: Record<string, string> | undefined = undefined) => {
    setError('');
    preview.mutate(
      { url: url.trim(), ...(m && { mapping: m }), ...(cur && { currency: cur }) },
      {
        onSuccess: (p) => {
          setPv(p);
          setMapping(p.mapping);
          if (!name.trim()) setName(safeHost(url));
        },
        onError: (e) => {
          setPv(null);
          setError(e.message);
        },
      },
    );
  };
  const start = () => {
    setError('');
    create.mutate(
      {
        url: url.trim(),
        name: name.trim() || safeHost(url),
        frequency: freq,
        mapping,
        ...(cur && { currency: cur }),
      },
      { onSuccess: (d) => onStarted(d.job.id), onError: (e) => setError(e.message) },
    );
  };
  const tagOptions = [
    { value: '', label: 'Not used' },
    ...(pv?.tags ?? []).map((t) => ({ value: t, label: t })),
  ];

  return (
    <Modal
      title="Connect an XML product feed"
      onClose={onClose}
      className="max-w-[720px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          {pv ? (
            <Button
              onClick={start}
              disabled={create.isPending || pv.valid === 0 || !mapping['name']}
            >
              {create.isPending ? 'Starting…' : `Import ${pv.valid} products for review`}
            </Button>
          ) : (
            <Button onClick={() => check()} disabled={preview.isPending || url.trim().length < 4}>
              {preview.isPending ? 'Checking…' : 'Check feed'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12.5px] font-medium sm:col-span-2">
            Feed URL
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setPv(null);
              }}
              placeholder="https://your-store.com/products.xml"
              inputMode="url"
              className={cn(controlCls, 'font-normal')}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Feed name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Main product feed"
              className={cn(controlCls, 'font-normal')}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Sync
            <Select
              aria-label="Sync frequency"
              value={freq}
              onChange={(v) => setFreq(v as typeof freq)}
              options={FREQ}
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Currency, only if the feed has none
            <input
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setPv(null);
              }}
              maxLength={3}
              placeholder="BDT"
              className={cn(controlCls, 'font-normal uppercase')}
            />
          </label>
          {freq !== 'manual' && (
            <p className="m-0 self-end text-xs text-muted">
              Scheduled syncs run only when the server&apos;s scheduler is set up. Use Sync now
              otherwise.
            </p>
          )}
        </div>

        {preview.isPending && <Skeleton className="h-32 w-full" />}
        {error && (
          <p
            role="alert"
            className="m-0 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
          >
            <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {pv && (
          <div className="flex flex-col gap-3" aria-label="Feed preview" role="region">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Items in feed" value={pv.totalItems} />
              <Stat label="Valid products" value={pv.valid} />
              <Stat label="Skipped" value={pv.invalid} warn />
              <Stat label="Duplicates" value={pv.duplicates} warn />
              <Stat label="No price" value={pv.missingPrice} warn />
            </div>
            {pv.issues.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 rounded-xl bg-warning-soft px-3 py-2.5 p-0 text-[12.5px] text-warning">
                {pv.issues.map((i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <CircleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <h4 className="m-0 mb-1.5 text-[13px] font-semibold">Field mapping</h4>
              <p className="m-0 mb-2 text-xs text-muted">
                We matched what we could from the feed&apos;s own column names. Change any that look
                wrong; the preview updates.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map(([key, label, required]) => (
                  <label key={key} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-[100px] shrink-0 text-muted">
                      {label}
                      {required && ' *'}
                    </span>
                    <Select
                      aria-label={`${label} column`}
                      value={mapping[key] ?? ''}
                      options={tagOptions}
                      className="min-w-0 flex-1"
                      onChange={(v) => {
                        const next = { ...mapping, [key]: v };
                        setMapping(next);
                        check(next);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 className="m-0 mb-1.5 text-[13px] font-semibold">Sample</h4>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
                  <thead className="bg-[#FBFBFC] text-left text-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Availability</th>
                      <th className="px-3 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pv.sample.map((s, i) => (
                      <tr key={i} className="border-t border-line-subtle align-top">
                        <td className="px-3 py-2 font-medium">{s.data['name']}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {[s.data['price'], s.data['currency']].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-3 py-2">{s.data['stock'] ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-warning">{s.warnings[0] ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function safeHost(u: string) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`).hostname;
  } catch {
    return 'Product feed';
  }
}

/** A running or finished feed sync: progress, then the same review screen as website scans. */
export function FeedPanel({
  ws,
  jobId,
  onImported,
  onClose,
  onJob,
}: {
  ws: string;
  jobId: string;
  onImported: () => void;
  onClose: () => void;
  /** A retry starts a new job; follow it. */
  onJob: (id: string) => void;
}) {
  const { job, active, status, cancel, retry } = useJobRunner(ws, jobId);
  const d = job.data;
  if (job.isPending) return <Skeleton className="h-20 w-full" />;
  if (!d) return null;
  const finished = status === 'NEEDS_REVIEW' || status === 'COMPLETED';
  return (
    <div
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-4"
      aria-label="Feed import"
      role="region"
    >
      {active && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 text-[13px]"
        >
          <Loader2
            size={15}
            className="animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
          <span className="font-medium">Reading the feed…</span>
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
      )}
      {(status === 'FAILED' || status === 'CANCELLED') && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          <span className="min-w-0 flex-1">
            {status === 'CANCELLED'
              ? 'The sync was cancelled.'
              : (d.job.error ?? 'The sync failed.')}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={retry.isPending}
            onClick={() => retry.mutate(undefined, { onSuccess: (n) => onJob(n.job.id) })}
          >
            <RotateCcw size={13} aria-hidden /> Retry
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      )}
      {finished && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="font-medium">Feed sync</span>
            {d.job.stats &&
              Object.entries(d.job.stats).map(([k, v]) => (
                <span key={k} className="text-muted tabular-nums">
                  {v} {k}
                </span>
              ))}
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-primary"
            >
              Close
            </button>
          </div>
          {d.warnings.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-0.5 rounded-xl bg-wash py-2 pl-7 pr-3 text-[12.5px] text-muted">
              {d.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {status === 'COMPLETED' ? (
            <p className="m-0 text-[13px] text-muted">
              Nothing new or changed since the last import.
            </p>
          ) : (
            <Review ws={ws} jobId={jobId} onImported={onImported} />
          )}
        </>
      )}
    </div>
  );
}
