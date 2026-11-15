'use client';

import {
  CATALOG_FIELDS,
  CHANNEL_LABEL,
  FEED_CHANNELS,
  type CatalogImportResult,
} from '@torio/contracts';
import { Copy, KeyRound, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { controlCls } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, Pill, TextField } from '@/features/brain/components/bits';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { toast } from '@/lib/toast';
import {
  useCatalogActivity,
  useCatalogFeeds,
  useCatalogMutations,
  useSalesChannels,
} from '../queries';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const when = (v: string | null) => (v ? new Date(v).toLocaleString() : 'Never');

const FIELD_LABEL: Record<(typeof CATALOG_FIELDS)[number], string> = {
  externalId: 'Product ID',
  name: 'Title',
  description: 'Description',
  price: 'Price',
  salePrice: 'Sale price',
  currency: 'Currency',
  stock: 'Availability',
  sku: 'SKU',
  brand: 'Brand',
  category: 'Category',
  url: 'Product page',
  image: 'Image',
  additionalImages: 'Additional images',
  gtin: 'GTIN',
  mpn: 'MPN',
  colors: 'Colours',
  sizes: 'Sizes',
};

// ---------------------------------------------------------------- imports

export function ImportsTab({
  ws,
  canImport,
  canFeeds,
}: {
  ws: string | null;
  canImport: boolean;
  canFeeds: boolean;
}) {
  const m = useCatalogMutations(ws);
  const [kind, setKind] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [xml, setXml] = useState('');
  const [fileName, setFileName] = useState('');
  const [currency, setCurrency] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Set<string> | null>(null);
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE');
  const [save, setSave] = useState(false);
  const [feedName, setFeedName] = useState('');
  const [frequency, setFrequency] = useState<'manual' | 'daily' | 'weekly'>('daily');
  const [result, setResult] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState('');
  const p = m.preview.data;
  const source = () => (kind === 'url' ? { url: url.trim() } : { xml });
  const ready = kind === 'url' ? url.trim().length > 3 : xml.length > 10;
  const runPreview = (map: Record<string, string> = mapping) => {
    setError('');
    setResult(null);
    m.preview.mutate(
      {
        ...source(),
        mapping: Object.keys(map).length ? map : undefined,
        currency: currency.length === 3 ? currency : undefined,
      },
      {
        onSuccess: (r) => {
          setKeys(new Set(r.items.map((i) => i.key)));
          if (!feedName)
            setFeedName(
              kind === 'url'
                ? new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname
                : '',
            );
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  if (!canImport)
    return (
      <Card className="p-6 text-sm text-muted">
        You don&apos;t have permission to import products.
      </Card>
    );
  const chosen = keys?.size ?? 0;
  const allKeys = p && keys && keys.size === p.items.length && p.items.length === p.valid;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <h2 className="m-0 text-base font-semibold">Import products from XML</h2>
          <p className="m-0 mt-1 text-[13px] text-muted">
            Google Merchant, RSS, Atom or a plain list of products. Torio reads the file on its own
            servers and only reads text: nothing in it is run or followed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={kind === 'url' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setKind('url')}
          >
            XML link
          </Button>
          <Button
            variant={kind === 'file' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setKind('file')}
          >
            Upload XML file
          </Button>
        </div>
        {kind === 'url' ? (
          <TextField
            label="Feed address"
            value={url}
            onChange={setUrl}
            placeholder="https://example.com/products.xml"
          />
        ) : (
          <Field label="XML file" hint={fileName ? `${fileName} loaded.` : 'Up to 6 MB.'}>
            {(id) => (
              <input
                id={id}
                type="file"
                accept=".xml,text/xml,application/xml"
                className={controlCls}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 6 * 1024 * 1024) return setError('That file is larger than 6 MB.');
                  setFileName(f.name);
                  setXml(await f.text());
                }}
              />
            )}
          </Field>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Currency if the feed has none"
            value={currency}
            onChange={(v) => setCurrency(v.toUpperCase().slice(0, 3))}
            placeholder="BDT"
            className="w-48"
          />
          <Button loading={m.preview.isPending} disabled={!ready} onClick={() => runPreview()}>
            Preview
          </Button>
        </div>
        {error && (
          <div role="alert" className="rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
            {error}
          </div>
        )}
      </Card>

      {p && (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Pill tone="info">{p.format.toUpperCase()}</Pill>
            <Pill tone="ok">{p.valid} ready to import</Pill>
            <Pill tone="neutral">{p.existing} already in your catalog</Pill>
            {p.invalid > 0 && <Pill tone="warn">{p.invalid} skipped (no title)</Pill>}
            {p.duplicatesInFeed > 0 && (
              <Pill tone="warn">{p.duplicatesInFeed} duplicates in the feed</Pill>
            )}
          </div>
          {p.issues.length > 0 && (
            <ul className="m-0 list-disc pl-5 text-[13px] text-muted">
              {p.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-[13px] font-medium">Field mapping</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOG_FIELDS.map((f) => (
                <Field key={f} label={FIELD_LABEL[f]}>
                  {(id) => (
                    <Select
                      id={id}
                      className="w-full"
                      value={p.mapping[f] ?? ''}
                      onChange={(v) => {
                        const next = { ...p.mapping, ...mapping, [f]: v };
                        setMapping(next);
                        runPreview(next);
                      }}
                      options={[
                        { value: '', label: '(not used)' },
                        ...p.tags.map((t) => ({ value: t, label: t })),
                      ]}
                    />
                  )}
                </Field>
              ))}
            </div>
          </details>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs text-muted">
                  <th className="w-10 p-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={chosen === p.items.length}
                      onChange={() =>
                        setKeys(
                          chosen === p.items.length
                            ? new Set()
                            : new Set(p.items.map((i) => i.key)),
                        )
                      }
                    />
                  </th>
                  <th className="p-2 font-medium">Product</th>
                  <th className="p-2 font-medium">SKU</th>
                  <th className="p-2 font-medium">Price</th>
                  <th className="p-2 font-medium">In catalog</th>
                  <th className="p-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {p.items.slice(0, 100).map((i) => (
                  <tr key={i.key} className="border-b border-line-subtle">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Import ${i.name}`}
                        checked={keys?.has(i.key) ?? false}
                        onChange={() =>
                          setKeys((k) => {
                            const n = new Set(k);
                            if (!n.delete(i.key)) n.add(i.key);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <span className="flex items-center gap-2">
                        {i.image && (
                          <img src={i.image} alt="" className="h-8 w-8 rounded object-cover" />
                        )}
                        {i.name}
                      </span>
                    </td>
                    <td className="p-2 text-muted">{i.sku || '—'}</td>
                    <td className="p-2 tabular-nums">{i.price || '—'}</td>
                    <td className="p-2">
                      {i.match === 'existing' ? (
                        <Pill tone="neutral">Duplicate</Pill>
                      ) : (
                        <Pill tone="ok">New</Pill>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted">{i.warnings.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.items.length > 100 && (
              <p className="mt-2 text-xs text-muted">
                Showing the first 100 of {p.items.length}. Selection applies to all of them.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Products that already exist">
              {(id) => (
                <Select
                  id={id}
                  className="w-full"
                  value={mode}
                  onChange={(v) => setMode(v as 'skip' | 'update')}
                  options={[
                    { value: 'skip', label: 'Skip them' },
                    { value: 'update', label: 'Update feed-imported ones (never your hand edits)' },
                  ]}
                />
              )}
            </Field>
            <Field label="Import new products as">
              {(id) => (
                <Select
                  id={id}
                  className="w-full"
                  value={status}
                  onChange={(v) => setStatus(v as 'ACTIVE' | 'DRAFT')}
                  options={[
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'DRAFT', label: 'Draft (review first)' },
                  ]}
                />
              )}
            </Field>
          </div>
          {kind === 'url' && canFeeds && (
            <div className="flex flex-col gap-3 rounded-lg bg-wash p-3">
              <label className="flex items-center gap-2 text-[13px] font-medium">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />{' '}
                Keep this feed and sync it on a schedule
              </label>
              {save && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Feed name" value={feedName} onChange={setFeedName} />
                  <Field label="Sync">
                    {(id) => (
                      <Select
                        id={id}
                        className="w-full"
                        value={frequency}
                        onChange={(v) => setFrequency(v as never)}
                        options={[
                          { value: 'daily', label: 'Every day' },
                          { value: 'weekly', label: 'Every week' },
                          { value: 'manual', label: 'Only when I press Sync now' },
                        ]}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              loading={m.runImport.isPending}
              disabled={chosen === 0 || (save && !feedName.trim())}
              onClick={() =>
                m.runImport.mutate(
                  {
                    ...source(),
                    mapping: Object.keys(mapping).length ? mapping : undefined,
                    currency: currency.length === 3 ? currency : undefined,
                    keys: allKeys ? undefined : [...(keys ?? [])],
                    mode,
                    status,
                    saveAsFeed:
                      save && kind === 'url' && canFeeds
                        ? { name: feedName.trim(), frequency }
                        : undefined,
                  },
                  {
                    onSuccess: (r) => {
                      setResult(r);
                      toast.success('Import finished.');
                    },
                    onError: (e) => setError(errText(e)),
                  },
                )
              }
            >
              Import {chosen} product{chosen === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-4 sm:p-5" role="status">
          <h3 className="m-0 text-base font-semibold">Import summary</h3>
          <p className="m-0 mt-2 text-[13px]">
            {result.created} added · {result.updated} updated · {result.skipped} skipped ·{' '}
            {result.failed} failed{result.capped ? ` · ${result.capped} over the limit` : ''}
          </p>
          {result.notes.length > 0 && (
            <ul className="m-0 mt-2 list-disc pl-5 text-[13px] text-muted">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- saved feeds

const FEED_TONE = {
  ACTIVE: 'ok',
  PAUSED: 'neutral',
  ERROR: 'bad',
  DISCONNECTED: 'neutral',
} as const;

export function FeedsTab({
  ws,
  canImport,
  canFeeds,
}: {
  ws: string | null;
  canImport: boolean;
  canFeeds: boolean;
}) {
  const q = useCatalogFeeds(ws);
  const m = useCatalogMutations(ws);
  const [del, setDel] = useState<string | null>(null);
  const done = (msg: string) => ({
    onSuccess: () => toast.success(msg),
    onError: (e: unknown) => toast.error(errText(e)),
  });
  return (
    <div className="flex flex-col gap-3">
      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.data?.length === 0 && (
        <Card className="p-8 text-center">
          <div className="font-semibold">No product feeds yet</div>
          <p className="m-0 mt-1 text-[13px] text-muted">
            Import from an XML link and choose &ldquo;Keep this feed and sync it on a
            schedule&rdquo;.
          </p>
        </Card>
      )}
      {q.data?.map((f) => (
        <Card key={f.id} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{f.name}</h3>
            <Pill tone={FEED_TONE[f.status]}>
              {f.status === 'ERROR'
                ? 'Last sync failed'
                : f.status === 'PAUSED'
                  ? 'Paused'
                  : 'Active'}
            </Pill>
            <span className="text-xs text-muted">
              {f.frequency === 'manual' ? 'Manual' : f.frequency === 'daily' ? 'Daily' : 'Weekly'} ·{' '}
              {f.productCount} products · last sync {when(f.lastSyncedAt)}
            </span>
          </div>
          <div className="truncate text-xs text-muted">{f.url}</div>
          {f.lastError && (
            <div role="alert" className="text-[13px] text-danger">
              {f.lastError}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canImport && (
              <Button
                size="sm"
                variant="outline"
                loading={m.syncFeed.isPending && m.syncFeed.variables === f.id}
                disabled={f.status === 'PAUSED'}
                onClick={() =>
                  m.syncFeed.mutate(f.id, {
                    onSuccess: (r) =>
                      toast.success(`Synced: ${r.created} added, ${r.updated} updated.`),
                    onError: (e) => toast.error(errText(e)),
                  })
                }
              >
                <RefreshCw /> Sync now
              </Button>
            )}
            {canFeeds &&
              (f.status === 'PAUSED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => m.resumeFeed.mutate(f.id, done('Feed resumed.'))}
                >
                  <Play /> Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => m.pauseFeed.mutate(f.id, done('Feed paused.'))}
                >
                  <Pause /> Pause
                </Button>
              ))}
            {canFeeds && (
              <Select
                aria-label={`Schedule for ${f.name}`}
                value={f.frequency}
                className="min-w-[150px]"
                onChange={(v) =>
                  m.updateFeed.mutate({ id: f.id, body: { frequency: v } }, done('Schedule saved.'))
                }
                options={[
                  { value: 'daily', label: 'Every day' },
                  { value: 'weekly', label: 'Every week' },
                  { value: 'manual', label: 'Manual only' },
                ]}
              />
            )}
            {canFeeds && (
              <Button size="sm" variant="ghost" onClick={() => setDel(f.id)}>
                <Trash2 /> Delete
              </Button>
            )}
          </div>
        </Card>
      ))}
      {del && (
        <ConfirmDialog
          title="Delete this feed?"
          body="Syncing stops. Products already imported stay in your catalog, and the original feed is never changed."
          confirmLabel="Delete feed"
          onCancel={() => setDel(null)}
          onConfirm={() =>
            m.deleteFeed.mutate(del, {
              onSuccess: () => {
                toast.success('Feed deleted.');
                setDel(null);
              },
              onError: (e) => {
                toast.error(errText(e));
                setDel(null);
              },
            })
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sales channels

export function SalesChannelsTab({ ws }: { ws: string | null }) {
  const q = useSalesChannels(ws, true);
  const m = useCatalogMutations(ws);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<(typeof FEED_CHANNELS)[number]>('GOOGLE');
  const [inStock, setInStock] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [rot, setRot] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ id: string; text: string } | null>(null);
  const ok = (msg: string) => ({
    onSuccess: () => toast.success(msg),
    onError: (e: unknown) => toast.error(errText(e)),
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="m-0 text-base font-semibold">Create a product feed</h2>
        <p className="m-0 text-[13px] text-muted">
          Torio publishes your active products as an XML file at a private address. Add that address
          in Google Merchant Center, Meta Commerce Manager or TikTok Catalog Manager as a scheduled
          feed. Torio cannot see whether a channel has fetched or accepted it, so this is not a
          connection. Meta Pixel tracking is separate from a Meta catalog.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <TextField
            label="Feed name"
            value={name}
            onChange={setName}
            placeholder="Google Shopping"
          />
          <Field label="Channel">
            {(id) => (
              <Select
                id={id}
                className="w-full"
                value={channel}
                onChange={(v) => setChannel(v as never)}
                options={FEED_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
              />
            )}
          </Field>
          <Button
            loading={m.createOutbound.isPending}
            disabled={!name.trim()}
            onClick={() =>
              m.createOutbound.mutate(
                { name: name.trim(), channel, inStockOnly: inStock },
                {
                  onSuccess: () => {
                    toast.success('Feed created.');
                    setName('');
                  },
                  onError: (e) => toast.error(errText(e)),
                },
              )
            }
          >
            Create feed
          </Button>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />{' '}
          Leave out products that are out of stock
        </label>
      </Card>
      {q.isPending && <Skeleton className="h-24 w-full" />}
      {q.data?.feeds.map((f) => (
        <Card key={f.id} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{f.name}</h3>
            <Pill tone="info">{CHANNEL_LABEL[f.channel]}</Pill>
            <Pill tone={f.status === 'ACTIVE' ? 'ok' : 'neutral'}>
              {f.status === 'ACTIVE' ? 'Publishing' : 'Paused'}
            </Pill>
            <span className="text-xs text-muted">
              {f.productCount} products · fetched {f.servedCount} times · last{' '}
              {when(f.lastServedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Feed address"
              className={`${controlCls} text-xs`}
              value={f.url || 'Rotate this feed to get a new address.'}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!f.url}
              onClick={() =>
                navigator.clipboard.writeText(f.url).then(
                  () => toast.success('Address copied.'),
                  () => toast.error('Could not copy.'),
                )
              }
            >
              <Copy /> Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                m.previewOutbound(f.id).then(
                  (r) =>
                    setPrev({
                      id: f.id,
                      text: `${r.included} included · ${r.excludedCount} left out (missing data) · ${r.notPublished} draft or archived not published${
                        r.excluded.length
                          ? '\n\nLeft out:\n' +
                            r.excluded
                              .slice(0, 10)
                              .map((x) => `• ${x.name}: ${x.reasons.join(', ')}`)
                              .join('\n')
                          : ''
                      }\n\n${r.sampleXml.slice(0, 1800)}`,
                    }),
                  (e) => toast.error(errText(e)),
                )
              }
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                m.updateOutbound.mutate(
                  { id: f.id, body: { status: f.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } },
                  ok(f.status === 'ACTIVE' ? 'Feed paused.' : 'Feed resumed.'),
                )
              }
            >
              {f.status === 'ACTIVE' ? (
                <>
                  <Pause /> Pause
                </>
              ) : (
                <>
                  <Play /> Resume
                </>
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRot(f.id)}>
              <KeyRound /> Rotate address
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDel(f.id)}>
              <Trash2 /> Delete
            </Button>
          </div>
          {prev?.id === f.id && (
            <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-wash p-3 text-xs">
              {prev.text}
            </pre>
          )}
        </Card>
      ))}
      <Card className="flex flex-col gap-2 p-4">
        <h3 className="m-0 text-[15px] font-semibold">
          Catalogs connected on the Intelligent page
        </h3>
        {q.data?.connections.map((c) => (
          <div key={c.kind} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium">{c.label}</span>
            <Pill tone={c.connected ? 'ok' : c.lastError ? 'bad' : 'neutral'}>
              {c.connected
                ? `Connected${c.name ? `: ${c.name}` : ''}`
                : c.lastError
                  ? 'Needs attention'
                  : 'Not connected'}
            </Pill>
            {c.lastSyncedAt && (
              <span className="text-xs text-muted">last import {when(c.lastSyncedAt)}</span>
            )}
          </div>
        ))}
        <p className="m-0 text-xs text-muted">
          These pull products into Torio. Connect or reconnect them from the Intelligent page.
        </p>
      </Card>
      {rot && (
        <ConfirmDialog
          title="Rotate this address?"
          body="A new private address is created and the current one stops working immediately. Update it in the channel afterwards."
          confirmLabel="Rotate address"
          destructive={false}
          onCancel={() => setRot(null)}
          onConfirm={() =>
            m.rotateOutbound.mutate(rot, {
              onSuccess: () => {
                toast.success('New address created.');
                setRot(null);
              },
              onError: (e) => {
                toast.error(errText(e));
                setRot(null);
              },
            })
          }
        />
      )}
      {del && (
        <ConfirmDialog
          title="Delete this feed?"
          body="The address stops working at once. Products are not affected."
          confirmLabel="Delete feed"
          onCancel={() => setDel(null)}
          onConfirm={() =>
            m.deleteOutbound.mutate(del, {
              onSuccess: () => {
                toast.success('Feed deleted.');
                setDel(null);
              },
              onError: (e) => {
                toast.error(errText(e));
                setDel(null);
              },
            })
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- activity

export function ActivityTab({ ws }: { ws: string | null }) {
  const q = useCatalogActivity(ws);
  const num = (s: Record<string, unknown> | null, k: string) =>
    typeof s?.[k] === 'number' ? (s[k] as number) : 0;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-subtle text-left text-xs text-muted">
            <th className="p-3 font-medium">When</th>
            <th className="p-3 font-medium">Source</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {q.isPending && (
            <tr>
              <td colSpan={4} className="p-3">
                <Skeleton className="h-8 w-full" />
              </td>
            </tr>
          )}
          {q.data?.length === 0 && (
            <tr>
              <td colSpan={4} className="p-8 text-center text-muted">
                No imports or syncs yet.
              </td>
            </tr>
          )}
          {q.data?.map((a) => (
            <tr key={a.id} className="border-b border-line-subtle align-top">
              <td className="p-3 text-muted">{when(a.startedAt ?? a.createdAt)}</td>
              <td className="p-3">
                {a.sourceName ??
                  (a.kind === 'MANUAL'
                    ? 'XML file or CSV'
                    : a.kind === 'XML_FEED'
                      ? 'XML link'
                      : a.kind.replace('_', ' ').toLowerCase())}
              </td>
              <td className="p-3">
                <Pill
                  tone={a.status === 'COMPLETED' ? 'ok' : a.status === 'FAILED' ? 'bad' : 'info'}
                >
                  {a.status.replace('_', ' ').toLowerCase()}
                </Pill>
              </td>
              <td className="p-3 text-muted">
                {a.error ??
                  (a.stats
                    ? `${num(a.stats, 'created')} added · ${num(a.stats, 'updated')} updated · ${num(a.stats, 'skipped')} skipped · ${num(a.stats, 'failed')} failed`
                    : '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
