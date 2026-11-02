'use client';

import {
  ChevronDown,
  ChevronLeft,
  Clock,
  Flag,
  MailOpen,
  PanelRight,
  RotateCcw,
  UserPlus,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { CHANNELS } from '../constants';
import { initialsOf, minutesSince, fmtWait, snoozeLabel } from '../format';
import { useDismiss } from '../use-dismiss';
import type { Conversation } from '../types';
import { AssignmentMenu } from './assignment-menu';
import { ChannelBadge } from './channel-badge';
import { SnoozeMenu } from './snooze-menu';

export type HeaderMenu = 'assign' | 'snooze' | 'more' | null;

interface Props {
  c: Conversation;
  agents: { id: string; name: string }[];
  meId: string;
  canManage: boolean;
  profileOpen: boolean;
  showBack: boolean;
  showLabels: boolean;
  menu: HeaderMenu;
  onMenu: (m: HeaderMenu) => void;
  onBack: () => void;
  onAssign: (agentId: string | null) => void;
  onSnooze: (until: Date) => void;
  onResolveToggle: () => void;
  onToggleUrgent: () => void;
  onMarkUnread: () => void;
  onOpenProfile: () => void;
  onCloseChat: () => void;
}

const btn =
  'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-line bg-white px-2.5 text-[13px] font-medium text-ink hover:bg-wash disabled:cursor-not-allowed disabled:opacity-50';
const STATUS_BADGE = { OPEN: 'Open', SNOOZED: 'Snoozed', RESOLVED: 'Resolved' } as const;

export function ChatHeader(p: Props) {
  const { c } = p;
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, p.menu === 'more', () => p.onMenu(null));
  const wait = c.waitingSince && c.status === 'OPEN' ? minutesSince(c.waitingSince) : null;
  const contact = [c.customer.phone, c.customer.handle, c.customer.email].filter(Boolean)[0];
  const resolved = c.status === 'RESOLVED';

  return (
    <header className="flex min-h-[60px] shrink-0 items-center gap-3 border-b border-line bg-white/75 px-4 py-2 backdrop-blur-[16px]">
      {p.showBack && (
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={p.onBack}
          className="-ml-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="relative shrink-0">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-line-subtle text-[12.5px] font-semibold text-muted">
          {initialsOf(c.customer.name)}
        </span>
        <span className="absolute -bottom-0.5 -left-0.5">
          <ChannelBadge provider={c.channel.provider} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="m-0 truncate text-[15px] font-semibold">{c.customer.name}</h2>
          {c.priority === 'HIGH' && (
            <span className="shrink-0 rounded-md bg-danger-soft px-1.5 py-px text-[11px] font-medium text-danger">
              Urgent
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 truncate text-xs text-muted">
          <span style={{ color: CHANNELS[c.channel.provider].color }} className="font-medium">
            {CHANNELS[c.channel.provider].label}
          </span>
          <span aria-hidden>·</span>
          <span>
            {STATUS_BADGE[c.status]}
            {c.status === 'SNOOZED' && c.snoozedUntil
              ? ` until ${snoozeLabel(c.snoozedUntil)}`
              : ''}
          </span>
          {wait != null && (
            <>
              <span aria-hidden>·</span>
              <span className={wait >= 120 ? 'text-danger' : wait >= 30 ? 'text-warning' : ''}>
                Waiting {fmtWait(wait)}
              </span>
            </>
          )}
          {contact && (
            <>
              <span aria-hidden className="max-sm:hidden">
                ·
              </span>
              <span className="truncate max-sm:hidden">{contact}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative max-sm:hidden">
          <button
            type="button"
            disabled={!p.canManage || resolved}
            aria-haspopup="menu"
            aria-expanded={p.menu === 'snooze'}
            onClick={() => p.onMenu(p.menu === 'snooze' ? null : 'snooze')}
            title="Snooze (S)"
            className={btn}
          >
            <Clock size={15} />
            {p.showLabels && 'Snooze'}
          </button>
          {p.menu === 'snooze' && <SnoozeMenu onPick={p.onSnooze} onClose={() => p.onMenu(null)} />}
        </div>
        <div ref={moreRef} className="relative flex max-sm:hidden">
          <button
            type="button"
            disabled={!p.canManage}
            onClick={p.onResolveToggle}
            title={resolved ? 'Reopen (E)' : 'Resolve (E)'}
            className={cn(btn, 'rounded-r-none border-r-0', resolved ? '' : 'text-success')}
          >
            {resolved ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
            {p.showLabels && (resolved ? 'Reopen' : 'Resolve')}
          </button>
          <button
            type="button"
            aria-label="More conversation actions"
            aria-haspopup="menu"
            aria-expanded={p.menu === 'more'}
            onClick={() => p.onMenu(p.menu === 'more' ? null : 'more')}
            className={cn(btn, 'rounded-l-none px-1.5')}
          >
            <ChevronDown size={14} />
          </button>
          {p.menu === 'more' && (
            <div
              role="menu"
              aria-label="Conversation actions"
              className="absolute right-0 top-11 z-30 w-[210px] animate-panel-in rounded-xl border border-line bg-white p-1.5 shadow-popover"
            >
              <button
                role="menuitem"
                type="button"
                onClick={p.onMarkUnread}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13.5px] hover:bg-wash"
              >
                <MailOpen size={15} className="text-muted" />
                Mark as unread
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={!p.canManage}
                onClick={p.onToggleUrgent}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left text-[13.5px] hover:bg-wash disabled:opacity-50"
              >
                <Flag size={15} className="text-muted" />
                {c.priority === 'HIGH' ? 'Remove urgent' : 'Mark as urgent'}
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            disabled={!p.canManage}
            aria-haspopup="menu"
            aria-expanded={p.menu === 'assign'}
            onClick={() => p.onMenu(p.menu === 'assign' ? null : 'assign')}
            title="Assign (A)"
            className={btn}
          >
            {c.assignee ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover">
                {initialsOf(c.assignee.name)}
              </span>
            ) : (
              <UserPlus size={15} />
            )}
            {p.showLabels && (c.assignee ? c.assignee.name.split(' ')[0] : 'Assign')}
          </button>
          {p.menu === 'assign' && (
            <AssignmentMenu
              agents={p.agents}
              currentId={c.assignee?.id ?? null}
              meId={p.meId}
              onPick={p.onAssign}
              onClose={() => p.onMenu(null)}
            />
          )}
        </div>
        {/* Customer panel toggle: a panel icon, so it is never mistaken for the More-actions menu. */}
        <button
          type="button"
          aria-label="Open customer profile"
          aria-pressed={p.profileOpen}
          title="Customer profile (P)"
          onClick={p.onOpenProfile}
          className={cn(btn, 'w-9 px-0', p.profileOpen && 'bg-primary-soft text-primary-hover')}
        >
          <PanelRight size={17} />
        </button>
        <button
          type="button"
          aria-label="Close chat"
          title="Close chat (does not change the conversation)"
          onClick={p.onCloseChat}
          className={cn(btn, 'w-9 px-0')}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
