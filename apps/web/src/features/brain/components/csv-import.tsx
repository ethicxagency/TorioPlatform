'use client';

import type { FeedPreview } from '@torio/contracts';
import { CircleAlert, FileSpreadsheet } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import { useCsvCreate, useCsvPreview } from '../queries';

const MAX_BYTES = 2_500_000;
const FIELDS = {
  products: [
    ['name', 'Name', true],
    ['price', 'Price', false],
    ['externalId', 'Product ID / SKU', false],
    ['description', 'Description', false],
    ['category', 'Category', false],
    ['stock', 'Availability', false],
    ['colors', 'Colours', false],
    ['sizes', 'Sizes', false],
    ['url', 'Product page', false],
    ['image', 'Image', false],
  ],
  faqs: [
    ['question', 'Question', true],
    ['answer', 'Answer', true],
    ['category', 'Category', false],
  ],
} as const;
const TYPES = [
  { value: 'products', label: 'Products' },
  { value: 'faqs', label: 'FAQs' },
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
 * Import products or FAQs from a CSV file. The file is read in the browser and checked on the server first (nothing is
 * stored); you can adjust which column feeds which field, then send the rows to review. Nothing reaches Brain until approved.
 */
export function CsvDialog({
  ws,
  onClose,
  onStarted,
}: {
  ws: string;
  onClose: () => void;
  onStarted: (jobId: string) => void;
}) {
  const [type, setType] = useState<'products' | 'faqs'>('products');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [currency, setCurrency] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<FeedPreview | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const preview = useCsvPreview(ws);
  const create = useCsvCreate(ws);
  const cur = /^[A-Za-z]{3}$/.test(currency.trim()) ? currency.trim().toUpperCase() : undefined;

  const check = (over?: {
    type?: 'products' | 'faqs';
    text?: string;
    mapping?: Record<string, string>;
  }) => {
    const text = over?.text ?? file?.text;
    if (!text) return;
    setError('');
    preview.mutate(
      {
        type: over?.type ?? type,
        csv: text,
        ...(over?.mapping && { mapping: over.mapping }),
        ...(cur && { currency: cur }),
      },
      {
        onSuccess: (p) => {
          setPv(p);
          setMapping(p.mapping);
        },
        onError: (e) => {
          setPv(null);
          setError(e.message);
        },
      },
    );
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setPv(null);
    if (f.size > MAX_BYTES) return setError('That file is larger than 2.5 MB.');
    const text = await f.text();
    setFile({ name: f.name, text });
    setMapping({});
    check({ text, mapping: undefined });
  };
  const start = () => {
    if (!file) return;
    setError('');
    create.mutate(
      { type, csv: file.text, name: file.name, mapping, ...(cur && { currency: cur }) },
      { onSuccess: (d) => onStarted(d.job.id), onError: (e) => setError(e.message) },
    );
  };
  const tagOptions = [
    { value: '', label: 'Not used' },
    ...(pv?.tags ?? []).map((t) => ({ value: t, label: t })),
  ];
  const required = FIELDS[type].filter((f) => f[2]).every((f) => mapping[f[0]]);

  return (
    <Modal
      title="Import from a CSV file"
      onClose={onClose}
      className="max-w-[720px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!pv || pv.valid === 0 || !required || create.isPending}>
            {create.isPending
              ? 'Importing…'
              : pv
                ? `Import ${pv.valid} ${type === 'products' ? 'products' : 'FAQs'} for review`
                : 'Choose a file'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            What is in the file
            <Select
              aria-label="File contents"
              value={type}
              options={TYPES}
              className="w-full"
              onChange={(v) => {
                const t = v as typeof type;
                setType(t);
                setMapping({});
                setPv(null);
                check({ type: t, mapping: undefined });
              }}
            />
          </label>
          {type === 'products' && (
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              Currency, only if the file has none
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
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-3.5">
          <FileSpreadsheet size={18} aria-hidden className="text-faint" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
            {file ? file.name : 'The first row must be the column names.'}
          </span>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose file'}
          </Button>
          {file && !pv && !preview.isPending && !error && (
            <Button size="sm" onClick={() => check()}>
              Check file
            </Button>
          )}
        </div>
        {preview.isPending && <Skeleton className="h-28 w-full" />}
        {error && (
          <p
            role="alert"
            className="m-0 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
          >
            <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {pv && (
          <div role="region" aria-label="File preview" className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Rows" value={pv.totalItems} />
              <Stat label="Valid" value={pv.valid} />
              <Stat label="Skipped" value={pv.invalid} warn />
              <Stat label="Duplicates" value={pv.duplicates} warn />
            </div>
            {pv.issues.length > 0 && (
              <ul className="m-0 flex list-disc flex-col gap-0.5 rounded-xl bg-warning-soft py-2 pl-7 pr-3 text-[12.5px] text-warning">
                {pv.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <div>
              <h4 className="m-0 mb-1.5 text-[13px] font-semibold">Which column is which</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS[type].map(([key, label, req]) => (
                  <label key={key} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-[110px] shrink-0 text-muted">
                      {label}
                      {req && ' *'}
                    </span>
                    <Select
                      aria-label={`${label} column`}
                      value={mapping[key] ?? ''}
                      options={tagOptions}
                      className="min-w-0 flex-1"
                      onChange={(v) => {
                        const next = { ...mapping, [key]: v };
                        setMapping(next);
                        check({ mapping: next });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-muted">
              {pv.sample.map((s, i) => (
                <li key={i}>
                  <b className="text-ink">{s.data['name'] ?? s.data['q']}</b>
                  {type === 'products'
                    ? ` · ${[s.data['price'], s.data['currency']].filter(Boolean).join(' ') || 'no price'}`
                    : ` · ${s.data['cat']}`}
                  {s.warnings[0] && <span className="text-warning"> · {s.warnings[0]}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
