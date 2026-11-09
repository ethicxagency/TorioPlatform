'use client';

import { formatMoney } from '@torio/contracts';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/features/leads/components/modal';
import { Pill } from '@/features/brain/components/bits';
import { cn } from '@/lib/utils';
import { useAdminShell } from './admin-shell';

export const money = formatMoney;
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';
const TONES: Record<string, Tone> = {
  ACTIVE: 'ok',
  TRIALING: 'info',
  PAST_DUE: 'bad',
  CANCELED: 'neutral',
  EXPIRED: 'neutral',
  DISABLED: 'bad',
  SUSPENDED: 'bad',
  NONE: 'neutral',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
  PAID: 'ok',
  PENDING: 'warn',
  FAILED: 'bad',
  REFUNDED: 'info',
  VOID: 'neutral',
  MANUAL: 'info',
  PROVIDER: 'neutral',
};
const LABEL: Record<string, string> = {
  DISABLED: 'Suspended',
  NONE: 'Free plan',
  PAST_DUE: 'Past due',
  MANUAL: 'Manual grant',
  PROVIDER: 'Provider',
};
export const Status = ({ value, plan }: { value: string; plan?: boolean }) => (
  <Pill tone={TONES[value] ?? 'neutral'}>
    {(!plan && LABEL[value]) || value.charAt(0) + value.slice(1).toLowerCase().replace('_', ' ')}
  </Pill>
);

export function PageHead({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0 font-page-title">{title}</h1>
        <p className="m-0 mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export const Panel = ({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section aria-label={title} className="rounded-card border border-line bg-white p-4">
    {title && (
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[14px] font-semibold">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'bad' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      className={cn(
        'rounded-xl px-3.5 py-2.5 text-[13px]',
        tone === 'bad'
          ? 'bg-danger-soft text-[#8F2424]'
          : tone === 'warn'
            ? 'bg-warning-soft text-warning'
            : 'bg-wash text-muted',
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full bg-wash-2" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function Pager({
  meta,
  onPage,
}: {
  meta: { page: number; totalPages: number; total: number } | undefined;
  onPage: (p: number) => void;
}) {
  if (!meta) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted">
      <span aria-live="polite">{meta.total} total</span>
      <span className="flex items-center gap-2">
        Page {meta.page} of {meta.totalPages}
        <Button
          size="sm"
          variant="outline"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Next
        </Button>
      </span>
    </div>
  );
}

export const th = 'px-3 py-2 text-left text-[12px] font-semibold text-muted whitespace-nowrap';
export const td = 'px-3 py-2.5 align-middle';
export const input = 'h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink';

export function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(input, 'min-w-[200px] flex-1 sm:max-w-[320px]')}
    />
  );
}

/** Dialog that requires a written reason before a consequential admin action. The reason is stored in the audit log. */
export function ReasonDialog({
  title,
  body,
  confirmLabel,
  danger,
  extra,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  extra?: React.ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return;
    if (reason.trim().length < 5)
      return setError('Give a reason of at least 5 characters. It is saved in the audit log.');
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={danger ? 'bg-danger hover:bg-danger' : undefined}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-muted">{body}</div>
      {extra && <div className="mt-3">{extra}</div>}
      <label className="mt-3 flex flex-col gap-1 text-[12.5px] font-medium">
        Reason (required)
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          aria-invalid={!!error}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          className="rounded-lg border border-line bg-white p-2.5 text-[13px] font-normal"
        />
      </label>
      {error && (
        <div className="mt-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Modal>
  );
}

/** Right-hand detail drawer with focus management. */
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { registerEscape } = useAdminShell();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus();
  }, []);
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[70] glass-scrim" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.16)] sm:w-[540px]"
      >
        <header className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <h2 className="m-0 min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          <button
            ref={ref}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">{children}</div>
      </aside>
    </>
  );
}

export function useDebounce<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
