'use client';

import { memo } from 'react';
import { Check, Flag, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  badgeCount,
  fmtAgo,
  fmtWait,
  initialsOf,
  minutesSince,
  snoozeLabel,
  waitTone,
} from '../format';
import type { Conversation } from '../types';
import { ChannelBadge } from './channel-badge';

const PILL =
  'inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs leading-none';

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
  const unreadText = badgeCount(c.unreadCount);
  // Manage mode tints checked rows; otherwise the open conversation is tinted.
  const highlighted = selectionMode ? checked : active;
  // In Manage mode a click or Enter/Space toggles selection and never opens the conversation.
  const act = () => (selectionMode ? onToggle(c.id) : onOpen(c.id));

  return (
    <div
      role="option"
      aria-selected={selectionMode ? checked : active}
      tabIndex={0}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          act();
        }
      }}
      data-conversation-id={c.id}
      className={cn(
        'relative flex cursor-pointer gap-3 border-b border-line-subtle px-4 py-3.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        highlighted ? 'bg-primary-soft' : 'bg-white hover:bg-wash',
      )}
    >
      {highlighted && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary" />
      )}
      {selectionMode && (
        <span className="flex h-11 shrink-0 items-center">
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`Select conversation with ${c.customer.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(c.id);
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center"
          >
            <span
              className={cn(
                'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-150 motion-reduce:transition-none',
                checked ? 'border-primary bg-primary' : 'border-[#C9CBD3] bg-white',
              )}
            >
              {checked && <Check size={12} strokeWidth={3.4} className="text-white" />}
            </span>
          </button>
        </span>
      )}
      <div className="relative h-11 w-11 shrink-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-wash-2 text-[13px] font-semibold text-muted ring-1 ring-inset ring-line-subtle">
          {initialsOf(c.customer.name)}
        </span>
        <span className="absolute -bottom-0.5 -left-0.5">
          <ChannelBadge provider={c.channel.provider} />
        </span>
      </div>

      {/* Three lines; each line's right end carries one piece of metadata, so nothing overlaps. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          {unread && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
          {c.priority === 'HIGH' && (
            <Flag
              size={13}
              strokeWidth={2.25}
              role="img"
              aria-label="Urgent"
              className="shrink-0 fill-[#E5484D] text-[#E5484D]"
            >
              <title>Urgent</title>
            </Flag>
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] leading-5',
              unread ? 'font-semibold text-ink' : 'font-medium text-ink-secondary',
              active && !selectionMode && 'text-primary-hover',
            )}
          >
            {c.customer.name}
          </span>
          <span
            className={cn(
              'shrink-0 text-xs tabular-nums',
              unread ? 'font-medium text-primary' : 'text-faint',
            )}
          >
            {fmtAgo(c.lastMessageAt, now)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[14px] leading-5',
              unread ? 'text-ink' : 'text-muted',
            )}
          >
            {c.lastMessagePreview || 'No messages yet'}
          </span>
          {unreadText && (
            <span
              aria-label={`${c.unreadCount} unread`}
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none tabular-nums text-white"
            >
              {unreadText}
            </span>
          )}
        </div>
        <div className="mt-1 flex min-h-5 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {wait != null && tone && (
              <span className={cn(PILL, 'font-medium', TONE[tone])}>
                {/* A narrow list drops the "Over 2h" prefix; the red tone still marks it overdue. */}
                {tone === 'danger' && (
                  <span className="hidden @min-[380px]:inline">Over 2h ·&nbsp;</span>
                )}
                Waiting {fmtWait(wait)}
              </span>
            )}
            {c.status === 'SNOOZED' && c.snoozedUntil && (
              <span className={cn(PILL, 'bg-[#EFF6FF] font-medium text-[#2563EB]')}>
                Until {snoozeLabel(c.snoozedUntil)}
              </span>
            )}
            {c.customer.isSample && (
              <span className={cn(PILL, 'bg-wash-2 text-muted')}>Sample</span>
            )}
          </div>
          {c.assignee ? (
            <span
              title={`Assigned to ${c.assignee.name}`}
              aria-label={`Assigned to ${c.assignee.name}`}
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#E6E6FA] text-[9.5px] font-semibold text-primary-hover"
            >
              {initialsOf(c.assignee.name)}
            </span>
          ) : (
            c.status === 'OPEN' && (
              <span title="Unassigned" className="flex shrink-0 items-center text-xs text-faint">
                <UserX size={15} aria-label="Unassigned" className="@min-[380px]:hidden" />
                <span className="hidden @min-[380px]:inline">Unassigned</span>
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export const ConversationRow = memo(Row);
