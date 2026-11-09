'use client';

import { Layers } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { cn } from '@/lib/utils';
import { CHANNELS } from '../constants';
import { badgeCount } from '../format';
import type { ConversationStatus, Provider } from '../types';

const TABS: { key: '' | Provider; label: string }[] = [
  { key: '', label: 'All messages' },
  { key: 'MESSENGER', label: CHANNELS.MESSENGER.label },
  { key: 'INSTAGRAM', label: CHANNELS.INSTAGRAM.label },
  { key: 'WHATSAPP', label: CHANNELS.WHATSAPP.label },
];

interface Props {
  value: '' | Provider;
  /** Conversations per channel in the current status, from the list API; undefined while loading. */
  counts: Record<'all' | Provider, number> | undefined;
  /** The status the counts are for, so the badge can say what it counts. */
  status: ConversationStatus;
  onChange: (channel: '' | Provider) => void;
}

/**
 * Channel switcher under the Inbox heading. The only channel control in the Inbox: it combines with the status,
 * view, search and advanced filters rather than resetting them. When the list is too narrow for all four tabs the
 * row scrolls sideways and keeps the selected tab in view. Each tab carries its conversation count for the
 * selected status (e.g. open conversations); zero shows no badge and anything above 99 shows "99+".
 */
export function ChannelTabs({ value, counts, status, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const word = status.toLowerCase();
  // Keep the selected tab fully visible; badges arriving later change the tab widths, so re-check then too.
  useEffect(() => {
    const list = ref.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft - list.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left - 8;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + 8;
  }, [value, counts]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tabs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowLeft'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (to === null || i < 0) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length]!;
    next.focus();
    next.click();
  };

  return (
    <div className="border-b border-line-subtle">
      <div
        ref={ref}
        role="tablist"
        aria-label="Channels"
        onKeyDown={onKeyDown}
        className="flex items-stretch gap-1 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const on = value === t.key;
          const n = counts?.[t.key || 'all'] ?? 0;
          const badge = badgeCount(n);
          const name = n ? `${t.label}, ${n} ${word} conversation${n === 1 ? '' : 's'}` : t.label;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              aria-label={name}
              title={name}
              onClick={() => onChange(t.key)}
              className={cn(
                'group relative flex h-11 shrink-0 cursor-pointer items-center gap-2 px-2.5 text-[13.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                on ? 'font-semibold text-primary-hover' : 'font-medium text-muted hover:text-ink',
              )}
            >
              <span
                className={cn(
                  'flex shrink-0 transition-opacity duration-150 motion-reduce:transition-none',
                  !on && t.key && 'opacity-80 group-hover:opacity-100',
                )}
              >
                {t.key ? (
                  <ChannelIcon channel={t.key} size={16} decorative />
                ) : (
                  <Layers size={16} aria-hidden className={on ? 'text-primary' : 'text-faint'} />
                )}
              </span>
              <span className="whitespace-nowrap">{t.label}</span>
              {badge && (
                // Keyed by its text so a change replays the pop-in; same red in active and inactive tabs.
                <span
                  key={badge}
                  aria-hidden
                  className="flex h-[22px] min-w-[22px] shrink-0 animate-badge-in items-center justify-center rounded-full bg-[#DC2626] px-[7px] text-[12px] font-bold leading-none tabular-nums text-white shadow-[0_1px_2px_rgba(220,38,38,0.25),0_2px_6px_rgba(220,38,38,0.18)] motion-reduce:animate-none"
                >
                  {badge}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-[background-color,transform] duration-200 motion-reduce:transition-none',
                  on
                    ? 'scale-x-100 bg-primary'
                    : 'scale-x-50 bg-transparent group-hover:scale-x-100 group-hover:bg-line',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
