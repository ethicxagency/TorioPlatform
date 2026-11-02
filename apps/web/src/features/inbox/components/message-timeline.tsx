'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { dayLabel } from '../format';
import type { Message } from '../types';
import { MessageBubble } from './message-bubble';

interface Props {
  conversationId: string;
  messages: Message[] | undefined;
  loading: boolean;
  error?: string;
  customerName: string;
  onRetry: () => void;
  onReply: (m: Message) => void;
  onCopy: (m: Message) => void;
  onRetrySend?: (m: Message) => void;
}

const NEAR_BOTTOM = 80;

export function MessageTimeline({
  conversationId,
  messages,
  loading,
  error,
  customerName,
  onRetry,
  onReply,
  onCopy,
  onRetrySend,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastCount = useRef(0);
  const lastConv = useRef<string | null>(null);
  const [hasNew, setHasNew] = useState(false);

  const scrollDown = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
  }, []);
  const toBottom = useCallback(() => {
    scrollDown();
    setHasNew(false);
  }, [scrollDown]);

  // New conversation: jump to newest. Same conversation: follow only if the reader is already at the bottom.
  useLayoutEffect(() => {
    const count = messages?.length ?? 0;
    if (lastConv.current !== conversationId) {
      lastConv.current = conversationId;
      lastCount.current = count;
      if (count) scrollDown();
      return;
    }
    if (count > lastCount.current) {
      if (atBottom.current) scrollDown();
      else requestAnimationFrame(() => setHasNew(true));
    }
    lastCount.current = count;
  }, [messages, conversationId, scrollDown]);

  useEffect(() => {
    atBottom.current = true;
  }, [conversationId]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (atBottom.current) setHasNew(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${customerName}`}
        className="h-full overflow-y-auto overflow-x-hidden pb-3 pt-2"
      >
        {loading && !messages && (
          <div className="flex flex-col gap-3 px-4 pt-4" aria-label="Loading messages">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="ml-auto h-10 w-2/5 bg-primary-soft" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        )}
        {error && !messages && (
          <div role="alert" className="px-6 py-12 text-center">
            <div className="text-sm font-semibold">Couldn&apos;t load messages</div>
            <div className="mb-3 mt-1 text-[13px] text-muted">{error}</div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {messages && messages.length === 0 && (
          <div className="px-6 py-12 text-center text-[13px] text-muted">
            No messages in this conversation yet.
          </div>
        )}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
          const sameGroup = (a?: Message) =>
            !!a && a.kind === m.kind && dayLabel(a.createdAt) === dayLabel(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-0.5 text-[11.5px] font-medium text-faint shadow-[0_0_0_1px_rgba(229,231,235,0.9)]">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                m={m}
                groupStart={!sameGroup(prev)}
                groupEnd={!sameGroup(next)}
                customerName={customerName}
                onReply={onReply}
                onCopy={onCopy}
                onRetry={onRetrySend}
              />
            </div>
          );
        })}
      </div>
      {hasNew && (
        <button
          type="button"
          onClick={toBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-popover"
        >
          <ArrowDown size={13} /> New messages
        </button>
      )}
    </div>
  );
}
