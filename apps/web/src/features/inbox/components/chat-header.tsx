'use client';

import {
  ChevronDown,
  ChevronLeft,
  Loader2,
  Clock,
  Flag,
  MailOpen,
  PanelRight,
  RotateCcw,
  UserPlus,
  X,
  CheckCircle2,
  AtSign,
  Mail,
  Phone,
} from 'lucide-react';
import { useRef } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { useShell } from '@/components/shell/shell-context';
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
  assigning: boolean;
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
  onShowProfile: () => void;
  onCloseChat: () => void;
}

const btn =
  'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-line bg-white px-2.5 text-[13px] font-medium text-ink hover:bg-wash disabled:cursor-not-allowed disabled:opacity-50';
const STATUS_BADGE = { OPEN: 'Open', SNOOZED: 'Snoozed', RESOLVED: 'Resolved' } as const;
const STATUS_TONE = {
  OPEN: 'bg-success-soft text-success',
  SNOOZED: 'bg-warning-soft text-warning',
  RESOLVED: 'bg-wash-2 text-muted',
} as const;
const Sep = () => <span aria-hidden className="h-3 w-px shrink-0 bg-line-input" />;

export function ChatHeader(p: Props) {
  const { c } = p;
  const { toast } = useShell();
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, p.menu === 'more', () => p.onMenu(null));
  const wait = c.waitingSince && c.status === 'OPEN' ? minutesSince(c.waitingSince) : null;
  // Phone first; Instagram/Messenger customers often only have a handle or email, so those stand in.
  const contact = c.customer.phone
    ? { value: c.customer.phone, icon: Phone, what: 'Phone number' }
    : c.customer.handle
      ? { value: c.customer.handle, icon: AtSign, what: 'Handle' }
      : c.customer.email
        ? { value: c.customer.email, icon: Mail, what: 'Email' }
        : null;
  const resolved = c.status === 'RESOLVED';

  return (
    // relative z-20: the blurred header is its own stacking context and the message log after it is positioned,
    // so without a z-index the log paints over the header's menus (Assign, Snooze, More).
    <header className="glass-header relative z-20 flex min-h-[76px] shrink-0 items-center gap-3.5 border-b border-line px-4 py-3">
      {p.showBack && (
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={p.onBack}
          className="-ml-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg hover:bg-wash"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      <div className="relative shrink-0">
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-wash-2 text-[15px] font-semibold text-muted ring-1 ring-inset ring-line-subtle max-sm:h-11 max-sm:w-11 max-sm:text-[13px]">
          {initialsOf(c.customer.name)}
        </span>
        <span className="absolute -bottom-1 -left-1">
          <ChannelBadge provider={c.channel.provider} size={18} />
        </span>
      </div>
      <div className="min-w-[120px] flex-1">
        <div className="flex items-center gap-2">
          <h2 className="m-0 min-w-0 truncate text-[20px] font-semibold leading-tight text-ink max-sm:text-[17px]">
            {/* Opens Quick Customer Details beside the chat: the conversation, scroll and draft stay put. */}
            <button
              type="button"
              onClick={p.onShowProfile}
              aria-expanded={p.profileOpen}
              title="Show customer details"
              className="max-w-full cursor-pointer truncate rounded-sm text-left decoration-line-input underline-offset-[3px] hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {c.customer.name}
            </button>
          </h2>
          {c.priority === 'HIGH' && (
            <span className="shrink-0 rounded-md bg-danger-soft px-1.5 py-px text-[11px] font-medium text-danger">
              Urgent
            </span>
          )}
        </div>
        {/* Channel, status, waiting time and contact. Items wrap as whole units, never mid-phrase. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <ChannelIcon channel={c.channel.provider} size={15} decorative />
            {CHANNELS[c.channel.provider].label}
          </span>
          <Sep />
          <span
            className={cn(
              'whitespace-nowrap rounded-full px-2 py-px text-[11.5px] font-medium',
              STATUS_TONE[c.status],
            )}
          >
            {STATUS_BADGE[c.status]}
            {c.status === 'SNOOZED' && c.snoozedUntil
              ? ` until ${snoozeLabel(c.snoozedUntil)}`
              : ''}
          </span>
          {wait != null && (
            <>
              <Sep />
              <span
                className={cn(
                  'whitespace-nowrap font-medium',
                  wait >= 120 ? 'text-danger' : wait >= 30 ? 'text-warning' : 'text-muted',
                )}
              >
                Waiting {fmtWait(wait)}
              </span>
            </>
          )}
        </div>
        {contact && (
          <div className="mt-1 max-sm:hidden">
            <button
              type="button"
              title={`Copy ${contact.what.toLowerCase()}`}
              aria-label={`Copy ${contact.what.toLowerCase()}: ${contact.value}`}
              onClick={() =>
                void navigator.clipboard?.writeText(contact.value).then(
                  () => toast(`${contact.what} copied`),
                  () => toast("Couldn't copy"),
                )
              }
              className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded border-none bg-transparent p-0 text-[13px] tabular-nums text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <contact.icon size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{contact.value}</span>
            </button>
          </div>
        )}
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
              className="absolute right-0 top-11 z-30 w-[min(210px,calc(100vw-24px))] animate-panel-in rounded-xl border border-line glass-menu p-1.5 shadow-popover"
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
            disabled={!p.canManage || p.assigning}
            aria-haspopup="menu"
            aria-expanded={p.menu === 'assign'}
            aria-busy={p.assigning}
            onClick={() => p.onMenu(p.menu === 'assign' ? null : 'assign')}
            title={c.assignee ? `Assigned to ${c.assignee.name} (A)` : 'Assign (A)'}
            aria-label={
              c.assignee ? `Assigned to ${c.assignee.name}. Change assignee` : 'Assign conversation'
            }
            className={btn}
          >
            {p.assigning ? (
              <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : c.assignee ? (
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
          <PanelRight size={18} />
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
