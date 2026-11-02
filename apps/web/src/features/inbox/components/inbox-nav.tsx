'use client';

import { CheckCircle2, Clock, Inbox, Layers, Mail, MessageCircle, User, UserX } from 'lucide-react';
import { ChannelIcon } from '@/components/channel-icon';
import { cn } from '@/lib/utils';
import { CHANNELS } from '../constants';
import type { ConversationStatus, InboxFilters, ListView, Provider } from '../types';

interface Props {
  filters: InboxFilters;
  counts: { open: number; snoozed: number; resolved: number } | undefined;
  onChange: (patch: Partial<InboxFilters>) => void;
}

const VIEW_ITEMS: { key: ListView; label: string; icon: typeof Inbox }[] = [
  { key: 'all', label: 'All messages', icon: Inbox },
  { key: 'unread', label: 'Unread', icon: Mail },
  { key: 'mine', label: 'Assigned to me', icon: User },
  { key: 'unassigned', label: 'Unassigned', icon: UserX },
];

const STATUS_ITEMS: {
  key: ConversationStatus;
  label: string;
  icon: typeof Inbox;
  count: 'open' | 'snoozed' | 'resolved';
}[] = [
  { key: 'OPEN', label: 'Open', icon: MessageCircle, count: 'open' },
  { key: 'SNOOZED', label: 'Snoozed', icon: Clock, count: 'snoozed' },
  { key: 'RESOLVED', label: 'Resolved', icon: CheckCircle2, count: 'resolved' },
];

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-px">
      <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function Item({
  on,
  label,
  icon,
  count,
  onClick,
}: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-left text-[13.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        on
          ? 'bg-primary-soft font-semibold text-primary-hover'
          : 'font-medium text-ink-secondary hover:bg-wash',
      )}
    >
      <span className={cn('flex w-4 shrink-0 justify-center', on ? 'text-primary' : 'text-faint')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className={cn('text-xs tabular-nums', on ? 'text-primary-hover' : 'text-faint')}>
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Inbox navigation column (wide screens only). It drives the same filter state as the list's tabs and
 * chips, which the list hides while this column is visible, so nothing appears twice.
 */
export function InboxNav({ filters, counts, onChange }: Props) {
  return (
    <nav
      aria-label="Inbox navigation"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-white px-2 pb-4 pt-2"
    >
      <Group label="Conversations">
        {VIEW_ITEMS.map((v) => (
          <Item
            key={v.key}
            on={filters.view === v.key}
            label={v.label}
            icon={<v.icon size={16} aria-hidden />}
            onClick={() => onChange({ view: v.key })}
          />
        ))}
      </Group>
      <Group label="Status">
        {STATUS_ITEMS.map((s) => (
          <Item
            key={s.key}
            on={filters.status === s.key}
            label={s.label}
            icon={<s.icon size={16} aria-hidden />}
            count={counts?.[s.count]}
            onClick={() => onChange({ status: s.key })}
          />
        ))}
      </Group>
      <Group label="Channels">
        <Item
          on={!filters.channel}
          label="All channels"
          icon={<Layers size={16} aria-hidden />}
          onClick={() => onChange({ channel: '' })}
        />
        {(Object.keys(CHANNELS) as Provider[]).map((ch) => (
          <Item
            key={ch}
            on={filters.channel === ch}
            label={CHANNELS[ch].label}
            icon={<ChannelIcon channel={ch} size={16} decorative />}
            onClick={() => onChange({ channel: ch })}
          />
        ))}
      </Group>
    </nav>
  );
}
