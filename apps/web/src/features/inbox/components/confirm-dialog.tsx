'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation. Focus moves to Cancel (the safe default); Escape cancels. */
export function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(13,37,61,0.3)] p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-[380px] animate-panel-in rounded-2xl bg-white p-5 shadow-popover"
      >
        <h2 id="confirm-title" className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
        <p id="confirm-body" className="mb-4 mt-1.5 text-[13px] text-muted">
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
