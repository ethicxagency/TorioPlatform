'use client';

import { useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '../format';
import { useDismiss } from '../use-dismiss';
import { useKeepInView } from '../use-keep-in-view';

interface Props {
  agents: { id: string; name: string }[];
  currentId: string | null;
  meId: string;
  onPick: (agentId: string | null) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  /** Offer "Unassign" even with no current assignee (bulk use). */
  showUnassign?: boolean;
  label?: string;
}

export function AssignmentMenu({
  agents,
  currentId,
  meId,
  onPick,
  onClose,
  align = 'right',
  showUnassign = false,
  label = 'Assign conversation',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  useKeepInView(ref);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={cn(
        'absolute top-11 z-30 max-h-[min(360px,calc(100vh-140px))] w-[min(230px,calc(100vw-24px))] overflow-y-auto animate-panel-in rounded-xl border border-line glass-menu p-1.5 shadow-popover',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
        Assign to
      </div>
      {agents.map((a) => (
        <button
          key={a.id}
          role="menuitemradio"
          aria-checked={a.id === currentId}
          type="button"
          onClick={() => onPick(a.id)}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left text-[13.5px] hover:bg-wash"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E6E6FA] text-[9.5px] font-semibold text-primary-hover">
            {initialsOf(a.name)}
          </span>
          <span className="flex-1 truncate">
            {a.name}
            {a.id === meId && <span className="text-faint"> (you)</span>}
          </span>
          {a.id === currentId && <Check size={14} className="text-primary" />}
        </button>
      ))}
      {(currentId || showUnassign) && (
        <>
          <div className="my-1 h-px bg-line-subtle" />
          <button
            role="menuitem"
            type="button"
            onClick={() => onPick(null)}
            className="block w-full cursor-pointer rounded-lg p-2 text-left text-[13.5px] text-muted hover:bg-wash"
          >
            Unassign
          </button>
        </>
      )}
    </div>
  );
}
