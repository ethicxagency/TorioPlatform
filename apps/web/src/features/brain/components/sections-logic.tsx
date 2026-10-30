'use client';

import {
  areas,
  ACTION_TYPES,
  filled,
  INTENTS,
  PRIORITIES,
  previewReply,
  ruleCheck,
  SUBJECTS,
  type BrainAction,
  type BrainCond,
  type BrainConfig,
  type BrainGroup,
  type BrainInstruction,
  type BrainRule,
} from '@torio/contracts';
import { ChevronDown, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AreaField,
  Drawer,
  inputCls,
  Pill,
  SectionCard,
  SelectField,
  TextField,
  Toggle,
  uid,
} from './bits';
import type { Remove, SectionProps } from './types';

const PRI_TONE = { High: 'bad', Medium: 'warn', Low: 'neutral' } as const;
const INSTR_CATS = ['General', 'Shipping', 'Orders', 'Products', 'Customer Support', 'Marketing'];
const TEMPLATES = [
  {
    title: 'Ask for the order number first',
    content: 'Before answering an order status question, ask the customer for their order number.',
    category: 'Orders',
    conditions: 'Customer asks about order tracking',
    example: 'Where is my order?',
  },
  {
    title: 'Escalate repeated complaints',
    content:
      'If a customer repeats the same complaint twice, apologise and hand the conversation to a team member.',
    category: 'Customer Support',
    conditions: 'Same complaint repeated',
    example: '',
  },
  {
    title: 'Confirm the variant before quoting a price',
    content: 'Confirm the exact product and variant before sharing a price.',
    category: 'Products',
    conditions: 'Customer asks about price',
    example: '',
  },
];

// ---------- Custom instructions ----------

