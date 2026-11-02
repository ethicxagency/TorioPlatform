'use client';

import { Check, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useSettingsGuard } from './guard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A link that asks before leaving a Settings page with unsaved edits. */
function GuardedLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { dirty, setDirty } = useSettingsGuard();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={(e) => {
          if (!dirty) return;
          e.preventDefault();
          setAsk(true);
        }}
      >
        {children}
      </Link>
      {ask && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have edits that haven’t been saved. If you leave this page they will be lost."
          confirmLabel="Discard changes"
          onCancel={() => setAsk(false)}
          onConfirm={() => {
            setDirty(false);
            setAsk(false);
            router.push(href);
          }}
        />
      )}
    </>
  );
}

/** Detail-page header with a breadcrumb back to the Settings overview (the only Settings navigation). */
export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-5">
      <nav aria-label="Breadcrumb" className="mb-2 text-[13px]">
        <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-muted">
          <li>
            <GuardedLink
              href="/settings"
              className="inline-flex items-center gap-1 rounded text-muted no-underline hover:text-primary hover:no-underline"
            >
              <ChevronLeft size={14} aria-hidden />
              Settings
            </GuardedLink>
          </li>
          <li aria-hidden className="text-faint">
            /
          </li>
          <li aria-current="page" className="font-medium text-ink">
            {title}
          </li>
        </ol>
      </nav>
      <h1 className="m-0 font-page-title">{title}</h1>
      <p className="m-0 mt-1 text-sm text-muted">{description}</p>
    </header>
  );
}

export function Section({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'mb-4 rounded-card border bg-white p-4 sm:p-5',
        danger ? 'border-[#F3C4C4]' : 'border-line',
      )}
    >
      <h2 className="m-0 font-card-title">{title}</h2>
      {description && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const inputCls =
  'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted aria-[invalid=true]:border-danger';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-label text-ink">
        {label}
        {required && (
          <span aria-hidden className="text-danger">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span id={`${htmlFor}-err`} role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-faint">{hint}</span>
      )}
    </div>
  );
}

/** Save / Cancel row. Sticks to the bottom of the viewport on phones so it is always reachable. */
export function SaveBar({
  dirty,
  busy,
  saved,
  onCancel,
  label = 'Save changes',
}: {
  dirty: boolean;
  busy: boolean;
  saved: boolean;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-line-subtle bg-white/95 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      <Button type="submit" disabled={!dirty || busy}>
        {busy ? 'Saving…' : label}
      </Button>
      <Button type="button" variant="outline" disabled={!dirty || busy} onClick={onCancel}>
        Cancel
      </Button>
      <span aria-live="polite" className="ml-1 text-xs text-muted">
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-success">
            <Check size={13} /> Saved
          </span>
        )}
        {dirty && !busy && 'Unsaved changes'}
      </span>
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-xl px-3 py-2.5 text-[12.5px]',
        tone === 'error' && 'bg-danger-soft text-[#8F2424]',
        tone === 'warn' && 'bg-warning-soft text-warning',
        tone === 'info' && 'bg-wash text-muted',
      )}
    >
      {children}
    </div>
  );
}

/** Maps server validation details (path → message) onto form fields. */
export function fieldErrors(e: unknown): Record<string, string> {
  const d = (e as { details?: { path: string; message: string }[] } | null)?.details ?? [];
  return Object.fromEntries(d.map((x) => [x.path.split('.').pop() ?? x.path, x.message]));
}
