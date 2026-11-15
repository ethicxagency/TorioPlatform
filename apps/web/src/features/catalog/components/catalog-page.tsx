'use client';

import type { CatalogProduct } from '@torio/contracts';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { controlCls } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/features/brain/components/bits';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { toast } from '@/lib/toast';
import { useWorkspace } from '@/lib/workspace';
import { useCatalogList, useCatalogMutations, useCatalogProduct } from '../queries';
import { ActivityTab, FeedsTab, ImportsTab, SalesChannelsTab } from './catalog-panels';
import { ProductDrawer } from './product-drawer';

const TABS = [
  { key: 'products', label: 'All Products' },
  { key: 'imports', label: 'Imports' },
  { key: 'channels', label: 'Sales Channels' },
  { key: 'feeds', label: 'Product Feeds' },
  { key: 'activity', label: 'Sync Activity' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const STATUS_TONE = { ACTIVE: 'ok', DRAFT: 'warn', ARCHIVED: 'neutral' } as const;
const STATUS_LABEL = { ACTIVE: 'Active', DRAFT: 'Draft', ARCHIVED: 'Archived' } as const;
export const SOURCE_LABEL = {
  MANUAL: 'Manual',
  XML_IMPORT: 'XML import',
  FEED: 'Product feed',
  INTELLIGENT: 'Intelligent',
  CHANNEL: 'Channel sync',
} as const;

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export function CatalogPage() {
  const { workspaceId: ws, can, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>('products');
  if (isLoading) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!can('catalog:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Products in this workspace.
      </div>
    );
  const tabs = TABS.filter((t) => t.key !== 'channels' || can('catalog:feeds'));
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 pb-10 pt-5 sm:px-6">
      <header>
        <h1 className="m-0 text-xl font-semibold">Products</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">
          The same products your AI uses on the Intelligent page. A change here shows there, and the
          other way round.
        </p>
      </header>
      <div
        role="tablist"
        aria-label="Products sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 bg-transparent px-3 py-2.5 text-[13.5px] font-medium focus-visible:outline-2 focus-visible:outline-primary ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'products' && (
        <ProductsTab
          ws={ws}
          canWrite={can('catalog:write')}
          canDelete={can('catalog:delete')}
          canImport={can('catalog:import')}
          goImport={() => setTab('imports')}
        />
      )}
      {tab === 'imports' && (
        <ImportsTab ws={ws} canImport={can('catalog:import')} canFeeds={can('catalog:feeds')} />
      )}
      {tab === 'channels' && <SalesChannelsTab ws={ws} />}
      {tab === 'feeds' && (
        <FeedsTab ws={ws} canImport={can('catalog:import')} canFeeds={can('catalog:feeds')} />
      )}
      {tab === 'activity' && <ActivityTab ws={ws} />}
    </div>
  );
}

const money = (p: CatalogProduct) =>
  p.price === null
    ? p.priceText || '—'
    : `${p.price.toLocaleString()}${p.currency ? ` ${p.currency}` : ''}`;

