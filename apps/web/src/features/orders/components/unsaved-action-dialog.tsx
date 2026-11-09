'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/** Shown when an action works on the saved order while edits are pending. Never discards silently. */
export function UnsavedActionDialog({
  action,
  saving,
  onKeep,
  onDiscard,
  onSave,
}: {
  action: string;
  saving: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center glass-scrim p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ua-title"
        aria-describedby="ua-body"
        onKeyDown={(e) => e.key === 'Escape' && !saving && onKeep()}
        className="w-full max-w-[420px] animate-modal-in rounded-2xl bg-white p-5 shadow-popover"
      >
        <h2 id="ua-title" className="m-0 text-[15px] font-semibold">
          Save your changes first?
        </h2>
        <p id="ua-body" className="mb-4 mt-1.5 text-[13px] text-muted">
          You have unsaved edits. {action} works on the saved order, so your edits aren&apos;t
          included until you save them.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={keep} variant="outline" size="sm" disabled={saving} onClick={onKeep}>
            Keep editing
          </Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={onDiscard}>
            Discard and continue
          </Button>
          <Button size="sm" loading={saving} onClick={onSave}>
            Save and continue
          </Button>
        </div>
      </div>
    </div>
  );
}
