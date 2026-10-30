'use client';

import { Plus, Trash2, X } from 'lucide-react';
import {
  actionOf,
  needsValue,
  OPERATOR_LABEL,
  OPERATORS,
  TRIGGERS,
  triggerOf,
  type Condition,
  type Definition,
  type Issue,
  type Step,
} from '@torio/contracts';
import { Button } from '@/components/ui/button';

const field =
  'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] disabled:bg-wash disabled:text-muted';
const label = 'flex flex-col gap-1 text-[12px] font-medium';
const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'];

interface Props {
  def: Definition;
  selected: string;
  issues: Issue[];
  members: { id: string; name: string }[];
  readOnly: boolean;
  onTrigger: (t: string) => void;
  onChange: (s: Step) => void;
  onClose: () => void;
}

export function ConfigPanel(p: Props) {
  const trig = triggerOf(p.def.trigger.type);
  const step = p.def.steps.find((s) => s.id === p.selected);
  const errs = p.issues.filter((i) => i.stepId === (p.selected === 'trigger' ? null : p.selected));
  return (
    <section aria-label="Step settings" className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line-subtle px-4 py-3">
        <h2 className="m-0 flex-1 text-[14px] font-semibold">
          {p.selected === 'trigger'
            ? 'Trigger'
            : step?.type === 'condition'
              ? 'Condition'
              : step?.type === 'wait'
                ? 'Wait'
                : step?.type === 'action'
                  ? (actionOf(step.action)?.label ?? 'Action')
                  : 'Step'}
        </h2>
        <button
          type="button"
          aria-label="Close settings"
          onClick={p.onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
        >
          <X size={15} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {errs.length > 0 && (
          <ul
            role="alert"
            className="mb-4 list-disc rounded-xl bg-danger-soft py-2 pl-7 pr-3 text-[12.5px] text-[#8F2424]"
          >
            {errs.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        )}
        {p.selected === 'trigger' && (
          <div className="flex flex-col gap-3">
            <label className={label}>
              When this happens
              <select
                aria-label="Trigger"
                value={p.def.trigger.type}
                disabled={p.readOnly}
                onChange={(e) => p.onTrigger(e.target.value)}
                className={field}
              >
                {TRIGGERS.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[12.5px] text-muted">{trig?.description}</p>
            <div>
              <div className="mb-1 text-[12px] font-medium">Data available to later steps</div>
              <ul className="m-0 list-disc pl-5 text-[12.5px] text-muted">
                {trig?.fields.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
            </div>
            <p className="m-0 text-xs text-faint">
              Changing the trigger can make existing steps invalid. They are flagged so you can fix
              them. Automations never trigger other automations.
            </p>
          </div>
        )}
        {step?.type === 'wait' && <WaitForm s={step} p={p} />}
        {step?.type === 'condition' && <ConditionForm s={step} p={p} />}
        {step?.type === 'action' && <ActionForm s={step} p={p} />}
        {!step && p.selected !== 'trigger' && (
          <p className="text-[13px] text-muted">That step no longer exists.</p>
        )}
      </div>
    </section>
  );
}

function WaitForm({ s, p }: { s: Extract<Step, { type: 'wait' }>; p: Props }) {
  const unit = s.minutes % 1440 === 0 ? 1440 : s.minutes % 60 === 0 ? 60 : 1;
  const amount = s.minutes / unit;
  const set = (a: number, u: number) =>
    p.onChange({ ...s, minutes: Math.max(1, Math.round(a * u)) });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <label className={label}>
          Wait for
          <input
            type="number"
            min={1}
            disabled={p.readOnly}
            value={amount}
            onChange={(e) => set(Number(e.target.value) || 1, unit)}
            className={field}
          />
        </label>
        <label className={label}>
          Unit
          <select
            disabled={p.readOnly}
            value={unit}
            onChange={(e) => set(amount, Number(e.target.value))}
            className={field}
          >
            <option value={1}>minutes</option>
            <option value={60}>hours</option>
            <option value={1440}>days</option>
          </select>
        </label>
      </div>
      <p className="m-0 text-xs text-faint">
        The run is saved and resumes after the delay, even if Torio restarts. Between 1 minute and 7
        days; total wait in one automation is capped at 14 days. Conditions after a wait use the
        data from when the event happened.
      </p>
    </div>
  );
}

function ConditionForm({ s, p }: { s: Extract<Step, { type: 'condition' }>; p: Props }) {
  const trig = triggerOf(p.def.trigger.type);
  const fields = trig?.fields ?? [];
  const setCond = (i: number, c: Condition) =>
    p.onChange({ ...s, conditions: s.conditions.map((x, k) => (k === i ? c : x)) });
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">
        Continue only if <b>all</b> of these match. Otherwise the run stops and is recorded as
        skipped.
      </p>
      {s.conditions.map((c, i) => {
        const f = fields.find((x) => x.key === c.field);
        const ops = f ? OPERATORS[f.kind] : [];
        return (
          <fieldset key={i} className="m-0 flex flex-col gap-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-[11.5px] text-faint">Condition {i + 1}</legend>
            <select
              aria-label={`Condition ${i + 1} field`}
              disabled={p.readOnly}
              value={c.field}
              onChange={(e) => {
                const nf = fields.find((x) => x.key === e.target.value)!;
                setCond(i, { field: nf.key, op: OPERATORS[nf.kind][0]!, value: '' });
              }}
              className={field}
            >
              {!f && <option value={c.field}>{c.field || 'Choose a field'}</option>}
              {fields.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <select
              aria-label={`Condition ${i + 1} operator`}
              disabled={p.readOnly || !f}
              value={c.op}
              onChange={(e) =>
                setCond(i, { ...c, op: e.target.value as Condition['op'], value: '' })
              }
              className={field}
            >
              {ops.map((o) => (
                <option key={o} value={o}>
                  {OPERATOR_LABEL[o]}
                </option>
              ))}
            </select>
            {f &&
              needsValue(c.op) &&
              (f.kind === 'enum' ? (
                <select
                  aria-label={`Condition ${i + 1} value`}
                  disabled={p.readOnly}
                  value={c.value}
                  onChange={(e) => setCond(i, { ...c, value: e.target.value })}
                  className={field}
                >
                  <option value="">Choose…</option>
                  {f.options!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={`Condition ${i + 1} value`}
                  disabled={p.readOnly}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined}
                  value={c.value}
                  maxLength={200}
                  onChange={(e) => setCond(i, { ...c, value: e.target.value })}
                  className={field}
                />
              ))}
            {f?.help && <span className="text-xs text-faint">{f.help}</span>}
            {!p.readOnly && s.conditions.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  p.onChange({ ...s, conditions: s.conditions.filter((_, k) => k !== i) })
                }
                className="flex cursor-pointer items-center gap-1 self-start text-xs text-muted hover:text-danger"
              >
                <Trash2 size={12} /> Remove condition
              </button>
            )}
          </fieldset>
        );
      })}
      {!p.readOnly && s.conditions.length < 10 && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() =>
            p.onChange({
              ...s,
              conditions: [
                ...s.conditions,
                { field: fields[0]?.key ?? '', op: 'equals', value: '' },
              ],
            })
          }
        >
          <Plus size={13} /> Add condition
        </Button>
      )}
    </div>
  );
}

