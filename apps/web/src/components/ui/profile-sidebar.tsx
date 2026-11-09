'use client';

import { Copy, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';

/**
 * Shared frame for the Lead and Customer profile drawers: one shell, one header, one section style and one row
 * pattern, so the two panels look and behave the same while each keeps its own content and business logic.
 */

/** Dim layer plus a right-hand drawer. Escape and the scrim close it; focus returns to whatever opened it. */
export function ProfileShell({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { registerEscape } = useShell();
  useEffect(() => registerEscape(onClose), [registerEscape, onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[70] glass-scrim" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fixed inset-y-0 right-0 z-[71] flex w-full animate-drawer-in flex-col bg-white shadow-[-12px_0_40px_rgba(0,55,112,0.14)] motion-reduce:animate-none sm:w-[min(440px,100vw)]"
      >
        {children}
      </aside>
    </>
  );
}

/** Pinned identity block: avatar, name, a badge row, a one-line summary, the close button and the quick actions. */
export function ProfileHeader({
  initials,
  name,
  badges,
  summary,
  closeLabel,
  onClose,
  actions,
}: {
  initials: string;
  name: string;
  badges?: React.ReactNode;
  summary?: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);
  return (
    <header className="glass-header shrink-0 border-b border-line-subtle px-5 pb-3.5 pt-4">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-wash-2 text-base font-semibold text-muted ring-1 ring-inset ring-line-subtle"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="m-0 truncate font-section-title text-[20px] text-ink">{name}</h2>
          {badges && <div className="mt-1 flex flex-wrap items-center gap-1.5">{badges}</div>}
          {summary && <div className="mt-1.5 truncate text-[13px] text-muted">{summary}</div>}
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label={closeLabel}
          title="Close"
          onClick={onClose}
          className="-mr-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <X size={18} />
        </button>
      </div>
      {actions && <div className="mt-3.5 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** The scrolling body under the pinned header. */
export function ProfileBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
  );
}

export function ProfileSection({
  id,
  title,
  className,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn('mt-6 first:mt-0', className)}>
      <h3
        id={id}
        className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-faint"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Label and value for read-only details; editable values are passed in as controls and keep the same alignment. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-[13px]">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}

/** A contact line: icon, label, the value (a real mailto:/tel: link for email and phone) and a copy action. */
export function ContactRow({
  icon: Icon,
  label,
  value,
  kind,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  kind?: 'mail' | 'tel';
}) {
  const { toast } = useShell();
  return (
    <div className="flex items-center gap-3 py-2 text-[13px]">
      <Icon size={15} aria-hidden className="shrink-0 text-faint" />
      <dt className="w-[68px] shrink-0 text-muted">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 break-words">
        {value ? (
          kind ? (
            <a
              href={`${kind === 'mail' ? 'mailto' : 'tel'}:${value}`}
              className="text-ink no-underline hover:text-primary hover:underline"
            >
              {value}
            </a>
          ) : (
            <span className="text-ink">{value}</span>
          )
        ) : (
          <span className="text-faint">Not provided</span>
        )}
      </dd>
      {value && kind && (
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          title={`Copy ${label.toLowerCase()}`}
          onClick={() =>
            void navigator.clipboard?.writeText(value).then(
              () => toast(`${label} copied`),
              () => toast("Couldn't copy"),
            )
          }
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-wash-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <Copy size={13} />
        </button>
      )}
    </div>
  );
}

/** Compact two-up metric tile used in the Customer overview. */
export function ProfileMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}
