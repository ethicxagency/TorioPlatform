'use client';

import { Children, Fragment, isValidElement, useState } from 'react';
import { Select, type SelectOption } from './select';

type OptionProps = {
  value?: string | number;
  disabled?: boolean;
  children?: React.ReactNode;
  hidden?: boolean;
};

const text = (n: React.ReactNode): string =>
  Children.toArray(n)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');

/** Reads <option> children (also inside fragments, arrays and .map output) into options for the shared Select. */
function readOptions(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const walk = (nodes: React.ReactNode) =>
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as React.ReactElement<OptionProps & { children?: React.ReactNode }>;
      if (el.type === Fragment) return walk(el.props.children);
      if (el.type === 'option') {
        if (el.props.hidden) return;
        const label = text(el.props.children);
        const value = el.props.value === undefined ? label : String(el.props.value);
        out.push({ value, label, disabled: el.props.disabled });
      }
    });
  walk(children);
  return out;
}

export interface FieldSelectProps {
  value?: string | number;
  defaultValue?: string | number;
  /** Called like a native select's: `e.target.value` is the chosen value. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** <option> elements, exactly as for a native select. */
  children?: React.ReactNode;
}

/**
 * The form-field select: the same API as a native <select> (value, onChange(e), <option> children), drawn with the shared
 * Select so every dropdown in the app opens the same modern, keyboard-accessible, viewport-aware list. A form field keeps its
 * `name` through a hidden input.
 */
export function FieldSelect({
  value,
  defaultValue,
  onChange,
  id,
  name,
  className,
  disabled,
  children,
  'aria-label': ariaLabel,
}: FieldSelectProps) {
  const options = readOptions(children);
  const [inner, setInner] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const controlled = value !== undefined;
  const current = controlled ? String(value) : inner;
  return (
    <>
      <Select
        id={id}
        aria-label={ariaLabel}
        value={current}
        options={options}
        disabled={disabled}
        className={className}
        onChange={(v) => {
          if (!controlled) setInner(v);
          onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } } as never);
        }}
      />
      {name && <input type="hidden" name={name} value={current} />}
    </>
  );
}
