'use client';

import type { CatalogProduct, CatalogProductInput } from '@torio/contracts';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { controlCls } from '@/components/ui/input';
import { Drawer, Field, TextField, areaCls } from '@/features/brain/components/bits';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';

const STOCKS = ['In stock', 'Low stock', 'Out of stock', 'Pre-order'] as const;
const STATUSES = [
  { value: 'ACTIVE', label: 'Active', dot: 'ok' as const },
  { value: 'DRAFT', label: 'Draft', dot: 'warn' as const },
  { value: 'ARCHIVED', label: 'Archived', dot: 'neutral' as const },
];

const blank = (): CatalogProductInput => ({
  name: '',
  description: '',
  price: '',
  compareAtPrice: '',
  currency: '',
  sku: '',
  category: '',
  brand: '',
  url: '',
  gtin: '',
  mpn: '',
  stock: 'In stock',
  stockQty: null,
  status: 'ACTIVE',
  images: [],
  variants: '',
  sizes: '',
  colors: '',
});

const fromProduct = (p: CatalogProduct): CatalogProductInput => ({
  name: p.name,
  description: p.description,
  price: p.price === null ? '' : String(p.price),
  compareAtPrice: p.compareAtPrice === null ? '' : String(p.compareAtPrice),
  currency: p.currency,
  sku: p.sku,
  category: p.category,
  brand: p.brand,
  url: p.url,
  gtin: p.gtin,
  mpn: p.mpn,
  stock: p.stock,
  stockQty: p.stockQty,
  status: p.status,
  images: p.images,
  variants: p.variants,
  sizes: p.sizes,
  colors: p.colors,
});

/**
 * Add or edit one product. Nothing saves until Save is pressed; closing with unsaved changes asks first. A save the server
 * refuses because the product changed elsewhere shows that message and keeps the edit on screen.
 */
export function ProductDrawer({
  product,
  canWrite,
  busy,
  error,
  onClose,
  onSave,
}: {
  product: CatalogProduct | null;
  canWrite: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (v: CatalogProductInput) => void;
}) {
  const initial = useMemo(() => (product ? fromProduct(product) : blank()), [product]);
  const [f, setF] = useState(initial);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof CatalogProductInput>(k: K, v: CatalogProductInput[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  const price = /^\d+(\.\d{1,4})?$/;
  const errs = {
    name: !f.name.trim() ? 'Enter a product name.' : '',
    price: !price.test(f.price.trim()) ? 'Enter a price in numbers, such as 1450.' : '',
    compare: f.compareAtPrice && !price.test(f.compareAtPrice) ? 'Enter a price in numbers.' : '',
  };
  const bad = !!(errs.name || errs.price || errs.compare);
  const close = () => (dirty ? setConfirm(true) : onClose());
  const move = (i: number, d: number) =>
    set(
      'images',
      f.images.map((_, k, a) => a[k === i ? i + d : k === i + d ? i : k]!),
    );
  return (
    <>
      <Drawer
        title={product ? 'Edit product' : 'Add product'}
        onClose={close}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            {canWrite && (
              <Button
                loading={busy}
                disabled={!dirty && !!product}
                onClick={() => {
                  setTried(true);
                  if (!bad) onSave({ ...f, name: f.name.trim(), price: f.price.trim() });
                }}
              >
                {product ? 'Save changes' : 'Add product'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4 p-5">
          {error && (
            <div role="alert" className="rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
              {error}
            </div>
          )}
          {product && product.edited.length > 0 && (
            <p className="m-0 rounded-lg bg-wash p-3 text-xs text-muted">
              You edited {product.edited.join(', ')} by hand, so a feed sync will not overwrite{' '}
              {product.edited.length === 1 ? 'it' : 'them'}.
            </p>
          )}
          <TextField
            label="Name"
            value={f.name}
            onChange={(v) => set('name', v)}
            error={tried ? errs.name : ''}
          />
          <Field label="Description">
            {(id) => (
              <textarea
                id={id}
                rows={4}
                className={areaCls}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Price"
              value={f.price}
              onChange={(v) => set('price', v)}
              error={tried ? errs.price : ''}
            />
            <TextField
              label="Compare-at price"
              value={f.compareAtPrice ?? ''}
              onChange={(v) => set('compareAtPrice', v)}
              error={tried ? errs.compare : ''}
              hint="The price before a discount."
            />
            <TextField
              label="Currency"
              value={f.currency ?? ''}
              onChange={(v) => set('currency', v.toUpperCase().slice(0, 3))}
              hint="Optional, e.g. BDT."
            />
            <TextField label="SKU" value={f.sku} onChange={(v) => set('sku', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              {(id) => (
                <Select
                  id={id}
                  value={f.status}
                  onChange={(v) => set('status', v as CatalogProductInput['status'])}
                  options={STATUSES}
                  className="w-full"
                />
              )}
            </Field>
            <Field label="Availability">
              {(id) => (
                <Select
                  id={id}
                  value={f.stock}
                  onChange={(v) => set('stock', v as CatalogProductInput['stock'])}
                  options={STOCKS.map((s) => ({ value: s, label: s }))}
                  className="w-full"
                />
              )}
            </Field>
            <TextField
              label="Stock quantity"
              type="number"
              value={f.stockQty === null ? '' : String(f.stockQty)}
              onChange={(v) =>
                set('stockQty', v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)))
              }
              hint="0 marks the product out of stock."
            />
            <TextField label="Category" value={f.category} onChange={(v) => set('category', v)} />
            <TextField label="Brand" value={f.brand} onChange={(v) => set('brand', v)} />
            <TextField label="Product page link" value={f.url} onChange={(v) => set('url', v)} />
            <TextField label="GTIN" value={f.gtin} onChange={(v) => set('gtin', v)} />
            <TextField label="MPN" value={f.mpn} onChange={(v) => set('mpn', v)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              label="Variants"
              value={f.variants}
              onChange={(v) => set('variants', v)}
              hint="Comma separated."
            />
            <TextField label="Sizes" value={f.sizes} onChange={(v) => set('sizes', v)} />
            <TextField label="Colours" value={f.colors} onChange={(v) => set('colors', v)} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Images</span>
            {f.images.map((src, i) => (
              <div key={i} className="flex items-center gap-2">
                {src && (
                  <img
                    src={src}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                  />
                )}
                <input
                  aria-label={`Image ${i + 1} address`}
                  className={controlCls}
                  value={src}
                  onChange={(e) =>
                    set(
                      'images',
                      f.images.map((x, k) => (k === i ? e.target.value : x)),
                    )
                  }
                  placeholder="https://…"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move image up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move image down"
                  disabled={i === f.images.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove image"
                  onClick={() =>
                    set(
                      'images',
                      f.images.filter((_, k) => k !== i),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {f.images.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => set('images', [...f.images, ''])}
              >
                <Plus /> Add image
              </Button>
            )}
            <span className="text-xs text-faint">
              The first image is the main one. Use full https:// addresses.
            </span>
          </div>
        </div>
      </Drawer>
      {confirm && (
        <ConfirmDialog
          title="Discard your changes?"
          body="You have unsaved changes to this product. If you close now they will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={onClose}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
}
