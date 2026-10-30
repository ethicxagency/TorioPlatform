'use client';

import {
  areas,
  FAQ_CATS,
  filled,
  STOCK_STATES,
  type BrainFaq,
  type BrainProduct,
} from '@torio/contracts';
import { ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AreaField, Drawer, Pill, SectionCard, SelectField, TextField, Toggle, uid } from './bits';
import type { Remove, SectionProps } from './types';

const STOCK_TONE = {
  'In stock': 'ok',
  'Low stock': 'warn',
  'Out of stock': 'neutral',
  'Pre-order': 'info',
} as const;
const blank = (): BrainProduct => ({
  id: uid('p'),
  name: '',
  category: '',
  description: '',
  price: '',
  variants: '',
  sizes: '',
  colors: '',
  stock: 'In stock',
  benefits: '',
  usage: '',
  limitations: '',
  faqs: '',
});
const missingOf = (p: BrainProduct) =>
  (['description', 'price', 'colors', 'benefits', 'usage'] as const).filter((k) => !filled(p[k]));

function ProductDrawer({
  product,
  isNew,
  onClose,
  onSave,
}: {
  product: BrainProduct;
  isNew: boolean;
  onClose: () => void;
  onSave: (p: BrainProduct) => void;
}) {
  const [p, setP] = useState(product);
  const [tried, setTried] = useState(false);
  const set = (k: keyof BrainProduct) => (v: string) => setP((x) => ({ ...x, [k]: v }));
  const errors = {
    name: !p.name.trim() ? 'Product name is required.' : '',
    price: !/^\d+(\.\d+)?$/.test(p.price.trim()) ? 'Enter a price in numbers, e.g. 1450.' : '',
  };
  const bad = !!errors.name || !!errors.price;
  return (
    <Drawer
      title={isNew ? 'Add product' : 'Edit product'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true);
              if (!bad)
                onSave({
                  ...p,
                  name: p.name.trim(),
                  price: p.price.trim(),
                  updatedAt: new Date().toISOString(),
                });
            }}
          >
            {isNew ? 'Add product' : 'Save product'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          className="sm:col-span-2"
          label="Name *"
          value={p.name}
          onChange={set('name')}
          error={tried ? errors.name : ''}
        />
        <TextField label="Category" value={p.category} onChange={set('category')} />
        <TextField
          label="Price (৳) *"
          value={p.price}
          onChange={set('price')}
          error={tried ? errors.price : ''}
        />
        <SelectField
          label="Availability"
          value={p.stock}
          onChange={set('stock')}
          options={STOCK_STATES}
        />
        <TextField
          label="Colors"
          value={p.colors}
          onChange={set('colors')}
          hint="Comma separated"
        />
        <TextField
          label="Variants"
          value={p.variants}
          onChange={set('variants')}
          hint="Comma separated"
        />
        <TextField label="Sizes" value={p.sizes} onChange={set('sizes')} />
        <AreaField
          className="sm:col-span-2"
          label="Description"
          value={p.description}
          onChange={set('description')}
          rows={2}
        />
        <AreaField
          className="sm:col-span-2"
          label="Benefits"
          value={p.benefits}
          onChange={set('benefits')}
          rows={2}
        />
        <AreaField
          className="sm:col-span-2"
          label="Usage instructions"
          value={p.usage}
          onChange={set('usage')}
          rows={2}
        />
        <AreaField
          className="sm:col-span-2"
          label="Limitations"
          value={p.limitations}
          onChange={set('limitations')}
          rows={2}
        />
        <AreaField
          className="sm:col-span-2"
          label="Product FAQs"
          value={p.faqs}
          onChange={set('faqs')}
          rows={3}
        />
      </div>
    </Drawer>
  );
}