function ActionForm({ s, p }: { s: Extract<Step, { type: 'action' }>; p: Props }) {
  const trig = triggerOf(p.def.trigger.type);
  const a = actionOf(s.action);
  const set = (k: string, v: string) => p.onChange({ ...s, config: { ...s.config, [k]: v } });
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12.5px] text-muted">{a?.description}</p>
      {(s.action === 'add_conversation_note' || s.action === 'add_order_note') && (
        <>
          <label className={label}>
            Note text
            <textarea
              aria-label="Note text"
              rows={4}
              maxLength={1000}
              disabled={p.readOnly}
              value={s.config.text ?? ''}
              onChange={(e) => set('text', e.target.value)}
              className="rounded-lg border border-line bg-white p-2.5 text-[13px]"
            />
          </label>
          <div>
            <div className="mb-1 text-[12px] font-medium">Insert a variable</div>
            <div className="flex flex-wrap gap-1.5">
              {trig?.variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  disabled={p.readOnly}
                  title={`{{${v.key}}}`}
                  onClick={() => set('text', `${s.config.text ?? ''}{{${v.key}}}`)}
                  className="h-7 cursor-pointer rounded-full border border-line bg-white px-2.5 text-xs hover:bg-wash disabled:opacity-50"
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="mb-0 mt-2 text-xs text-faint">
              Only these variables work for this trigger. A missing value becomes empty text. Notes
              are internal and are never sent to the customer.
            </p>
          </div>
        </>
      )}
      {(s.action === 'assign_conversation' || s.action === 'assign_lead_owner') && (
        <label className={label}>
          Assign to
          <select
            aria-label="Assign to"
            disabled={p.readOnly}
            value={s.config.userId ?? ''}
            onChange={(e) => set('userId', e.target.value)}
            className={field}
          >
            <option value="">Choose a teammate…</option>
            {p.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-faint">
            Checked again every time it runs: if they are suspended or removed, the run fails
            instead.
          </span>
        </label>
      )}
      {s.action === 'set_conversation_status' && (
        <label className={label}>
          Set status to
          <select
            aria-label="Status"
            disabled={p.readOnly}
            value={s.config.status ?? ''}
            onChange={(e) => set('status', e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
      )}
      {(s.action === 'add_customer_tag' || s.action === 'remove_customer_tag') && (
        <label className={label}>
          Tag
          <input
            aria-label="Tag"
            disabled={p.readOnly}
            maxLength={40}
            value={s.config.tag ?? ''}
            onChange={(e) => set('tag', e.target.value)}
            className={field}
          />
        </label>
      )}
      {s.action === 'set_lead_stage' && (
        <label className={label}>
          Move lead to
          <select
            aria-label="Stage"
            disabled={p.readOnly}
            value={s.config.stage ?? ''}
            onChange={(e) => set('stage', e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            {STAGES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
