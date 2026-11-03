'use client';

import { Check, ChevronDown, Layers } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ChannelIcon } from '@/components/channel-icon';
import { useShell } from '@/components/shell/shell-context';
import { useChannels } from '@/features/channels/queries';
import { EMPTY_CHANNEL_FILTERS, type Channel } from '@/features/channels/types';
import { useDismiss } from '@/features/inbox/use-dismiss';
import { useKeepInView } from '@/features/inbox/use-keep-in-view';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import type { DashboardChannel } from '../use-dashboard-range';

const OPTIONS: { key: DashboardChannel | undefined; label: string }[] = [
  { key: undefined, label: 'All channels' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'INSTAGRAM', label: 'Instagram' },
  { key: 'MESSENGER', label: 'Messenger' },
];

/** Connection state of a provider across the workspace's channels; null while unknown. */
function statusOf(channels: Channel[] | undefined, provider: DashboardChannel) {
  if (!channels) return null;
  const mine = channels.filter((c) => c.provider === provider);
  if (!mine.length) return { label: 'Not connected', tone: 'muted' as const };
  if (mine.some((c) => c.status === 'CONNECTED'))
    return { label: 'Connected', tone: 'ok' as const };
  return { label: 'Needs attention', tone: 'warn' as const };
}

interface Props {
  value: DashboardChannel | undefined;
  onChange: (v: DashboardChannel | undefined) => void;
  className?: string;
}

/**
 * Dashboard channel filter: a listbox popover with each channel's real connection state. Every channel stays
 * selectable, because a channel that is disconnected today can still have conversations in the chosen range.
 */
export function ChannelSelect({ value, onChange, className }: Props) {
  const { registerEscape } = useShell();
  const { workspaceId: ws, can } = useWorkspace();
  const channels = useChannels(can('channels:read') ? ws : null, EMPTY_CHANNEL_FILTERS);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(wrap, open, () => setOpen(false));
  useKeepInView(list);
  useEffect(() => (open ? registerEscape(() => close()) : undefined), [open, registerEscape]);

  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0]!;
  const options = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];

  function close() {
    setOpen(false);
    btn.current?.focus();
  }
  // Opening moves focus to the selected option, as a native select does.
  useEffect(() => {
    if (open)
      options()
        .find((o) => o.getAttribute('aria-selected') === 'true')
        ?.focus();
  }, [open]);

  const pick = (key: DashboardChannel | undefined) => {
    onChange(key);
    close();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const items = options();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <button
        ref={btn}
        type="button"
        aria-label={`Channel: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white pl-3 pr-2.5 text-[13px] transition-colors duration-150 hover:border-line-input hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
          open && 'border-primary bg-primary-soft hover:border-primary hover:bg-primary-soft',
        )}
      >
        {value ? (
          <ChannelIcon channel={value} size={16} decorative />
        ) : (
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
        <span className="min-w-0 flex-1 truncate text-left font-semibold text-ink">
          {current.label}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden
          className={cn(
            'shrink-0 text-faint transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label="Channel"
          onKeyDown={onListKey}
          className="absolute left-0 top-[52px] z-[45] w-[min(264px,calc(100vw-32px))] animate-panel-in rounded-[14px] border border-line bg-white p-1.5 shadow-popover"
        >
          {OPTIONS.map((o) => {
            const on = o.key === value;
            const st = o.key ? statusOf(channels.data, o.key) : null;
            return (
              <button
                key={o.label}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(o.key)}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  on ? 'bg-primary-soft' : 'hover:bg-wash focus-visible:bg-wash',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-wash-2">
                  {o.key ? (
                    <ChannelIcon channel={o.key} size={18} decorative />
                  ) : (
                    <Layers size={16} aria-hidden className="text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[13.5px]',
                      on ? 'font-semibold text-primary-hover' : 'font-medium text-ink',
                    )}
                  >
                    {o.label}
                  </span>
                  {o.key && (st || channels.isPending) && (
                    <span
                      className={cn(
                        'block text-xs',
                        st?.tone === 'ok'
                          ? 'text-success'
                          : st?.tone === 'warn'
                            ? 'text-warning'
                            : 'text-faint',
                      )}
                    >
                      {st ? st.label : 'Checking…'}
                    </span>
                  )}
                </span>
                {on && <Check size={16} strokeWidth={2.25} aria-hidden className="text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
