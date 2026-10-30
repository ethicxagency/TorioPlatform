'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtAgo, fmtWait, initialsOf, minutesSince, snoozeLabel, waitTone } from '../format';
import type { Conversation } from '../types';
import { ChannelBadge } from './channel-badge';

const TONE = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-[#F3F4F6] text-muted',
} as const;

interface Props {
  c: Conversation;
  active: boolean;
  checked: boolean;
  selectionMode: boolean;
  now: number;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}

function Row({ c, active, checked, selectionMode, now, onOpen, onToggle }: Props) {
  const wait = c.waitingSince && c.status === 'OPEN' ? minutesSince(c.waitingSince, now) : null;
  const tone = wait != null ? waitTone(wait) : null;
  const unread = c.unreadCount > 0;
  const showCheck = selectionMode || checked;

  return (
    <div
      role="option"
      aria-selected={active}
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(c.id);
        }
      }}
      data-conversation-id={c.id}
      className={cn(
        'group flex min-h-[76px] cursor-pointer gap-3 border-b border-line-subtle border-l-[3px] py-3 pl-[11px] pr-3.5 transition-colors',
        checked ? 'bg-primary-soft' : active ? 'bg-[#F1F1FF]' : 'hover:bg-[#F7F7F9]',
        active ? 'border-l-primary' : 'border-l-transparent',
      )}
    >
      <div className="relative h-10 w-10 shrink-0">
        {/* Checkbox replaces the avatar on hover/focus or in selection mode; it never captures row opens. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Select conversation with ${c.customer.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(c.id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute inset-0 z-[1] flex cursor-pointer items-center justify-center',
            showCheck ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
          )}
        >
          <span
            className={cn(
              'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px]',
              checked ? 'border-primary bg-primary' : 'border-[#C9CBD3] bg-white',
            )}
          >
            {checked && <Check size={12} strokeWidth={3.4} className="text-white" />}
          </span>
        </button>
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full bg-line-subtle text-[12.5px] font-semibold text-muted',
            !showCheck && 'group-hover:opacity-0',
          )}
        >
          {initialsOf(c.customer.name)}
        </span>
        <span className="absolute -bottom-0.5 -left-0.5">
          <ChannelBadge provider={c.channel.provider} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {c.priority === 'HIGH' && (
            <span
              title="Urgent"
              aria-label="Urgent"
              role="img"
              className="h-[7px] w-[7px] shrink-0 rounded-sm bg-[#E5484D]"
            />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {c.customer.name}
          </span>
          <span className="shrink-0 text-xs text-faint">{fmtAgo(c.lastMessageAt, now)}</span>
        </div>
        <div className="mt-[3px] flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px]',
              unread ? 'text-ink' : 'text-muted',
            )}
          >
            {c.lastMessagePreview || 'No messages yet'}
          </span>
          {unread && (
            <span
              aria-label={`${c.unreadCount} unread`}
              className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[9px] bg-primary px-[5px] text-[11px] font-semibold text-white"
            >
              {c.unreadCount}
            </span>
          )}
        </div>
        <div className="mt-[7px] flex flex-wrap items-center gap-1.5">
          {wait != null && tone && (
            <span className={cn('rounded-md px-[7px] py-0.5 text-[11px] font-medium', TONE[tone])}>
              {tone === 'danger' ? 'Over 2h · ' : ''}Waiting {fmtWait(wait)}
            </span>
          )}
          {c.status === 'SNOOZED' && c.snoozedUntil && (
            <span className="rounded-md bg-[#EFF6FF] px-[7px] py-0.5 text-[11px] font-medium text-[#2563EB]">
              Until {snoozeLabel(c.snoozedUntil)}
            </span>
          )}
          {c.customer.isSample && (
            <span className="rounded-md bg-wash-2 px-[7px] py-0.5 text-[11px] text-faint">
              Sample
            </span>
          )}
          <span className="flex-1" />
          {c.assignee ? (
            <span
              title={c.assignee.name}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E6E6FA] text-[9px] font-semibold text-primary-hover"
            >
              {initialsOf(c.assignee.name)}
            </span>
          ) : (
            c.status === 'OPEN' && <span className="text-[11px] text-faint">Unassigned</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const ConversationRow = memo(Row);
