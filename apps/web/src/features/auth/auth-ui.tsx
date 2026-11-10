'use client';

import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const inputCls =
  'h-12 w-full rounded-[var(--radius-input)] border border-line-input bg-white px-3.5 text-[14.5px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-[#C9CBD3] focus:border-primary focus:ring-[3px] focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:bg-wash disabled:text-muted motion-reduce:transition-none';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

/** Labelled input whose error is announced to screen readers and tied to the field. */
export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, error, hint, optional, className, id, ...rest },
  ref,
) {
  const uid = useId();
  const fid = id ?? uid;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-[13.5px] font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-faint"> (optional)</span>}
      </label>
      <input
        ref={ref}
        id={fid}
        aria-invalid={!!error}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={cn(inputCls, className)}
        {...rest}
      />
      {error ? (
        <span id={`${fid}-err`} role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${fid}-hint`} className="text-[12.5px] text-faint">
            {hint}
          </span>
        )
      )}
    </div>
  );
});

/** How strong a new password is, by the rules the API enforces plus length: a guide, not a second validator. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (pw.length >= 14 || /[^A-Za-z0-9]/.test(pw)) s++;
  const score = s as 0 | 1 | 2 | 3 | 4;
  return { score, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score]! };
}

/** The rules the API enforces, shown live so a customer sees what's left instead of guessing. */
export function PasswordRules({ value }: { value: string }) {
  const rules = [
    ['At least 10 characters', value.length >= 10],
    ['An uppercase letter', /[A-Z]/.test(value)],
    ['A lowercase letter', /[a-z]/.test(value)],
    ['A number', /\d/.test(value)],
  ] as const;
  return (
    <ul
      aria-label="Password requirements"
      className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1 p-0 text-[12.5px]"
    >
      {rules.map(([label, ok]) => (
        <li
          key={label}
          className={cn('flex items-center gap-1.5', ok ? 'text-success' : 'text-faint')}
        >
          <CheckCircle2 size={13} aria-hidden className={ok ? '' : 'opacity-40'} />
          {label}
          <span className="sr-only">{ok ? ' (met)' : ' (not met yet)'}</span>
        </li>
      ))}
    </ul>
  );
}

interface PasswordProps extends Omit<FieldProps, 'type'> {
  /** Show the strength meter (new passwords only). */
  meter?: boolean;
  value?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordProps>(function PasswordField(
  { label, error, hint, meter, value, className, id, ...rest },
  ref,
) {
  const uid = useId();
  const fid = id ?? uid;
  const [show, setShow] = useState(false);
  const st = passwordStrength(value ?? '');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-[13.5px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={fid}
          type={show ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : meter ? `${fid}-meter` : undefined}
          className={cn(inputCls, 'pr-11', className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          {show ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </div>
      {meter && value && (
        <div id={`${fid}-meter`} className="flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full bg-line transition-colors duration-150 motion-reduce:transition-none',
                  st.score >= i &&
                    (st.score <= 1 ? 'bg-danger' : st.score === 2 ? 'bg-[#E8A317]' : 'bg-success'),
                )}
              />
            ))}
          </div>
          <span className="w-14 text-right text-xs text-muted">{st.label}</span>
        </div>
      )}
      {error ? (
        <span id={`${fid}-err`} role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-[12.5px] text-faint">{hint}</span>
      )}
    </div>
  );
});

export function SubmitButton({
  busy,
  children,
  busyText,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyText?: string }) {
  return (
    <button
      type="submit"
      disabled={busy || rest.disabled}
      aria-busy={busy}
      className={cn(
        'flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-white shadow-[0_1px_3px_rgba(0,55,112,0.08)] transition-colors duration-150 hover:bg-primary-hover active:bg-primary-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none',
        className,
      )}
      {...rest}
    >
      {busy && (
        <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
      )}
      {busy ? (busyText ?? 'Please wait…') : children}
    </button>
  );
}

export function FormAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'success';
  children: React.ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13.5px] leading-snug',
        tone === 'error' && 'border-[#F3C4C4] bg-danger-soft text-[#8F2424]',
        tone === 'info' && 'border-line bg-wash text-muted',
        tone === 'success' && 'border-[#BFE3CB] bg-success-soft text-success',
      )}
    >
      <Icon size={16} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const AuthLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link
    href={href}
    className="font-semibold text-primary no-underline hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-primary"
  >
    {children}
  </Link>
);
