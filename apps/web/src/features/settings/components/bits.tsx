'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { useSettingsGuard } from './guard';
import { controlCls } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** A link that asks before leaving a Settings page with unsaved edits. */
export function GuardedLink({
  href,
  className,
  children,
  onNavigate,
  current,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  /** Called when the link is followed (not when the discard prompt intercepts it). */
  onNavigate?: () => void;
  current?: boolean;
}) {
  const { dirty, setDirty } = useSettingsGuard();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Link
        href={href}
        className={className}
        aria-current={current ? 'page' : undefined}
        onClick={(e) => {
          if (!dirty) return onNavigate?.();
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
            onNavigate?.();
            router.push(href);
          }}
        />
      )}
    </>
  );
}

/** Page header for a Settings page. Navigation lives in the section rail beside the page, so this is just the title. */
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-2">
      <h1 className="m-0 font-page-title">{title}</h1>
      {description && <p className="m-0 mt-1 text-sm text-muted">{description}</p>}
    </header>
  );
}

/**
 * One group of settings: the title sits in a left rail on wide screens (above the fields on narrow ones) and the
 * controls take the rest of the width. Groups are separated by a hairline, never boxed in cards.
 */
export function Section({
  title,
  description,
  children,
  danger,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
  /** Anchor, so old URLs and links can jump to this section. */
  id?: string;
  /** Kept so existing callers compile; sections no longer draw an icon tile. */
  icon?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="grid scroll-mt-20 gap-x-10 gap-y-4 border-t border-line-subtle py-7 first:border-t-0 lg:grid-cols-[220px_minmax(0,1fr)]"
    >
      <div className="min-w-0">
        <h2 className={cn('m-0 font-card-title', danger && 'text-danger')}>{title}</h2>
        {description && <p className="m-0 mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 max-w-[720px] flex-col gap-4">{children}</div>
    </section>
  );
}

export const inputCls = controlCls;

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
