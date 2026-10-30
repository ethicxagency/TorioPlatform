'use client';

import {
  areas,
  CF_CATS,
  cfDisplay,
  cfHasVal,
  FIELD_TYPES,
  filled,
  SCOPES,
  slugKey,
  type BrainCustomField,
} from '@torio/contracts';
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AreaField,
  Chips,
  Drawer,
  Field,
  inputCls,
  Pill,
  SectionCard,
  SelectField,
  TextField,
  Toggle,
  uid,
} from './bits';
import type { Remove, SectionProps } from './types';

export const blankField = (category: string = 'General Business'): BrainCustomField => ({
  id: uid('cf'),
  name: '',
  key: '',
  desc: '',
  type: 'Short text',
  value: '',
  options: '',
  category,
  required: false,
  scope: SCOPES[0],
  min: '',
  max: '',
  maxLen: '',
  def: '',
  unit: '',
  enabled: true,
});
const optionList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function ValueInput({
  f,
  set,
}: {
  f: BrainCustomField;
  set: (v: BrainCustomField['value']) => void;
}) {
  const str = typeof f.value === 'string' ? f.value : '';
  const opts = optionList(f.options);
  switch (f.type) {
    case 'Boolean':
      return (
        <Toggle checked={f.value === true} onChange={set} label={f.value === true ? 'Yes' : 'No'} />
      );
    case 'Long text':
    case 'Structured list':
      return (
        <AreaField
          label="Value"
          value={str}
          onChange={set}
          rows={3}
          hint={f.type === 'Structured list' ? 'One item per line.' : undefined}
        />
      );
    case 'Single select':
      return <SelectField label="Value" value={str} onChange={set} options={['', ...opts]} />;
    case 'Multi-select':
      return (
        <Chips
          label="Value"
          values={Array.isArray(f.value) ? f.value : []}
          options={opts}
          onChange={set}
          allowCustom={false}
        />
      );
    case 'Number':
    case 'Currency':
      return (
        <TextField
          label={f.type === 'Currency' ? 'Value (৳)' : 'Value'}
          value={str}
          onChange={set}
        />
      );
    case 'Date':
      return (
        <Field label="Value">
          {(id) => (
            <input
              id={id}
              type="date"
              value={str}
              onChange={(e) => set(e.target.value)}
              className={inputCls}
            />
          )}
        </Field>
      );
    case 'URL':
      return <TextField label="Value" value={str} onChange={set} placeholder="https://" />;
    default:
      return <TextField label="Value" value={str} onChange={set} />;
  }
}

