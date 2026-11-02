'use client';

import {
  Check,
  CheckCheck,
  Clock,
  Copy,
  CornerUpLeft,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { fmtTime } from '../format';
import type { Message } from '../types';

function DeliveryMark({ status }: { status: Message['deliveryStatus'] }) {
  switch (status) {
    case 'READ':
      return (
        <span title="Read" className="inline-flex text-[#C9CAFF]">
          <CheckCheck size={13} aria-label="Read" />
        </span>
      );
    case 'DELIVERED':
      return (
        <span title="Delivered" className="inline-flex text-white/70">
          <CheckCheck size={13} aria-label="Delivered" />
        </span>
      );
    case 'SENT':
      return (
        <span title="Sent" className="inline-flex text-white/70">
          <Check size={13} aria-label="Sent" />
        </span>
      );
    case 'FAILED':
      return (
        <span title="Failed to send" className="inline-flex text-[#FFB4B4]">
          <TriangleAlert size={13} aria-label="Failed to send" />
        </span>
      );
    // Honest default: delivery through the channel provider is not implemented yet.
    default:
      return (
        <span
          title="Saved in Torio. Not yet sent to the channel."
          className="inline-flex text-white/70"
        >
          <Clock size={12} aria-label="Queued, not yet sent to the channel" />
        </span>
      );
  }
}

interface Props {
  m: Message;
  groupStart: boolean;
  groupEnd: boolean;
  customerName: string;
  onReply: (m: Message) => void;
  onCopy: (m: Message) => void;
  /** Offered on failed outgoing messages only. */
  onRetry?: (m: Message) => void;
}

function Bubble({ m, groupStart, groupEnd, customerName, onReply, onCopy, onRetry }: Props) {
  if (m.kind === 'EVENT') {
    return (
      <div className="my-2 flex items-center justify-center gap-2 px-4 text-xs text-faint">
        <span className="h-px flex-1 bg-line-subtle" />
        <span className="max-w-[80%] truncate" title={m.body}>
          {m.body}
        </span>
        <span className="shrink-0">· {fmtTime(m.createdAt)}</span>
        <span className="h-px flex-1 bg-line-subtle" />
      </div>
    );
  }

  if (m.kind === 'NOTE') {
    return (
      <div className="my-2 flex justify-end px-4">
        <div className="max-w-[78%] min-w-0 rounded-xl border border-[#F5D9A0] border-dashed bg-[#FFFBEB] px-3 py-2 text-[13.5px] text-[#5C3B00]">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warning">
            <StickyNote size={12} /> Internal note · only your team sees this
          </div>
          <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
          <div className="mt-1 text-[11px] text-[#A68A52]">
            {m.author?.name ?? 'Team'} · {fmtTime(m.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  const out = m.kind === 'OUTBOUND';
  return (
    <div
      className={cn(
        'group flex items-end gap-1 px-4',
        out ? 'flex-row-reverse' : 'flex-row',
        groupStart ? 'mt-3.5' : 'mt-[3px]',
      )}
    >
      <div
        className={cn(
          'min-w-0 max-w-[78%] border px-3 py-2 text-[14px] leading-[1.45]',
          out ? 'border-primary bg-primary text-white' : 'border-[#E9EAEE] bg-white text-ink',
          out
            ? groupEnd
              ? 'rounded-[14px_14px_4px_14px]'
              : 'rounded-[14px]'
            : groupEnd
              ? 'rounded-[14px_14px_14px_4px]'
              : 'rounded-[14px]',
        )}
      >
        {m.replyTo && (
          <div
            className={cn(
              'mb-1.5 truncate rounded-md border-l-2 px-2 py-1 text-xs',
              out
                ? 'border-white/60 bg-white/15 text-white/90'
                : 'border-primary bg-primary-tint text-muted',
            )}
          >
            {m.replyTo.body}
          </div>
        )}
        {/* Plain text only: message bodies are never rendered as HTML. */}
        <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
        {out && m.deliveryStatus === 'FAILED' && m.failureReason && (
          <p role="alert" className="m-0 mt-1 text-xs text-[#FFD0D0] [overflow-wrap:anywhere]">
            Not delivered: {m.failureReason}
          </p>
        )}
        {out && m.deliveryStatus === 'FAILED' && onRetry && (
          <button
            type="button"
            onClick={() => onRetry(m)}
            className="mt-1.5 cursor-pointer rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-white/30"
          >
            Retry sending
          </button>
        )}
        {groupEnd && (
          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[11px]',
              out ? 'text-white/70' : 'text-faint',
            )}
          >
            {fmtTime(m.createdAt)}
            {out && <DeliveryMark status={m.deliveryStatus} />}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <button
          type="button"
          title="Reply"
          aria-label={`Reply to message from ${out ? 'you' : customerName}`}
          onClick={() => onReply(m)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash-2 hover:text-ink"
        >
          <CornerUpLeft size={14} />
        </button>
        <button
          type="button"
          title="Copy"
          aria-label="Copy message text"
          onClick={() => onCopy(m)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-wash-2 hover:text-ink"
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

export const MessageBubble = memo(Bubble);
