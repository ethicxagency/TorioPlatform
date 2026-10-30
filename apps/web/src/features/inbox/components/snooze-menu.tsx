'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { SNOOZE_OPTIONS } from '../constants';
import { snoozeLabel } from '../format';
import { useDismiss } from '../use-dismiss';

interface Props {
  onPick: (until: Date) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

export function SnoozeMenu({ onPick, onClose, align = 'right' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const now = new Date();
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Snooze conversation"
      className={cn(
        'absolute top-11 z-30 w-[230px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
        Snooze until
      </div>
      {SNOOZE_OPTIONS.map((o) => {
        const until = o.until(now);
        return (
          <button
            key={o.key}
            role="menuitem"
            type="button"
            onClick={() => onPick(until)}
            className="flex w-full cursor-pointer flex-col rounded-lg p-2 text-left hover:bg-wash"
          >
            <span className="text-[13.5px]">{o.label}</span>
            <span className="text-xs text-faint">{snoozeLabel(until.toISOString())}</span>
          </button>
        );
      })}
    </div>
  );
}