function FieldDrawer({
  field,
  others,
  isNew,
  cats,
  onClose,
  onSave,
}: {
  field: BrainCustomField;
  others: BrainCustomField[];
  isNew: boolean;
  cats: string[];
  onClose: () => void;
  onSave: (f: BrainCustomField) => void;
}) {
  const [f, setF] = useState(field);
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [tried, setTried] = useState(false);
  const set =
    <K extends keyof BrainCustomField>(k: K) =>
    (v: BrainCustomField[K]) =>
      setF((x) => ({ ...x, [k]: v }));
  const setType = (t: string) =>
    setF((x) => ({
      ...x,
      type: t as BrainCustomField['type'],
      value: t === 'Boolean' ? false : t === 'Multi-select' ? [] : '',
    }));
  const e = {
    name: !f.name.trim() ? 'Field name is required.' : '',
    key: !f.key
      ? 'A key is required.'
      : !/^[a-z][a-z0-9_]*$/.test(f.key)
        ? 'Use lowercase letters, numbers and underscores.'
        : others.some((o) => o.key === f.key)
          ? 'This key is already used by another field.'
          : '',
    options:
      (f.type === 'Single select' || f.type === 'Multi-select') &&
      optionList(f.options).length === 0
        ? 'Add at least one option (comma separated).'
        : '',
    value:
      (f.type === 'Number' || f.type === 'Currency') &&
      filled(f.value) &&
      Number.isNaN(Number(f.value))
        ? 'Enter a number.'
        : (f.type === 'Number' || f.type === 'Currency') &&
            filled(f.value) &&
            ((filled(f.min) && Number(f.value) < Number(f.min)) ||
              (filled(f.max) && Number(f.value) > Number(f.max)))
          ? `Must be between ${f.min || '−∞'} and ${f.max || '∞'}.`
          : f.type === 'URL' && filled(f.value) && !/^https?:\/\//.test(String(f.value))
            ? 'Enter a URL starting with http:// or https://.'
            : filled(f.maxLen) && typeof f.value === 'string' && f.value.length > Number(f.maxLen)
              ? `Maximum ${f.maxLen} characters.`
              : '',
  };
  const bad = Object.values(e).some(Boolean);
  const numeric = f.type === 'Number' || f.type === 'Currency';
  return (
    <Drawer
      title={isNew ? 'Add custom field' : 'Edit custom field'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true);
              if (!bad) onSave({ ...f, name: f.name.trim() });
            }}
          >
            Save field
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          className="sm:col-span-2"
          label="Field name *"
          value={f.name}
          onChange={(v) => setF((x) => ({ ...x, name: v, key: keyTouched ? x.key : slugKey(v) }))}
          error={tried ? e.name : ''}
        />
        <TextField
          label="Machine key *"
          value={f.key}
          onChange={(v) => {
            setKeyTouched(true);
            set('key')(v);
          }}
          error={tried || keyTouched ? e.key : ''}
          hint="Used by business rules."
        />
        <SelectField label="Type" value={f.type} onChange={setType} options={FIELD_TYPES} />
        <SelectField
          label="Category"
          value={f.category}
          onChange={set('category')}
          options={cats}
        />
        <SelectField
          label="Usage scope"
          value={f.scope}
          onChange={(v) => set('scope')(v as BrainCustomField['scope'])}
          options={SCOPES}
        />
        <AreaField
          className="sm:col-span-2"
          label="Description"
          value={f.desc}
          onChange={set('desc')}
          rows={2}
        />
        {(f.type === 'Single select' || f.type === 'Multi-select') && (
          <TextField
            className="sm:col-span-2"
            label="Options *"
            value={f.options}
            onChange={set('options')}
            error={tried ? e.options : ''}
            hint="Comma separated"
          />
        )}
        {numeric && (
          <>
            <TextField label="Minimum" value={f.min} onChange={set('min')} />
            <TextField label="Maximum" value={f.max} onChange={set('max')} />
            <TextField label="Unit" value={f.unit} onChange={set('unit')} hint="e.g. %" />
          </>
        )}
        {(f.type === 'Short text' || f.type === 'Long text') && (
          <TextField label="Maximum length" value={f.maxLen} onChange={set('maxLen')} />
        )}
        <div className="sm:col-span-2">
          <ValueInput f={f} set={set('value')} />
          {(tried || filled(f.value)) && e.value && (
            <span role="alert" className="text-xs text-danger">
              {e.value}
            </span>
          )}
        </div>
        <Toggle
          checked={f.required}
          onChange={set('required')}
          label="Required"
          hint="Must have a value to save."
        />
        <Toggle
          checked={f.enabled}
          onChange={set('enabled')}
          label="Enabled"
          hint="Disabled fields are ignored by AI."
        />
        <div
          className="rounded-[10px] border border-line bg-[#FBFBFC] p-3 sm:col-span-2"
          aria-label="Field preview"
        >
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint">
            Preview in the knowledge editor
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium">
              {f.name || 'Field name'}
              {f.required && <span className="text-danger"> *</span>}
            </span>
            <span className="text-faint">·</span>
            <span className="truncate">{cfDisplay(f)}</span>
          </div>
          <div className="text-xs text-faint">{f.desc || 'No description'}</div>
        </div>
      </div>
    </Drawer>
  );
}

