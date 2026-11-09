'use client';

import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flag,
  Mail,
  MailOpen,
  Minus,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { cn } from '@/lib/utils';
import type { Priority } from '../types';
import { useDismiss } from '../use-dismiss';
import { useKeepInView } from '../use-keep-in-view';
import { AssignmentMenu } from './assignment-menu';
import { SnoozeMenu } from './snooze-menu';

/** Every action here maps to one call of the bulk conversations endpoint. */
export type BulkRequest =
  | { action: 'ASSIGN'; assigneeId: string | null }
  | { action: 'MARK_READ' }
  | { action: 'MARK_UNREAD' }
  | { action: 'SET_PRIORITY'; priority: Priority }
  | { action: 'SNOOZE'; until: Date }
  | { action: 'RESOLVE' };

interface Props {
  /** Conversations in the list right now (what "Select all" selects). */
  total: number;
  count: number;
  busy: boolean;
  agents: { id: string; name: string }[];
  meId: string;
  onToggleAll: () => void;
  onDone: () => void;
  onAction: (req: BulkRequest) => void;
}

const PRIORITY_ITEMS: { key: Priority; label: string; dot: string }[] = [
  { key: 'HIGH', label: 'Urgent', dot: 'bg-[#E5484D]' },
  { key: 'NORMAL', label: 'Normal', dot: 'bg-faint' },
  { key: 'LOW', label: 'Low', dot: 'bg-line-input' },
];

const actionBtn =
  'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[12.5px] font-medium text-ink transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent motion-reduce:transition-none';

function PriorityMenu({ onPick, onClose }: { onPick: (p: Priority) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  useKeepInView(ref);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Set priority"
      className="absolute left-0 top-10 z-30 w-[min(200px,calc(100vw-24px))] animate-panel-in rounded-xl border border-line glass-menu p-1.5 shadow-popover"
    >
      {PRIORITY_ITEMS.map((p) => (
        <button
          key={p.key}
          type="button"
          role="menuitem"
          onClick={() => onPick(p.key)}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left text-[13.5px] hover:bg-wash"
        >
          <span aria-hidden className={cn('h-2 w-2 rounded-full', p.dot)} />
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Manage-mode toolbar: select all, the selected count, a way out, and the bulk actions the API supports.
 * Actions are disabled until something is selected.
 */
export function BulkActionsToolbar({
  total,
  count,
  busy,
  agents,
  meId,
  onToggleAll,
  onDone,
  onAction,
}: Props) {
  const { registerEscape } = useShell();
  const [menu, setMenu] = useState<'assign' | 'priority' | 'snooze' | null>(null);
  useEffect(() => (menu ? registerEscape(() => setMenu(null)) : undefined), [menu, registerEscape]);
  const all = total > 0 && count === total;
  const some = count > 0 && !all;
  const off = busy || count === 0;
  const run = (req: BulkRequest) => {
    setMenu(null);
    onAction(req);
  };
  const toggle = (m: NonNullable<typeof menu>) => setMenu((cur) => (cur === m ? null : m));

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="mx-3 mb-2 animate-panel-in rounded-[10px] border border-line bg-white p-1 shadow-[0_1px_2px_rgba(0,55,112,0.06)]"
    >
      <div className="flex items-center gap-2 pl-1.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={all ? true : some ? 'mixed' : false}
          aria-label="Select all"
          disabled={total === 0}
          onClick={onToggleAll}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] pr-1.5 text-[12.5px] font-medium text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={cn(
              'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-150 motion-reduce:transition-none',
              all || some ? 'border-primary bg-primary' : 'border-[#C9CBD3] bg-white',
            )}
          >
            {all && <Check size={12} strokeWidth={3.4} className="text-white" />}
            {some && <Minus size={12} strokeWidth={3.4} className="text-white" />}
          </span>
          Select all
        </button>
        <span aria-live="polite" className="text-[12.5px] font-semibold text-ink">
          {count > 0 ? `${count} selected` : ''}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          className="h-8 cursor-pointer rounded-[var(--radius-control)] px-2.5 text-[12.5px] font-semibold text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
        >
          Done
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-0.5 border-t border-line-subtle pt-1">
        <span className="relative">
          <button
            type="button"
            disabled={off}
            aria-haspopup="menu"
            aria-expanded={menu === 'assign'}
            onClick={() => toggle('assign')}
            className={actionBtn}
          >
            <UserPlus size={14} aria-hidden className="text-faint" />
            Assign
            <ChevronDown size={13} aria-hidden className="text-faint" />
          </button>
          {menu === 'assign' && (
            <AssignmentMenu
              agents={agents}
              currentId={null}
              meId={meId}
              align="left"
              showUnassign
              label="Assign selected conversations"
              onPick={(assigneeId) => run({ action: 'ASSIGN', assigneeId })}
              onClose={() => setMenu(null)}
            />
          )}
        </span>
        <button
          type="button"
          disabled={off}
          onClick={() => run({ action: 'MARK_READ' })}
          className={actionBtn}
        >
          <MailOpen size={14} aria-hidden className="text-faint" />
          Mark read
        </button>
        <button
          type="button"
          disabled={off}
          onClick={() => run({ action: 'MARK_UNREAD' })}
          className={actionBtn}
        >
          <Mail size={14} aria-hidden className="text-faint" />
          Mark unread
        </button>
        <span className="relative">
          <button
            type="button"
            disabled={off}
            aria-haspopup="menu"
            aria-expanded={menu === 'priority'}
            onClick={() => toggle('priority')}
            className={actionBtn}
          >
            <Flag size={14} aria-hidden className="text-faint" />
            Priority
            <ChevronDown size={13} aria-hidden className="text-faint" />
          </button>
          {menu === 'priority' && (
            <PriorityMenu
              onPick={(priority) => run({ action: 'SET_PRIORITY', priority })}
              onClose={() => setMenu(null)}
            />
          )}
        </span>
        <span className="relative">
          <button
            type="button"
            disabled={off}
            aria-haspopup="menu"
            aria-expanded={menu === 'snooze'}
            onClick={() => toggle('snooze')}
            className={actionBtn}
          >
            <Clock size={14} aria-hidden className="text-faint" />
            Snooze
            <ChevronDown size={13} aria-hidden className="text-faint" />
          </button>
          {menu === 'snooze' && (
            <SnoozeMenu
              align="left"
              label="Snooze selected conversations"
              onPick={(until) => run({ action: 'SNOOZE', until })}
              onClose={() => setMenu(null)}
            />
          )}
        </span>
        <button
          type="button"
          disabled={off}
          onClick={() => run({ action: 'RESOLVE' })}
          className={cn(actionBtn, 'text-success')}
        >
          <CheckCircle2 size={14} aria-hidden />
          Resolve
        </button>
      </div>
    </div>
  );
}