export function ProductsSection({ d, mut, canWrite, remove }: SectionProps & { remove: Remove }) {
  const [edit, setEdit] = useState<{ p: BrainProduct; isNew: boolean } | null>(null);
  const a = areas(d).find((x) => x.key === 'products')!;
  return (
    <SectionCard
      id="products"
      title="Products & Catalog"
      description="What you sell. AI answers price, colour and availability questions from this list."
      status={
        <Pill tone={d.products.length === 0 ? 'neutral' : a.pct === 1 ? 'ok' : 'info'}>
          {d.products.length === 0 ? 'No products' : `${Math.round(a.pct * 100)}% complete`}
        </Pill>
      }
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEdit({ p: blank(), isNew: true })}>
            <Plus size={14} />
            Add product
          </Button>
        )
      }
    >
      {d.products.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-8 text-center">
          <div className="text-sm font-semibold">No products yet</div>
          <p className="mx-auto mb-3 mt-1 max-w-[320px] text-[12.5px] text-muted">
            Without products, AI can&apos;t answer price or availability questions.
          </p>
          {canWrite && (
            <Button size="sm" onClick={() => setEdit({ p: blank(), isNew: true })}>
              Add your first product
            </Button>
          )}
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
          {d.products.map((p) => {
            const miss = missingOf(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-sm font-medium">{p.name || 'Untitled product'}</div>
                  <div className="truncate text-xs text-faint">
                    {p.category || 'No category'}
                    {p.updatedAt ? ` · edited ${new Date(p.updatedAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div className="w-20 text-sm tabular-nums">
                  {p.price ? `৳${Number(p.price).toLocaleString('en-US')}` : '—'}
                </div>
                <Pill tone={STOCK_TONE[p.stock]}>{p.stock}</Pill>
                {miss.length > 0 && (
                  <span className="text-xs text-warning" title={`Missing: ${miss.join(', ')}`}>
                    {miss.length} missing
                  </span>
                )}
                {canWrite && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setEdit({ p, isNew: false })}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => {
                        const idx = d.products.findIndex((x) => x.id === p.id);
                        mut((c) => {
                          c.products.splice(idx, 1);
                        });
                        remove(`Removed ${p.name || 'product'}`, () =>
                          mut((c) => {
                            c.products.splice(idx, 0, p);
                          }),
                        );
                      }}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && (
        <ProductDrawer
          product={edit.p}
          isNew={edit.isNew}
          onClose={() => setEdit(null)}
          onSave={(p) => {
            mut((c) => {
              const i = c.products.findIndex((x) => x.id === p.id);
              if (i >= 0) c.products[i] = p;
              else c.products.push(p);
            });
            setEdit(null);
          }}
        />
      )}
    </SectionCard>
  );
}

function FaqModal({
  faq,
  onClose,
  onSave,
}: {
  faq: BrainFaq;
  onClose: () => void;
  onSave: (f: BrainFaq) => void;
}) {
  const [f, setF] = useState(faq);
  const [tried, setTried] = useState(false);
  const eq = !f.q.trim() ? 'Question is required.' : '';
  const ea = !f.a.trim() ? 'Approved answer is required.' : '';
  return (
    <Drawer
      title={faq.q ? 'Edit FAQ' : 'Add FAQ'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true);
              if (!eq && !ea) onSave({ ...f, q: f.q.trim(), a: f.a.trim() });
            }}
          >
            Save FAQ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Question *"
          value={f.q}
          onChange={(v) => setF({ ...f, q: v })}
          error={tried ? eq : ''}
        />
        <AreaField
          label="Approved answer *"
          value={f.a}
          onChange={(v) => setF({ ...f, a: v })}
          rows={4}
          error={tried ? ea : ''}
          hint="AI will use this wording as the source of truth."
        />
        <SelectField
          label="Category"
          value={f.cat}
          onChange={(v) => setF({ ...f, cat: v as BrainFaq['cat'] })}
          options={FAQ_CATS}
        />
        <Toggle
          checked={f.active}
          onChange={(v) => setF({ ...f, active: v })}
          label="Active"
          hint="Inactive FAQs are ignored by AI."
        />
      </div>
    </Drawer>
  );
}

export function KbSection({ d, mut, canWrite, remove }: SectionProps & { remove: Remove }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<BrainFaq | null>(null);
  const counts = (c: string) => d.faqs.filter((f) => c === 'All' || f.cat === c).length;
  const shown = d.faqs.filter(
    (f) =>
      (cat === 'All' || f.cat === cat) &&
      (!q.trim() || (f.q + ' ' + f.a).toLowerCase().includes(q.trim().toLowerCase())),
  );
  const act = d.faqs.filter((f) => f.active).length;
  return (
    <SectionCard
      id="kb"
      title="Knowledge Base"
      description="Approved answers to common questions."
      status={<Pill tone={act >= 5 ? 'ok' : act === 0 ? 'neutral' : 'info'}>{act} active</Pill>}
      action={
        canWrite && (
          <Button
            size="sm"
            onClick={() => setEdit({ id: uid('f'), q: '', a: '', cat: 'General', active: true })}
          >
            <Plus size={14} />
            Add FAQ
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 sm:max-w-[300px]">
          <Search size={14} className="text-faint" aria-hidden />
          <input
            type="search"
            aria-label="Search FAQs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search FAQs"
            className="min-w-0 flex-1 border-none bg-transparent text-[13px]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="FAQ categories">
          {['All', ...FAQ_CATS].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                'h-7 cursor-pointer rounded-full border px-2.5 text-xs',
                cat === c
                  ? 'border-[rgba(91,92,226,0.25)] bg-primary-soft font-semibold text-primary-hover'
                  : 'border-line bg-white text-muted hover:bg-wash',
              )}
            >
              {c} {counts(c)}
            </button>
          ))}
        </div>
      </div>
      {d.faqs.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-8 text-center text-[13px] text-muted">
          No FAQs yet. Add approved answers so AI doesn&apos;t improvise.
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          No FAQs match your search or category.
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
          {shown.map((f) => (
            <li key={f.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={!!open[f.id]}
                  onClick={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <ChevronDown
                    size={15}
                    className={cn(
                      'shrink-0 text-faint transition-transform',
                      open[f.id] && 'rotate-180',
                    )}
                  />
                  <span className={cn('truncate text-sm font-medium', !f.active && 'text-faint')}>
                    {f.q}
                  </span>
                </button>
                <Pill tone="neutral">{f.cat}</Pill>
                {!f.active && <Pill tone="warn">Inactive</Pill>}
                {canWrite && (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${f.q}`}
                      onClick={() => setEdit(f)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${f.q}`}
                      onClick={() => {
                        const idx = d.faqs.findIndex((x) => x.id === f.id);
                        mut((c) => {
                          c.faqs.splice(idx, 1);
                        });
                        remove('FAQ deleted', () =>
                          mut((c) => {
                            c.faqs.splice(idx, 0, f);
                          }),
                        );
                      }}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
              {open[f.id] && (
                <p className="m-0 mt-2 whitespace-pre-wrap pl-[23px] text-[13px] text-muted [overflow-wrap:anywhere]">
                  {f.a}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <FaqModal
          faq={edit}
          onClose={() => setEdit(null)}
          onSave={(f) => {
            mut((c) => {
              const i = c.faqs.findIndex((x) => x.id === f.id);
              if (i >= 0) c.faqs[i] = f;
              else c.faqs.push(f);
            });
            setEdit(null);
          }}
        />
      )}
    </SectionCard>
  );
}
