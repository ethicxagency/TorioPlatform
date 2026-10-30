'use client';

import { X } from 'lucide-react';

interface Props {
  count: number;
  canManage: boolean;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onAssignMe: () => void;
  onMarkRead: () => void;
  onSnooze: () => void;
  onResolve: () => void;
}

const btn =
  'cursor-pointer rounded-md px-[7px] py-1 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50';

export function BulkActionsToolbar({
  count,
  canManage,
  busy,
  onSelectAll,
  onClear,
  onAssignMe,
  onMarkRead,
  onSnooze,
  onResolve,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="mx-3 mb-2 flex animate-panel-in flex-wrap items-center gap-1 rounded-[10px] bg-ink px-2 py-1.5 text-[12.5px] text-white"
    >
      <span className="px-1 font-semibold">{count} selected</span>
      <button type="button" onClick={onSelectAll} className={`${btn} text-[#C9CBD3]`}>
        All
      </button>
      <span className="flex-1" />
      <button type="button" disabled={busy || !canManage} onClick={onAssignMe} className={btn}>
        Assign to me
      </button>
      <button type="button" disabled={busy} onClick={onMarkRead} className={btn}>
        Read
      </button>
      <button type="button" disabled={busy || !canManage} onClick={onSnooze} className={btn}>
        Snooze
      </button>
      <button
        type="button"
        disabled={busy || !canManage}
        onClick={onResolve}
        className={`${btn} text-[#9AE6B4]`}
      >
        Resolve
      </button>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={onClear}
        className={`${btn} text-[#C9CBD3]`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
