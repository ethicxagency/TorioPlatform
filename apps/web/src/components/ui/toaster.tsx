'use client';

import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { getToasts, subscribeToasts, toast, type ToastKind } from '@/lib/toast';

const STYLE: Record<ToastKind, { icon: React.ReactNode; tile: string }> = {
  success: { icon: <Check size={14} strokeWidth={2.6} />, tile: 'bg-success-soft text-success' },
  error: { icon: <XCircle size={15} />, tile: 'bg-danger-soft text-danger' },
  warning: { icon: <AlertTriangle size={14} />, tile: 'bg-warning-soft text-warning' },
  info: { icon: <Info size={15} />, tile: 'bg-primary-soft text-primary-hover' },
};
const NONE: never[] = [];

/** Top-right stack for every toast in the app. Rendered once per shell, above drawers and dialogs. */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => NONE);
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-[max(12px,env(safe-area-inset-top))] z-[200] flex w-[min(380px,calc(100vw-24px))] flex-col items-end gap-2 sm:right-4"
    >
      {items.map((t) => {
        const s = STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border border-line bg-white py-2.5 pl-2.5 pr-1.5 shadow-popover',
              t.leaving ? 'animate-toast-out' : 'animate-toast-in',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                s.tile,
              )}
            >
              {s.icon}
            </span>
            <p className="m-0 min-w-0 flex-1 break-words pt-[3px] text-[13px] font-medium leading-[18px] text-ink">
              {t.text}
            </p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => toast.dismiss(t.id)}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