export function FieldsSection({
  d,
  mut,
  canWrite,
  remove,
  openRequest,
  onRequestHandled,
}: SectionProps & { remove: Remove; openRequest: boolean; onRequestHandled: () => void }) {
  const [cat, setCat] = useState('All');
  const [edit, setEdit] = useState<{ f: BrainCustomField; isNew: boolean } | null>(null);
  const cats = [...CF_CATS, ...d.cfCats.filter((c) => !(CF_CATS as readonly string[]).includes(c))];
  if (openRequest && !edit) {
    onRequestHandled();
    setEdit({ f: blankField('General Business'), isNew: true });
  }
  const shown = d.customFields.filter((f) => cat === 'All' || f.category === cat);
  const a = areas(d).find((x) => x.key === 'fields')!;
  const move = (id: string, dir: -1 | 1) =>
    mut((c) => {
      const i = c.customFields.findIndex((x) => x.id === id),
        j = i + dir;
      if (j < 0 || j >= c.customFields.length) return;
      [c.customFields[i], c.customFields[j]] = [c.customFields[j]!, c.customFields[i]!];
    });
  return (
    <SectionCard
      id="fields"
      title="Custom Fields"
      description="Your own business facts AI can use and rules can reference."
      status={
        <Pill tone={a.review ? 'warn' : d.customFields.length === 0 ? 'neutral' : 'info'}>
          {a.review ? 'Needs review' : `${d.customFields.length} fields`}
        </Pill>
      }
      action={
        canWrite && (
          <Button
            size="sm"
            onClick={() =>
              setEdit({ f: blankField(cat === 'All' ? 'General Business' : cat), isNew: true })
            }
          >
            <Plus size={14} />
            Add field
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Field categories">
        {['All', ...cats].map((c) => (
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
            {c}
          </button>
        ))}
      </div>
      {d.customFields.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-8 text-center text-[13px] text-muted">
          No custom fields yet. Add things like “Warranty period” or “Service areas”.
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          No fields in this category.
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
          {shown.map((f) => (
            <li
              key={f.id}
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
                !f.enabled && 'bg-[#FBFBFC]',
              )}
            >
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-2">
                  <span className={cn('truncate text-sm font-medium', !f.enabled && 'text-faint')}>
                    {f.name || 'Untitled'}
                  </span>
                  {f.required && <Pill tone="warn">Required</Pill>}
                </div>
                <div className="truncate font-mono text-xs text-faint">
                  {f.key} · {f.type}
                </div>
              </div>
              <div
                className={cn(
                  'max-w-[220px] truncate text-[13px]',
                  cfHasVal(f) ? 'text-ink' : 'text-warning',
                )}
              >
                {cfDisplay(f)}
              </div>
              <Pill tone="neutral">{f.category}</Pill>
              {canWrite && (
                <div className="flex items-center gap-0.5">
                  <Toggle
                    checked={f.enabled}
                    onChange={(v) =>
                      mut((c) => {
                        const x = c.customFields.find((y) => y.id === f.id);
                        if (x) x.enabled = v;
                      })
                    }
                    label=""
                  />
                  <button
                    type="button"
                    aria-label={`Move ${f.name} up`}
                    onClick={() => move(f.id, -1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${f.name} down`}
                    onClick={() => move(f.id, 1)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${f.name}`}
                    onClick={() =>
                      mut((c) => {
                        const i = c.customFields.findIndex((y) => y.id === f.id);
                        let key = `${f.key}_copy`;
                        while (c.customFields.some((y) => y.key === key)) key += '_2';
                        c.customFields.splice(i + 1, 0, {
                          ...structuredClone(f),
                          id: uid('cf'),
                          name: `${f.name} (copy)`,
                          key,
                        });
                      })
                    }
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${f.name}`}
                    onClick={() => setEdit({ f, isNew: false })}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${f.name}`}
                    onClick={() => {
                      const idx = d.customFields.findIndex((y) => y.id === f.id);
                      mut((c) => {
                        c.customFields.splice(idx, 1);
                      });
                      remove(`Deleted ${f.name}`, () =>
                        mut((c) => {
                          c.customFields.splice(idx, 0, f);
                        }),
                      );
                    }}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <FieldDrawer
          field={edit.f}
          isNew={edit.isNew}
          cats={cats}
          others={d.customFields.filter((x) => x.id !== edit.f.id)}
          onClose={() => setEdit(null)}
          onSave={(f) => {
            mut((c) => {
              const i = c.customFields.findIndex((x) => x.id === f.id);
              if (i >= 0) c.customFields[i] = f;
              else c.customFields.push(f);
            });
            setEdit(null);
          }}
        />
      )}
    </SectionCard>
  );
}
