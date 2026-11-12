'use client';

import type { ProductCandidate, ProductGroup } from '@torio/contracts';
import { Check, CircleAlert, GitCompare, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { cn } from '@/lib/utils';
import {
  useApproveClear,
  useImportProducts,
  useProductReview,
  useProductStatus,
  useResolveProduct,
} from '../queries';

const SOURCE: Record<string, string> = {
  WEBSITE: 'Website scan',
  XML_FEED: 'XML feed',
  META_CATALOG: 'Meta Catalog',
  GOOGLE_MERCHANT: 'Google Merchant Center',
  MANUAL: 'CSV import',
};
const FIELD: Record<string, string> = {
  price: 'Price',
  currency: 'Currency',
  description: 'Description',
  category: 'Category',
  stock: 'Availability',
  colors: 'Colours',
  sizes: 'Sizes',
};
const money = (d: Record<string, string>) => [d['price'], d['currency']].filter(Boolean).join(' ');
const short = (v: string, n = 120) => (v.length > n ? `${v.slice(0, n)}…` : v);

/** Decide one product that several sources (or Brain) disagree about: which version to keep, and which value for each field. */
function ResolveDialog({ ws, g, onClose }: { ws: string; g: ProductGroup; onClose: () => void }) {
  const resolve = useResolveProduct(ws);
  const best = [...g.candidates].sort((a, b) => b.confidence - a.confidence)[0]!;
  const [winner, setWinner] = useState<string>(best.id);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [update, setUpdate] = useState(false);
  const [error, setError] = useState('');
  const keepBrain = winner === 'brain';
  // a field's choice defaults to the kept version's own value, or Brain's when the person keeps Brain
  const choice = (field: string, values: { from: string }[]) =>
    pick[field] ?? (values.some((v) => v.from === winner) ? winner : (values[0]?.from ?? winner));

  const save = () => {
    setError('');
    const fields: Record<string, string> = {};
    if (!keepBrain)
      for (const c of g.conflicts) {
        const v = choice(c.field, c.values);
        if (v !== winner) fields[c.field] = v;
      }
    resolve.mutate(
      {
        recordIds: g.candidates.map((c) => c.id),
        winnerId: keepBrain ? null : winner,
        fields,
        updateBrain: !keepBrain && update,
      },
      { onSuccess: onClose, onError: (e) => setError(e.message) },
    );
  };

  return (
    <Modal
      title={`Resolve: ${g.name}`}
      onClose={onClose}
      className="max-w-[680px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={resolve.isPending}>
            {resolve.isPending
              ? 'Saving…'
              : keepBrain
                ? 'Keep my Brain version'
                : 'Keep this version'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[12.5px] font-semibold">Which version do you want?</legend>
          {g.candidates.map((c) => (
            <label
              key={c.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-[13px]',
                winner === c.id ? 'border-primary-line bg-primary-soft/40' : 'border-line',
              )}
            >
              <input
                type="radio"
                name="winner"
                checked={winner === c.id}
                onChange={() => setWinner(c.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {SOURCE[c.source.kind]}: {c.source.name}
                </span>
                <span className="block text-xs text-muted">
                  {[money(c.data), c.data['stock']].filter(Boolean).join(' · ') ||
                    'No price or availability'}{' '}
                  · {c.confidence}/100 confidence
                </span>
              </span>
            </label>
          ))}
          {g.inBrain && (
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-[13px]',
                keepBrain ? 'border-primary-line bg-primary-soft/40' : 'border-line',
              )}
            >
              <input
                type="radio"
                name="winner"
                checked={keepBrain}
                onChange={() => setWinner('brain')}
              />
              <span>
                <span className="block font-medium">Keep what is in my Brain</span>
                <span className="block text-xs text-muted">None of these versions are added.</span>
              </span>
            </label>
          )}
        </fieldset>

        {!keepBrain && g.conflicts.length > 0 && (
          <div>
            <h4 className="m-0 mb-1.5 text-[13px] font-semibold">Where they disagree</h4>
            <div className="flex flex-col gap-2.5">
              {g.conflicts.map((c) => (
                <fieldset key={c.field} className="m-0 rounded-xl border border-line-subtle p-2.5">
                  <legend className="px-1 text-xs font-semibold text-muted">
                    {FIELD[c.field] ?? c.field}
                  </legend>
                  <div className="flex flex-col gap-1.5">
                    {c.values.map((v) => (
                      <label key={v.from} className="flex items-start gap-2 text-[12.5px]">
                        <input
                          type="radio"
                          name={`f-${c.field}`}
                          checked={choice(c.field, c.values) === v.from}
                          onChange={() => setPick({ ...pick, [c.field]: v.from })}
                        />
                        <span className="min-w-0">
                          <span className="text-faint">{v.label}</span>{' '}
                          <b className="break-words font-medium text-ink">{short(v.value)}</b>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        )}

        {!keepBrain && g.inBrain && (
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={update}
              onChange={(e) => setUpdate(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Update my existing Brain product with these values. Without this, the product already
              in your Brain is left as it is.
            </span>
          </label>
        )}
        {error && (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function CandidateRow({
  c,
  solo,
  onStatus,
}: {
  c: ProductCandidate;
  solo: boolean;
  onStatus: (s: 'PENDING' | 'APPROVED' | 'REJECTED') => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-wash px-3 py-2 text-[12.5px]">
      <span className="min-w-0 flex-1 basis-56">
        <span className="font-medium text-ink">{SOURCE[c.source.kind]}</span>{' '}
        <span className="text-muted">{c.source.name}</span>
        <span className="block text-muted">
          {[money(c.data), c.data['stock'], c.change === 'changed' && 'Changed since last import']
            .filter(Boolean)
            .join(' · ') || 'No price or availability'}
        </span>
        {c.warnings.length > 0 && (
          <span className="mt-0.5 flex items-start gap-1 text-xs text-warning">
            <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
            {c.warnings[0]}
          </span>
        )}
      </span>
      <span className="text-xs text-faint tabular-nums">{c.confidence}/100</span>
      {c.status === 'APPROVED' && (
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
          Approved
        </span>
      )}
      {solo && (
        <span className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            aria-label={`Reject ${c.data['name']} from ${c.source.name}`}
            onClick={() => onStatus('REJECTED')}
          >
            <X size={13} aria-hidden /> Reject
          </Button>
          <Button
            size="sm"
            variant={c.status === 'APPROVED' ? 'primary' : 'outline'}
            aria-pressed={c.status === 'APPROVED'}
            aria-label={`Approve ${c.data['name']} from ${c.source.name}`}
            onClick={() => onStatus(c.status === 'APPROVED' ? 'PENDING' : 'APPROVED')}
          >
            <Check size={13} aria-hidden /> {c.status === 'APPROVED' ? 'Approved' : 'Approve'}
          </Button>
        </span>
      )}
    </li>
  );
}

type Filter = 'all' | 'decide' | 'brain' | 'ready';

/**
 * One queue for products from every source. A product several sources found is shown once, with where each version came
 * from and where they disagree. Approving or resolving changes nothing in Brain until the import button is used.
 */
export function ProductReview({ ws, onImported }: { ws: string; onImported: () => void }) {
  const q = useProductReview(ws);
  const status = useProductStatus(ws);
  const clear = useApproveClear(ws);
  const imp = useImportProducts(ws);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(20);
  const [resolving, setResolving] = useState<ProductGroup | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong');
  const data = q.data;
  const decide = (g: ProductGroup) => g.candidates.length > 1 || g.conflicts.length > 0;
  const shown = useMemo(() => {
    const gs = data?.groups ?? [];
    return gs.filter((g) =>
      filter === 'decide'
        ? decide(g)
        : filter === 'brain'
          ? !!g.inBrain
          : filter === 'ready'
            ? !decide(g) && !g.inBrain
            : true,
    );
  }, [data, filter]);

  if (q.isPending) return <Skeleton className="h-24 w-full" />;
  if (q.isError)
    return (
      <p
        role="alert"
        className="m-0 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-[#8F2424]"
      >
        Couldn&apos;t load products waiting for review.
      </p>
    );
  if (!data || data.totals.candidates === 0) return null;
  const t = data.totals;
  const sources = new Set(
    data.groups.flatMap((g) => g.candidates.map((c) => `${c.source.kind}:${c.source.name}`)),
  ).size;
  const FILTERS: [Filter, string][] = [
    ['all', 'All'],
    ['decide', 'Needs a decision'],
    ['brain', 'Already in Brain'],
    ['ready', 'Ready'],
  ];

  return (
    <section
      aria-label="Product review"
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GitCompare size={16} aria-hidden className="text-primary" />
        <h3 className="m-0 text-[14.5px] font-semibold">Product review</h3>
        <span className="text-[12.5px] text-muted">
          {t.groups} product{t.groups === 1 ? '' : 's'} from {sources} source
          {sources === 1 ? '' : 's'}
          {t.conflicts > 0 && ` · ${t.conflicts} with conflicting details`}
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter products"
      >
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => {
              setFilter(k);
              setLimit(20);
            }}
            className={cn(
              'h-8 cursor-pointer rounded-full border px-3 text-[12.5px]',
              filter === k
                ? 'border-primary-line bg-primary-soft font-semibold text-primary-hover'
                : 'border-line bg-white text-muted hover:bg-wash',
            )}
          >
            {l}
          </button>
        ))}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={clear.isPending}
          onClick={() => clear.mutate(undefined, { onError: fail })}
        >
          Approve all without conflicts
        </Button>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.slice(0, limit).map((g) => {
          const multi = decide(g);
          return (
            <li key={g.key} className="rounded-xl border border-line p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="m-0 text-[13.5px] font-semibold">{g.name}</h4>
                {g.candidates.length > 1 && (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-hover">
                    {g.candidates.length} sources
                  </span>
                )}
                {g.conflicts.length > 0 && (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                    Sources disagree: {g.conflicts.map((c) => FIELD[c.field] ?? c.field).join(', ')}
                  </span>
                )}
                {g.inBrain && (
                  <span className="rounded-full bg-wash-2 px-2 py-0.5 text-[11px] text-muted">
                    Already in your Brain
                  </span>
                )}
                <span className="flex-1" />
                {multi && (
                  <Button size="sm" onClick={() => setResolving(g)}>
                    Resolve
                  </Button>
                )}
              </div>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {g.candidates.map((c) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    solo={!multi}
                    onStatus={(s) => status.mutate({ id: c.id, status: s }, { onError: fail })}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && (
        <Button variant="outline" className="self-center" onClick={() => setLimit((n) => n + 20)}>
          Show more ({shown.length - limit} left)
        </Button>
      )}
      {shown.length === 0 && (
        <p className="m-0 text-[13px] text-muted">Nothing matches this filter.</p>
      )}
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
          <b className="text-ink">{t.approved}</b> approved. Only approved products are added to
          your Brain.
        </span>
        <span className="flex-1" />
        <Button
          disabled={t.approved === 0 || imp.isPending}
          onClick={() => {
            setError('');
            imp.mutate(undefined, {
              onSuccess: (r) => {
                setNote(
                  `Imported ${r.imported} product${r.imported === 1 ? '' : 's'} into Brain.${r.notes.length ? ' ' + r.notes.join(' ') : ''}`,
                );
                onImported();
              },
              onError: fail,
            });
          }}
        >
          {imp.isPending ? 'Importing…' : `Import ${t.approved} approved`}
        </Button>
      </div>
      {resolving && <ResolveDialog ws={ws} g={resolving} onClose={() => setResolving(null)} />}
    </section>
  );
}