function ProductsTab({
  ws,
  canWrite,
  canDelete,
  canImport,
  goImport,
}: {
  ws: string | null;
  canWrite: boolean;
  canDelete: boolean;
  canImport: boolean;
  goImport: () => void;
}) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('updated:desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [formError, setFormError] = useState('');
  const [del, setDel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const [sortKey, dir] = sort.split(':') as [
    'name' | 'price' | 'updated' | 'stock',
    'asc' | 'desc',
  ];
  const list = useCatalogList(ws, {
    q: term || undefined,
    status: (status || undefined) as never,
    source: (source || undefined) as never,
    sort: sortKey,
    dir,
    page,
    pageSize,
  });
  const detail = useCatalogProduct(ws, openId && openId !== 'new' ? openId : null);
  const m = useCatalogMutations(ws);
  const items = list.data?.items ?? [];
  const stats = list.data?.stats;
  const allOn = items.length > 0 && items.every((p) => sel.has(p.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const cards: [string, number | undefined][] = [
    ['Total products', stats?.total],
    ['Active', stats?.active],
    ['Draft', stats?.draft],
    ['Out of stock', stats?.outOfStock],
    ['Imported', stats?.imported],
    ['Connected feeds', stats?.connectedFeeds],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, n]) => (
          <Card key={label} className="p-3.5">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{n ?? '—'}</div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={15}
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              aria-label="Search products"
              className={`${controlCls} pl-9`}
              placeholder="Search name, SKU, brand or category"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            className="min-w-[130px]"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
          <Select
            aria-label="Filter by source"
            value={source}
            onChange={(v) => {
              setSource(v);
              setPage(1);
            }}
            className="min-w-[140px]"
            options={[
              { value: '', label: 'All sources' },
              ...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            aria-label="Sort products"
            value={sort}
            onChange={(v) => {
              setSort(v);
              setPage(1);
            }}
            className="min-w-[160px]"
            options={[
              { value: 'updated:desc', label: 'Newest updated' },
              { value: 'name:asc', label: 'Name A–Z' },
              { value: 'name:desc', label: 'Name Z–A' },
              { value: 'price:asc', label: 'Price low to high' },
              { value: 'price:desc', label: 'Price high to low' },
              { value: 'stock:asc', label: 'Stock: lowest first' },
            ]}
          />
          {canImport && (
            <Button variant="outline" onClick={goImport}>
              Import
            </Button>
          )}
          {canWrite && (
            <Button
              onClick={() => {
                setFormError('');
                setOpenId('new');
              }}
            >
              <Plus /> Add product
            </Button>
          )}
        </div>
        {sel.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 bg-wash px-3 py-2 text-[13px]"
            role="status"
          >
            <span className="font-medium">{sel.size} selected</span>
            {canWrite && (
              <Select
                aria-label="Change status of selected"
                placeholder="Change status…"
                value=""
                className="min-w-[160px]"
                onChange={(v) =>
                  m.bulkStatus.mutate(
                    { ids: [...sel], status: v as never },
                    {
                      onSuccess: (r) => {
                        toast.success(`${r.changed} product${r.changed === 1 ? '' : 's'} updated.`);
                        setSel(new Set());
                      },
                      onError: (e) => toast.error(errText(e)),
                    },
                  )
                }
                options={[
                  { value: 'ACTIVE', label: 'Set Active' },
                  { value: 'DRAFT', label: 'Set Draft' },
                  { value: 'ARCHIVED', label: 'Archive' },
                ]}
              />
            )}
            {canDelete && (
              <Button variant="outline" size="sm" onClick={() => setDel(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>
              Clear
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle text-left text-xs text-muted">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOn}
                    onChange={() => setSel(allOn ? new Set() : new Set(items.map((p) => p.id)))}
                  />
                </th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Stock</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.isPending &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="p-3">
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))}
              {items.map((p) => (
                <tr key={p.id} className="border-b border-line-subtle hover:bg-wash/60">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={sel.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td className="max-w-[320px] p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setOpenId(p.id);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied remote image
                        <img
                          src={p.images[0]}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                        />
                      ) : (
                        <span aria-hidden className="h-10 w-10 shrink-0 rounded-md bg-wash-2" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{p.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {p.description || p.category || 'No description'}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="p-3 text-muted">{p.sku || '—'}</td>
                  <td className="p-3 tabular-nums">
                    {money(p)}
                    {p.compareAtPrice !== null && (
                      <span className="ml-1 text-xs text-faint line-through">
                        {p.compareAtPrice}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {p.stock}
                    {p.stockQty !== null && (
                      <span className="text-xs text-muted"> · {p.stockQty}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>
                  </td>
                  <td className="p-3 text-muted">{p.sourceName ?? SOURCE_LABEL[p.source]}</td>
                  <td className="p-3 text-muted">
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {list.isError && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-danger" role="alert">
                    Could not load products. {errText(list.error)}
                  </td>
                </tr>
              )}
              {list.isSuccess && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <div className="font-semibold">
                      {term || status || source ? 'No products match.' : 'No products yet'}
                    </div>
                    {!term && !status && !source && (
                      <div className="mt-1 text-muted">
                        Add a product by hand, or import an XML product feed.
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          total={list.data?.total ?? 0}
          pageSize={pageSize}
          onPage={setPage}
          noun="products"
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>
      {openId === 'new' && (
        <ProductDrawer
          product={null}
          canWrite={canWrite}
          busy={m.create.isPending}
          error={formError}
          onClose={() => setOpenId(null)}
          onSave={(v) =>
            m.create.mutate(v, {
              onSuccess: () => {
                toast.success('Product added.');
                setOpenId(null);
              },
              onError: (e) => setFormError(errText(e)),
            })
          }
        />
      )}
      {openId && openId !== 'new' && detail.data && (
        <ProductDrawer
          key={detail.data.updatedAt ?? detail.data.id}
          product={detail.data}
          canWrite={canWrite}
          busy={m.update.isPending}
          error={formError}
          onClose={() => setOpenId(null)}
          onSave={(v) =>
            m.update.mutate(
              { id: openId, body: { ...v, baseUpdatedAt: detail.data!.updatedAt } },
              {
                onSuccess: () => {
                  toast.success('Product saved.');
                  setOpenId(null);
                },
                onError: (e) => setFormError(errText(e)),
              },
            )
          }
        />
      )}
      {del && (
        <ConfirmDialog
          title={`Delete ${sel.size} product${sel.size === 1 ? '' : 's'}?`}
          body="Deleted products are removed from the catalog and from what your AI knows. Products that a live feed manages are archived instead, because the next sync would add them back. Past orders keep their own copy of the name and price."
          confirmLabel="Delete"
          busy={m.bulkDelete.isPending}
          onCancel={() => setDel(false)}
          onConfirm={() =>
            m.bulkDelete.mutate(
              { ids: [...sel] },
              {
                onSuccess: (r) => {
                  toast.success(
                    `${r.changed} deleted${r.archived ? `, ${r.archived} archived` : ''}.`,
                  );
                  setSel(new Set());
                  setDel(false);
                },
                onError: (e) => {
                  toast.error(errText(e));
                  setDel(false);
                },
              },
            )
          }
        />
      )}
    </>
  );
}
