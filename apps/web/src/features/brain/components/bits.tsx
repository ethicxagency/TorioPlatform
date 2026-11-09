'use client';

import { Check, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { AREA, controlCls } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const inputCls = controlCls;
export const areaCls = AREA;

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-faint">{hint}</span>
      ) : null}
    </div>
  );
}

export const TextField = ({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  className,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  className?: string;
  type?: string;
}) => (
  <Field label={label} hint={hint} error={error} className={className}>
    {(id) => (
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    )}
  </Field>
);
export const AreaField = ({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  placeholder,
  className,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
  className?: string;
  error?: string;
}) => (
  <Field label={label} hint={hint} error={error} className={className}>
    {(id) => (
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={areaCls}
      />
    )}
  </Field>
);
export const SelectField = ({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  hint?: string;
  className?: string;
}) => (
  <Field label={label} hint={hint} className={className}>
    {(id) => (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )}
  </Field>
);

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg py-1 text-left disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-[#D1D5DB]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all motion-reduce:transition-none',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
    </button>
  );
}

/** Multi-select chips with an optional "add your own" input. */
export function Chips({
  label,
  values,
  options,
  onChange,
  allowCustom = true,
  hint,
}: {
  label: string;
  values: string[];
  options: readonly string[];
  onChange: (v: string[]) => void;
  allowCustom?: boolean;
  hint?: string;
}) {
  const [custom, setCustom] = useState('');
  const all = [...options, ...values.filter((v) => !options.includes(v))];
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const add = () => {
    const v = custom.trim().slice(0, 40);
    setCustom('');
    if (v && !values.includes(v)) onChange([...values, v]);
  };
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {all.map((o) => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-1 rounded-full border px-3 text-[13px] disabled:cursor-not-allowed',
                on
                  ? 'border-[rgba(91,92,226,0.3)] bg-primary-soft font-semibold text-primary-hover'
                  : 'border-line bg-white text-muted hover:bg-wash',
              )}
            >
              {on && <Check size={12} />}
              {o}
            </button>
          );
        })}
        {allowCustom && (
          <span className="flex items-center gap-1">
            <input
              aria-label={`Add custom ${label.toLowerCase()}`}
              value={custom}
              maxLength={40}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Add…"
              className="h-8 w-24 rounded-full border border-dashed border-[#C9CBD3] px-3 text-[13px] disabled:bg-transparent"
            />
            <button
              type="button"
              aria-label="Add"
              onClick={add}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-wash disabled:cursor-not-allowed"
            >
              <Plus size={14} />
            </button>
          </span>
        )}
      </div>
      {hint && <p className="m-0 mt-1 text-xs text-faint">{hint}</p>}
    </fieldset>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium" id={`seg-${label}`}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`seg-${label}`}
        className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-[10px] bg-wash-2 p-[3px]"
      >
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              'h-8 cursor-pointer rounded-lg px-3 text-[13px] disabled:cursor-not-allowed',
              value === o
                ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                : 'text-muted',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info';
  children: React.ReactNode;
}) {
  const c = {
    ok: 'bg-success-soft text-success',
    warn: 'bg-warning-soft text-warning',
    bad: 'bg-danger-soft text-danger',
    neutral: 'bg-wash-2 text-muted',
    info: 'bg-[#EFF6FF] text-[#2563EB]',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium',
        c,
      )}
    >
      {children}
    </span>
  );
}

/** Section card with a heading that the section navigation scrolls to. */
export function SectionCard({
  id,
  title,
  description,
  status,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  status?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-16 rounded-card border border-line bg-white"
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-h`} className="m-0 text-[15px] font-semibold tracking-[-0.005em]">
            {title}
          </h2>
          {description && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{description}</p>}
        </div>
        {status}
        {action}
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
    </section>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[80] glass-scrim" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="fixed inset-y-0 right-0 z-[81] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[520px]"
      >
        <header className="flex items-center gap-2 border-b border-line-subtle px-5 py-4">
          <h2 className="m-0 flex-1 text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      </aside>
    </>
  );
}

export const uid = (p: string) => p + Math.random().toString(36).slice(2, 8);
export const fmtAgoIso = (iso: string | null | undefined) => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1
    ? 'just now'
    : m < 60
      ? `${m} min ago`
      : m < 1440
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} d ago`;
};
