'use client';

import {
  ArrowDown,
  ArrowUp,
  CirclePlus,
  Clock,
  Copy,
  Filter,
  Flag,
  TriangleAlert,
  Trash2,
  Zap,
  Play,
} from 'lucide-react';
import {
  ACTIONS,
  describeStep,
  triggerOf,
  type Definition,
  type Issue,
  type Step,
} from '@torio/contracts';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ICON = { condition: Filter, wait: Clock, action: Zap } as const;

export interface NewStep {
  kind: 'condition' | 'wait' | 'action';
  action?: (typeof ACTIONS)[number]['type'];
}

/** Step types the editor can add, from the same registry the server validates against. */
export function LibraryList({
  trigger,
  onAdd,
  disabled,
}: {
  trigger: string;
  onAdd: (s: NewStep) => void;
  disabled: boolean;
}) {
  const trig = triggerOf(trigger);
  const group =
    'm-0 mb-1.5 mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-faint first:mt-0';
  const btn =
    'flex w-full cursor-pointer items-start gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-[12.5px] hover:border-[#D4D6F5] hover:bg-[#FBFBFF] disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div>
      <h3 className={group}>Flow</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        <li>
          <button
            type="button"
            disabled={disabled}
            className={btn}
            onClick={() => onAdd({ kind: 'condition' })}
          >
            <Filter size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span>
              <b className="block font-medium">Condition</b>
              <span className="text-faint">Continue only if all conditions match</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={disabled}
            className={btn}
            onClick={() => onAdd({ kind: 'wait' })}
          >
            <Clock size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span>
              <b className="block font-medium">Wait</b>
              <span className="text-faint">Pause, then continue (1 minute to 7 days)</span>
            </span>
          </button>
        </li>
      </ul>
      <h3 className={group}>Actions</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {ACTIONS.map((a) => {
          const ok = !!trig && trig.provides.includes(a.needs);
          return (
            <li key={a.type}>
              <button
                type="button"
                disabled={disabled || !ok}
                title={ok ? undefined : `Needs a ${a.needs}, which this trigger doesn’t provide`}
                className={btn}
                onClick={() => onAdd({ kind: 'action', action: a.type })}
              >
                <Zap size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <span>
                  <b className="block font-medium">{a.label}</b>
                  <span className="text-faint">
                    {ok ? a.description : `Unavailable for this trigger`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <h3 className={group}>Not available</h3>
      <p className="m-0 px-1 text-xs text-faint">
        Sending customer messages, branching and external calls aren&apos;t supported yet.
      </p>
    </div>
  );
}

function Connector({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center" aria-hidden={disabled}>
      <span className="h-3 w-px bg-line" />
      {!disabled && (
        <button
          type="button"
          aria-label="Add a step here"
          onClick={onAdd}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-primary hover:bg-primary-soft"
        >
          <CirclePlus size={16} />
        </button>
      )}
      <span className="h-3 w-px bg-line" />
    </div>
  );
}

export function Flow({
  def,
  issues,
  selected,
  readOnly,
  onSelect,
  onInsert,
  onMove,
  onDuplicate,
  onDelete,
}: {
  def: Definition;
  issues: Issue[];
  selected: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onInsert: (at: number, s: NewStep) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
}) {
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const trig = triggerOf(def.trigger.type);
  const problems = (id: string | null) => issues.filter((i) => i.stepId === id);
  const node = (selectedNow: boolean, bad: boolean) =>
    cn(
      'w-full max-w-[460px] rounded-card border bg-white p-3 text-left',
      selectedNow
        ? 'border-primary shadow-[0_0_0_3px_rgba(91,92,226,0.15)]'
        : 'border-line hover:border-[#D4D6F5]',
      bad && !selectedNow && 'border-danger',
    );
  return (
    <ol aria-label="Workflow" className="m-0 flex list-none flex-col items-center p-0">
      <li className="w-full max-w-[460px]">
        <button
          type="button"
          aria-pressed={selected === 'trigger'}
          onClick={() => onSelect('trigger')}
          className={cn(
            node(selected === 'trigger', problems(null).length > 0),
            'cursor-pointer bg-primary-soft',
          )}
        >
          <span className="flex items-center gap-2 text-xs font-medium text-primary-hover">
            <Play size={13} aria-hidden /> Trigger
          </span>
          <span className="mt-1 block text-[13.5px] font-semibold">
            {trig?.label ?? 'Choose a trigger'}
          </span>
          <span className="block text-xs text-muted">{trig?.description}</span>
        </button>
      </li>
      {def.steps.map((s: Step, i) => {
        const Icon = ICON[s.type];
        const errs = problems(s.id);
        return (
          <li key={s.id} className="flex w-full flex-col items-center">
            <Connector disabled={readOnly} onAdd={() => setMenuAt(menuAt === i ? null : i)} />
            {menuAt === i && (
              <div className="mb-2 w-full max-w-[460px] rounded-xl border border-line bg-white p-2 shadow-popover">
                <LibraryList
                  trigger={def.trigger.type}
                  disabled={false}
                  onAdd={(n) => {
                    setMenuAt(null);
                    onInsert(i, n);
                  }}
                />
              </div>
            )}
            <div className={node(selected === s.id, errs.length > 0)}>
              <button
                type="button"
                aria-pressed={selected === s.id}
                onClick={() => onSelect(s.id)}
                className="block w-full cursor-pointer text-left"
              >
                <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <Icon size={14} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{describeStep(s)}</span>
                  {errs.length > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger">
                      <TriangleAlert size={13} aria-hidden /> Needs attention
                    </span>
                  )}
                </span>
                <StepSummary s={s} />
              </button>
              {!readOnly && (
                <div className="mt-2 flex items-center gap-1 border-t border-line-subtle pt-2">
                  <IconBtn
                    label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => onMove(i, -1)}
                  >
                    <ArrowUp size={13} />
                  </IconBtn>
                  <IconBtn
                    label={`Move step ${i + 1} down`}
                    disabled={i === def.steps.length - 1}
                    onClick={() => onMove(i, 1)}
                  >
                    <ArrowDown size={13} />
                  </IconBtn>
                  <IconBtn label={`Duplicate step ${i + 1}`} onClick={() => onDuplicate(i)}>
                    <Copy size={13} />
                  </IconBtn>
                  <span className="flex-1" />
                  <IconBtn label={`Delete step ${i + 1}`} danger onClick={() => onDelete(i)}>
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              )}
            </div>
          </li>
        );
      })}
      <li className="flex w-full flex-col items-center">
        <Connector
          disabled={readOnly}
          onAdd={() => setMenuAt(menuAt === def.steps.length ? null : def.steps.length)}
        />
        {menuAt === def.steps.length && (
          <div className="mb-2 w-full max-w-[460px] rounded-xl border border-line bg-white p-2 shadow-popover">
            <LibraryList
              trigger={def.trigger.type}
              disabled={false}
              onAdd={(n) => {
                setMenuAt(null);
                onInsert(def.steps.length, n);
              }}
            />
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-dashed border-line bg-white px-3 py-1 text-xs text-muted">
          <Flag size={12} aria-hidden /> End
        </div>
      </li>
    </ol>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40',
        danger && 'hover:text-danger',
      )}
    >
      {children}
    </button>
  );
}

function StepSummary({ s }: { s: Step }) {
  if (s.type === 'condition')
    return (
      <span className="mt-1 block text-xs text-muted">
        {s.conditions
          .map((c) => `${c.field} ${c.op.replace('_', ' ')} ${c.value}`.trim())
          .join(' AND ')}
      </span>
    );
  if (s.type === 'action' && s.config.text)
    return <span className="mt-1 block truncate text-xs text-muted">“{s.config.text}”</span>;
  if (s.type === 'action' && s.config.tag)
    return <span className="mt-1 block text-xs text-muted">Tag: {s.config.tag}</span>;
  return null;
}
