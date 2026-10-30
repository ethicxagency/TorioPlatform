'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SHORTCUTS } from '../constants';

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(23,24,28,0.3)] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="w-full max-w-[420px] animate-panel-in rounded-2xl bg-white p-5 shadow-popover"
      >
        <div className="mb-3 flex items-center">
          <h2 id="shortcuts-title" className="m-0 flex-1 text-[15px] font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
          >
            <X size={16} />
          </button>
        </div>
        <dl className="m-0 flex flex-col">
          {SHORTCUTS.map(([k, l]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-4 border-b border-line-subtle py-2 text-[13px] last:border-0"
            >
              <dt className="order-2 m-0 text-muted">{l}</dt>
              <dd className="order-1 m-0">
                <kbd className="rounded-md border border-line bg-wash px-1.5 py-0.5 font-mono text-xs">
                  {k}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-3 text-xs text-faint">
          Shortcuts are ignored while you&apos;re typing in a field.
        </p>
      </div>
    </div>
  );
}