function InstructionDrawer({
  ins,
  isNew,
  onClose,
  onSave,
  onTest,
}: {
  ins: BrainInstruction;
  isNew: boolean;
  onClose: () => void;
  onSave: (i: BrainInstruction) => void;
  onTest: (msg: string) => void;
}) {
  const [i, setI] = useState(ins);
  const [tried, setTried] = useState(false);
  const set = (k: keyof BrainInstruction) => (v: string) => setI((x) => ({ ...x, [k]: v }));
  const et = !i.title.trim() ? 'Title is required.' : '';
  const ec = !i.content.trim() ? 'Instruction content is required.' : '';
  return (
    <Drawer
      title={isNew ? 'Add instruction' : 'Edit instruction'}
      onClose={onClose}
      footer={
        <>
          {i.example && (
            <Button variant="outline" onClick={() => onTest(i.example)}>
              Test example
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTried(true);
              if (!et && !ec) onSave({ ...i, title: i.title.trim(), content: i.content.trim() });
            }}
          >
            Save instruction
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Title *"
          value={i.title}
          onChange={set('title')}
          error={tried ? et : ''}
        />
        <AreaField
          label="Instruction *"
          value={i.content}
          onChange={set('content')}
          rows={4}
          error={tried ? ec : ''}
        />
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Category"
            value={i.category || 'General'}
            onChange={set('category')}
            options={INSTR_CATS}
          />
          <SelectField
            label="Priority"
            value={i.priority}
            onChange={(v) => setI({ ...i, priority: v as BrainInstruction['priority'] })}
            options={PRIORITIES}
          />
        </div>
        <TextField
          label="When this applies (optional)"
          value={i.conditions}
          onChange={set('conditions')}
          placeholder="e.g. Customer asks about delivery charges"
        />
        <AreaField
          label="Example customer message"
          value={i.example}
          onChange={set('example')}
          rows={2}
        />
        <AreaField
          label="Expected AI behavior"
          value={i.expected}
          onChange={set('expected')}
          rows={2}
        />
        <Toggle checked={i.enabled} onChange={(v) => setI({ ...i, enabled: v })} label="Enabled" />
      </div>
    </Drawer>
  );
}

export function InstructionsSection({
  d,
  mut,
  canWrite,
  remove,
  onTest,
}: SectionProps & { remove: Remove; onTest: (msg: string) => void }) {
  const [edit, setEdit] = useState<{ i: BrainInstruction; isNew: boolean } | null>(null);
  const blank = (t?: Partial<BrainInstruction>): BrainInstruction => ({
    id: uid('in'),
    title: '',
    content: '',
    category: 'General',
    priority: 'Medium',
    enabled: true,
    conditions: '',
    example: '',
    expected: '',
    ...t,
  });
  const a = areas(d).find((x) => x.key === 'instructions')!;
  return (
    <SectionCard
      id="instructions"
      title="Custom Instructions"
      description="Specific behaviours for specific situations."
      status={
        <Pill tone={a.pct === 1 ? 'ok' : 'info'}>
          {d.instructions.filter((i) => i.enabled).length} enabled
        </Pill>
      }
      action={
        canWrite && (
          <Button size="sm" onClick={() => setEdit({ i: blank(), isNew: true })}>
            <Plus size={14} />
            Add instruction
          </Button>
        )
      }
    >
      {d.instructions.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-6 text-center">
          <div className="text-sm font-semibold">No instructions yet</div>
          <p className="mb-3 mt-1 text-[12.5px] text-muted">
            Start from a template or write your own.
          </p>
          {canWrite && (
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map((t) => (
                <Button
                  key={t.title}
                  size="sm"
                  variant="outline"
                  onClick={() => setEdit({ i: blank(t), isNew: true })}
                >
                  {t.title}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
          {d.instructions.map((i) => (
            <li
              key={i.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3',
                !i.enabled && 'bg-[#FBFBFC]',
              )}
            >
              <div className="min-w-0 flex-1 basis-60">
                <div className={cn('truncate text-sm font-medium', !i.enabled && 'text-faint')}>
                  {i.title || 'Untitled'}
                </div>
                <div className="truncate text-xs text-faint">
                  {i.conditions || 'Always applies'}
                </div>
              </div>
              <Pill tone="neutral">{i.category}</Pill>
              <Pill tone={PRI_TONE[i.priority]}>{i.priority}</Pill>
              {canWrite && (
                <div className="flex items-center gap-0.5">
                  <Toggle
                    checked={i.enabled}
                    onChange={(v) =>
                      mut((c) => {
                        const x = c.instructions.find((y) => y.id === i.id);
                        if (x) x.enabled = v;
                      })
                    }
                    label=""
                  />
                  <button
                    type="button"
                    aria-label={`Duplicate ${i.title}`}
                    onClick={() =>
                      mut((c) => {
                        const idx = c.instructions.findIndex((y) => y.id === i.id);
                        c.instructions.splice(idx + 1, 0, {
                          ...i,
                          id: uid('in'),
                          title: `${i.title} (copy)`,
                        });
                      })
                    }
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${i.title}`}
                    onClick={() => setEdit({ i, isNew: false })}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${i.title}`}
                    onClick={() => {
                      const idx = d.instructions.findIndex((y) => y.id === i.id);
                      mut((c) => {
                        c.instructions.splice(idx, 1);
                      });
                      remove('Instruction deleted', () =>
                        mut((c) => {
                          c.instructions.splice(idx, 0, i);
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
        <InstructionDrawer
          ins={edit.i}
          isNew={edit.isNew}
          onClose={() => setEdit(null)}
          onTest={(m) => {
            setEdit(null);
            onTest(m);
          }}
          onSave={(i) => {
            mut((c) => {
              const x = c.instructions.findIndex((y) => y.id === i.id);
              if (x >= 0) c.instructions[x] = i;
              else c.instructions.push(i);
            });
            setEdit(null);
          }}
        />
      )}
    </SectionCard>
  );
}

// ---------- Business logic (rule builder) ----------

const subj = (s: string) => SUBJECTS.find((x) => x.v === s)!;
const blankCond = (): BrainCond => ({ id: uid('c'), s: 'intent', op: 'is', val: INTENTS[0]! });

function CondRow({
  c,
  d,
  onChange,
  onRemove,
  invalid,
}: {
  c: BrainCond;
  d: BrainConfig;
  onChange: (c: BrainCond) => void;
  onRemove: () => void;
  invalid: boolean;
}) {
  const sj = subj(c.s);
  const numFields = d.customFields.filter((f) => f.type === 'Number' || f.type === 'Currency');
  const sel = 'h-9 rounded-lg border border-line bg-white px-2 text-[13px]';
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        invalid && 'rounded-lg ring-1 ring-danger/40',
      )}
    >
      <select
        aria-label="Condition subject"
        value={c.s}
        onChange={(e) => {
          const ns = subj(e.target.value);
          onChange({
            id: c.id,
            s: ns.v,
            op: ns.ops[0]!,
            val: Array.isArray(ns.values) ? ns.values[0]! : '',
          });
        }}
        className={sel}
      >
        {SUBJECTS.map((s) => (
          <option key={s.v} value={s.v}>
            {s.l}
          </option>
        ))}
      </select>
      {c.s === 'field' && (
        <select
          aria-label="Custom field"
          value={c.fk ?? ''}
          onChange={(e) => onChange({ ...c, fk: e.target.value })}
          className={sel}
        >
          <option value="">Choose field…</option>
          {d.customFields.map((f) => (
            <option key={f.id} value={f.key}>
              {f.name}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Operator"
        value={c.op}
        onChange={(e) => onChange({ ...c, op: e.target.value })}
        className={sel}
      >
        {sj.ops.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {c.s === 'field' && (c.op === 'is set' || c.op === 'is not set') ? null : sj.values ===
        'fieldNum' ? (
        <select
          aria-label="Number field"
          value={c.val}
          onChange={(e) => onChange({ ...c, val: e.target.value })}
          className={sel}
        >
          <option value="">Choose a number field…</option>
          {numFields.map((f) => (
            <option key={f.id} value={f.key}>
              {f.name}
            </option>
          ))}
        </select>
      ) : Array.isArray(sj.values) ? (
        <select
          aria-label="Value"
          value={c.val}
          onChange={(e) => onChange({ ...c, val: e.target.value })}
          className={cn(sel, 'max-w-[260px]')}
        >
          {sj.values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label="Value"
          value={c.val}
          onChange={(e) => onChange({ ...c, val: e.target.value })}
          placeholder="Value"
          className={cn(sel, 'w-36')}
        />
      )}
      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash hover:text-danger"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function RuleEditor({
  r,
  d,
  patch,
}: {
  r: BrainRule;
  d: BrainConfig;
  patch: (fn: (r: BrainRule) => void) => void;
}) {
  const chk = ruleCheck(d, r);
  const setItem = (idx: number, v: BrainCond | BrainGroup) =>
    patch((x) => {
      x.items[idx] = v;
    });
  const joinBtn = (join: 'and' | 'or', onChange: (j: 'and' | 'or') => void) => (
    <div
      role="radiogroup"
      aria-label="Match"
      className="flex w-fit gap-0.5 rounded-lg bg-wash-2 p-0.5"
    >
      {(['and', 'or'] as const).map((j) => (
        <button
          key={j}
          type="button"
          role="radio"
          aria-checked={join === j}
          onClick={() => onChange(j)}
          className={cn(
            'h-6 cursor-pointer rounded-md px-2.5 text-xs font-semibold uppercase',
            join === j ? 'bg-white text-ink shadow-sm' : 'text-muted',
          )}
        >
          {j}
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-4 border-t border-line-subtle bg-[#FBFBFC] px-4 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
        <TextField
          label="Rule name *"
          value={r.name}
          onChange={(v) =>
            patch((x) => {
              x.name = v;
            })
          }
          error={!filled(r.name) ? 'Name required' : ''}
        />
        <SelectField
          label="Priority"
          value={r.priority}
          onChange={(v) =>
            patch((x) => {
              x.priority = v as BrainRule['priority'];
            })
          }
          options={PRIORITIES}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">
          When{' '}
          {joinBtn(r.join, (j) =>
            patch((x) => {
              x.join = j;
            }),
          )}
        </div>
        {r.items.length === 0 && (
          <p className="m-0 text-xs text-danger">Add at least one condition.</p>
        )}
        {r.items.map((it, idx) =>
          'group' in it ? (
            <div
              key={it.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-white p-2.5"
            >
              <div className="flex items-center gap-2 text-xs text-muted">
                Group · match {joinBtn(it.join, (j) => setItem(idx, { ...it, join: j }))}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label="Remove group"
                  onClick={() =>
                    patch((x) => {
                      x.items.splice(idx, 1);
                    })
                  }
                  className="cursor-pointer text-faint hover:text-danger"
                >
                  <X size={14} />
                </button>
              </div>
              {it.conds.map((c, ci) => (
                <CondRow
                  key={c.id}
                  c={c}
                  d={d}
                  invalid={false}
                  onChange={(nc) =>
                    setItem(idx, { ...it, conds: it.conds.map((y, yi) => (yi === ci ? nc : y)) })
                  }
                  onRemove={() =>
                    setItem(idx, { ...it, conds: it.conds.filter((_, yi) => yi !== ci) })
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setItem(idx, { ...it, conds: [...it.conds, blankCond()] })}
                className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-primary"
              >
                <Plus size={12} />
                Add to group
              </button>
            </div>
          ) : (
            <CondRow
              key={it.id}
              c={it}
              d={d}
              invalid={false}
              onChange={(nc) => setItem(idx, nc)}
              onRemove={() =>
                patch((x) => {
                  x.items.splice(idx, 1);
                })
              }
            />
          ),
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              patch((x) => {
                x.items.push(blankCond());
              })
            }
            className="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary"
          >
            <Plus size={12} />
            Add condition
          </button>
          <button
            type="button"
            onClick={() =>
              patch((x) => {
                x.items.push({ id: uid('g'), group: true, join: 'or', conds: [blankCond()] });
              })
            }
            className="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary"
          >
            <Plus size={12} />
            Add group
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">Then</div>
        {r.actions.map((a, idx) => (
          <div key={a.id} className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Action type"
              value={a.type}
              onChange={(e) =>
                patch((x) => {
                  x.actions[idx]!.type = e.target.value as BrainAction['type'];
                })
              }
              className="h-9 rounded-lg border border-line bg-white px-2 text-[13px]"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              aria-label="Action text"
              value={a.text}
              onChange={(e) =>
                patch((x) => {
                  x.actions[idx]!.text = e.target.value;
                })
              }
              placeholder="What should AI do or say?"
              className={cn(inputCls, 'h-9 min-w-[200px] flex-1')}
            />
            <button
              type="button"
              aria-label="Remove action"
              onClick={() =>
                patch((x) => {
                  x.actions.splice(idx, 1);
                })
              }
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch((x) => {
              x.actions.push({ id: uid('a'), type: 'Reply using knowledge', text: '' });
            })
          }
          className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-primary"
        >
          <Plus size={12} />
          Add action
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">
          Otherwise (optional)
        </div>
        {r.otherwise ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Otherwise type"
              value={r.otherwise.type}
              onChange={(e) =>
                patch((x) => {
                  x.otherwise!.type = e.target.value as BrainAction['type'];
                })
              }
              className="h-9 rounded-lg border border-line bg-white px-2 text-[13px]"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              aria-label="Otherwise text"
              value={r.otherwise.text}
              onChange={(e) =>
                patch((x) => {
                  x.otherwise!.text = e.target.value;
                })
              }
              className={cn(inputCls, 'h-9 min-w-[200px] flex-1')}
            />
            <button
              type="button"
              aria-label="Remove otherwise"
              onClick={() =>
                patch((x) => {
                  delete x.otherwise;
                })
              }
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-faint hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              patch((x) => {
                x.otherwise = { type: 'Reply using knowledge', text: '' };
              })
            }
            className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-primary"
          >
            <Plus size={12} />
            Add otherwise
          </button>
        )}
      </div>
      <TextField
        label="Test message"
        value={r.test}
        onChange={(v) =>
          patch((x) => {
            x.test = v;
          })
        }
        placeholder="A customer message that should trigger this rule"
      />
      {!chk.complete && (
        <p role="alert" className="m-0 text-xs text-warning">
          Incomplete: {[...new Set(chk.issues)].join(', ')}. Incomplete rules can&apos;t be saved
          while enabled.
        </p>
      )}
      {chk.refs.length > 0 && (
        <p role="alert" className="m-0 text-xs text-warning">
          Uses disabled or missing field: {chk.refs.join(', ')}.
        </p>
      )}
    </div>
  );
}

export function LogicSection({
  d,
  mut,
  canWrite,
  remove,
  onTest,
}: SectionProps & { remove: Remove; onTest: (msg: string, rule: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(
    null,
  );
  const a = areas(d).find((x) => x.key === 'logic')!;
  const patch = (id: string) => (fn: (r: BrainRule) => void) =>
    mut((c) => {
      const r = c.logic.find((x) => x.id === id);
      if (r) fn(r);
    });
  const add = () => {
    const r: BrainRule = {
      id: uid('r'),
      name: '',
      enabled: false,
      priority: 'Medium',
      join: 'and',
      items: [blankCond()],
      actions: [{ id: uid('a'), type: 'Reply using knowledge', text: '' }],
      test: '',
    };
    mut((c) => {
      c.logic.push(r);
    });
    setOpen(r.id);
  };
  const runTest = (r: BrainRule) => {
    if (!filled(r.test))
      return setTestResult({ id: r.id, ok: false, text: 'Add a test message first.' });
    const p = previewReply(r.test, {
      ...d,
      logic: d.logic.map((x) => (x.id === r.id ? { ...x, enabled: true } : x)),
    });
    const hit = p.rules.some((n) => n.startsWith(r.name));
    setTestResult({
      id: r.id,
      ok: hit,
      text: hit
        ? `Rule applied. Preview reply: “${p.text}”`
        : 'This rule did not apply to that message (or it is incomplete).',
    });
    onTest(r.test, r.name);
  };
  const summary = (r: BrainRule) => {
    const cs = (c: BrainCond) =>
      `${subj(c.s).l.toLowerCase()} ${c.op} ${c.s === 'field' ? `${c.fk ?? '…'} ` : ''}${c.val ?? ''}`.trim();
    return r.items
      .map((i) => ('group' in i ? `(${i.conds.map(cs).join(` ${i.join} `)})` : cs(i)))
      .join(` ${r.join} `);
  };
  return (
    <SectionCard
      id="logic"
      title="Business Logic"
      description="WHEN → THEN rules for situations that need special handling."
      status={
        <Pill tone={a.pct === 1 && d.logic.length ? 'ok' : d.logic.length ? 'warn' : 'neutral'}>
          {d.logic.filter((r) => r.enabled).length} active
        </Pill>
      }
      action={
        canWrite && (
          <Button size="sm" onClick={add}>
            <Plus size={14} />
            Add rule
          </Button>
        )
      }
    >
      {d.logic.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-[#FBFBFC] px-4 py-8 text-center text-[13px] text-muted">
          No rules yet. Example:{' '}
          <i>
            When a customer asks about delivery charges and the location is unknown, ask whether
            they are inside or outside Dhaka.
          </i>
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-[10px] border border-line p-0">
          {d.logic.map((r) => {
            const chk = ruleCheck(d, r);
            return (
              <li key={r.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <button
                    type="button"
                    aria-expanded={open === r.id}
                    aria-label={`${open === r.id ? 'Collapse' : 'Edit'} rule ${r.name}`}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="flex min-w-0 flex-1 basis-60 cursor-pointer items-start gap-2 text-left"
                  >
                    <ChevronDown
                      size={15}
                      className={cn(
                        'mt-0.5 shrink-0 text-faint transition-transform',
                        open === r.id && 'rotate-180',
                      )}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block truncate text-sm font-medium',
                          !r.enabled && 'text-faint',
                        )}
                      >
                        {r.name || 'Untitled rule'}
                      </span>
                      <span className="block truncate text-xs text-faint">
                        WHEN {summary(r) || '…'}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        THEN{' '}
                        {r.actions
                          .filter((a) => filled(a.text))
                          .map((a) => `${a.type.toLowerCase()}: ${a.text}`)
                          .join(' · ') || '…'}
                        {r.otherwise && filled(r.otherwise.text)
                          ? ` · OTHERWISE ${r.otherwise.type.toLowerCase()}`
                          : ''}
                      </span>
                    </span>
                  </button>
                  {!chk.complete && <Pill tone="warn">Incomplete</Pill>}
                  <Pill tone={PRI_TONE[r.priority]}>{r.priority}</Pill>
                  {canWrite && (
                    <div className="flex items-center gap-0.5">
                      <Toggle
                        checked={r.enabled}
                        onChange={(v) =>
                          patch(r.id)((x) => {
                            x.enabled = v;
                          })
                        }
                        label=""
                      />
                      <Button size="sm" variant="outline" onClick={() => runTest(r)}>
                        Test
                      </Button>
                      <button
                        type="button"
                        aria-label={`Duplicate ${r.name}`}
                        onClick={() =>
                          mut((c) => {
                            const i = c.logic.findIndex((x) => x.id === r.id);
                            const cp = structuredClone(r);
                            cp.id = uid('r');
                            cp.name = `${r.name} (copy)`;
                            cp.enabled = false;
                            c.logic.splice(i + 1, 0, cp);
                          })
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${r.name}`}
                        onClick={() => {
                          const idx = d.logic.findIndex((x) => x.id === r.id);
                          mut((c) => {
                            c.logic.splice(idx, 1);
                          });
                          remove(`Deleted rule ${r.name || ''}`, () =>
                            mut((c) => {
                              c.logic.splice(idx, 0, r);
                            }),
                          );
                        }}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-wash hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                {testResult?.id === r.id && (
                  <p
                    role="status"
                    className={cn(
                      'm-0 px-4 pb-3 text-xs',
                      testResult.ok ? 'text-success' : 'text-muted',
                    )}
                  >
                    {testResult.text}
                  </p>
                )}
                {open === r.id && <RuleEditor r={r} d={d} patch={patch(r.id)} />}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
