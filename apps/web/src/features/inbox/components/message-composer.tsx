'use client';

import { Send, Smile, Sparkles, StickyNote, X, Zap } from 'lucide-react';
import { forwardRef, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MAX_MESSAGE_LENGTH } from '@torio/contracts';
import { renderTemplate } from '../format';
import { useDismiss } from '../use-dismiss';
import type { SavedReply } from '../types';

const EMOJIS = [
  '😀',
  '😊',
  '😍',
  '🙏',
  '👍',
  '🎉',
  '❤️',
  '🔥',
  '😅',
  '🤝',
  '✅',
  '📦',
  '🚚',
  '💬',
  '😢',
  '🙌',
];

export type ComposerMode = 'reply' | 'note';

interface Props {
  customerName: string;
  channelLabel: string;
  mode: ComposerMode;
  draft: string;
  replyTo: { id: string; text: string; who: string } | null;
  savedReplies: SavedReply[];
  sending: boolean;
  canReply: boolean;
  aiOpen: boolean;
  onMode: (m: ComposerMode) => void;
  onDraft: (text: string) => void;
  onSend: () => void;
  onClearReplyTo: () => void;
  onToggleAi: () => void;
}

export const MessageComposer = forwardRef<HTMLTextAreaElement, Props>(
  function MessageComposer(p, ref) {
    const [menu, setMenu] = useState<'saved' | 'emoji' | null>(null);
    const [slashSel, setSlashSel] = useState(0);
    const wrap = useRef<HTMLDivElement>(null);
    useDismiss(wrap, menu !== null, () => setMenu(null));
    const isNote = p.mode === 'note';
    const empty = !p.draft.trim();
    const tooLong = p.draft.length > MAX_MESSAGE_LENGTH;

    const slashQuery =
      !isNote && p.draft.startsWith('/') && !/\s/.test(p.draft) ? p.draft.toLowerCase() : null;
    const slash = useMemo(
      () =>
        slashQuery == null
          ? []
          : p.savedReplies.filter(
              (r) =>
                r.shortcut.startsWith(slashQuery) ||
                r.title.toLowerCase().includes(slashQuery.slice(1)),
            ),
      [slashQuery, p.savedReplies],
    );
    const sel = slash.length ? slashSel % slash.length : 0;

    /** Saved replies only fill the draft; the agent still presses Send. */
    const insertReply = (r: SavedReply) => {
      p.onDraft(renderTemplate(r.body, { name: p.customerName }));
      setMenu(null);
      setSlashSel(0);
      (ref as React.RefObject<HTMLTextAreaElement>)?.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (slash.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashSel((s) => s + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashSel((s) => s - 1 + slash.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertReply(slash[sel]!);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          p.onDraft('');
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!empty && !tooLong && !p.sending && p.canReply) p.onSend();
      }
      if (e.key === 'Escape') e.currentTarget.blur();
    };

    const addEmoji = (emoji: string) => {
      p.onDraft(p.draft + emoji);
      setMenu(null);
    };

    const iconBtn =
      'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash-2 disabled:cursor-not-allowed disabled:opacity-40';

    return (
      <div ref={wrap} className="relative px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        {p.replyTo && (
          <div className="mb-1 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-primary-tint px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">
              <b>Replying to {p.replyTo.who}</b> ·{' '}
              <span className="text-muted">{p.replyTo.text}</span>
            </span>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={p.onClearReplyTo}
              className="cursor-pointer text-faint"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {slash.length > 0 && (
          <div
            role="listbox"
            aria-label="Saved replies"
            className="absolute inset-x-3 bottom-full z-20 mb-1 max-h-60 animate-panel-in overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-popover"
          >
            {slash.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={i === sel}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertReply(r);
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col gap-0.5 rounded-lg p-2 text-left',
                  i === sel ? 'bg-primary-soft' : 'hover:bg-wash',
                )}
              >
                <span className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-mono font-semibold text-primary-hover">{r.shortcut}</span>
                  <span>{r.title}</span>
                </span>
                <span className="line-clamp-1 text-xs text-muted">
                  {renderTemplate(r.body, { name: p.customerName })}
                </span>
              </button>
            ))}
          </div>
        )}

        {menu === 'saved' && (
          <div
            role="menu"
            aria-label="Saved replies"
            className="absolute bottom-full left-3 z-20 mb-1 max-h-64 w-[min(340px,calc(100%-24px))] animate-panel-in overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-popover"
          >
            {p.savedReplies.length === 0 && (
              <div className="p-3 text-[13px] text-muted">
                No saved replies yet. An admin can add them.
              </div>
            )}
            {p.savedReplies.map((r) => (
              <button
                key={r.id}
                role="menuitem"
                type="button"
                onClick={() => insertReply(r)}
                className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg p-2 text-left hover:bg-wash"
              >
                <span className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-mono font-semibold text-primary-hover">{r.shortcut}</span>
                  <span>{r.title}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted">
                  {renderTemplate(r.body, { name: p.customerName })}
                </span>
              </button>
            ))}
          </div>
        )}
        {menu === 'emoji' && (
          <div
            role="menu"
            aria-label="Emoji"
            className="absolute bottom-full right-3 z-20 mb-1 grid animate-panel-in grid-cols-8 gap-0.5 rounded-xl border border-line bg-white p-1.5 shadow-popover"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                role="menuitem"
                type="button"
                onClick={() => addEmoji(e)}
                className="h-8 w-8 cursor-pointer rounded-md text-lg hover:bg-wash"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            'rounded-2xl border shadow-[0_1px_2px_rgba(0,55,112,0.04)] backdrop-blur-[12px]',
            isNote
              ? 'border-[#F5D9A0] bg-[#FFFBEB]'
              : 'border-[rgba(229,231,235,0.95)] bg-white/95',
          )}
        >
          <div className="flex items-center gap-1 px-2 pt-2">
            <div
              role="tablist"
              aria-label="Composer mode"
              className="flex gap-0.5 rounded-lg bg-wash-2 p-0.5"
            >
              <button
                role="tab"
                aria-selected={!isNote}
                type="button"
                onClick={() => p.onMode('reply')}
                className={cn(
                  'h-[26px] cursor-pointer rounded-md px-2.5 text-xs font-medium',
                  !isNote
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                    : 'text-muted',
                )}
              >
                Reply
              </button>
              <button
                role="tab"
                aria-selected={isNote}
                type="button"
                onClick={() => p.onMode('note')}
                className={cn(
                  'flex h-[26px] cursor-pointer items-center gap-1 rounded-md px-2.5 text-xs font-medium',
                  isNote
                    ? 'bg-white text-warning shadow-[0_1px_2px_rgba(0,55,112,0.08)]'
                    : 'text-muted',
                )}
              >
                <StickyNote size={11} />
                Note
              </button>
            </div>
            {isNote && (
              <span className="ml-1 text-xs font-medium text-warning">
                Only your team can see this
              </span>
            )}
          </div>
          <textarea
            ref={ref}
            value={p.draft}
            rows={Math.min(6, Math.max(2, p.draft.split('\n').length))}
            aria-label={isNote ? 'Internal note' : `Reply to ${p.customerName}`}
            placeholder={
              isNote
                ? 'Write an internal note — only your team sees this'
                : `Reply to ${p.customerName.split(' ')[0]} on ${p.channelLabel} · type / for saved replies`
            }
            onChange={(e) => {
              p.onDraft(e.target.value);
              setSlashSel(0);
            }}
            onKeyDown={onKeyDown}
            className="block max-h-40 w-full resize-none border-none bg-transparent px-3.5 py-2 text-sm leading-[1.5] text-ink"
          />
          <div className="flex items-center gap-0.5 px-2 pb-2">
            <button
              type="button"
              aria-label="Insert emoji"
              aria-expanded={menu === 'emoji'}
              onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')}
              className={iconBtn}
            >
              <Smile size={16} />
            </button>
            <button
              type="button"
              aria-label="Saved replies"
              aria-expanded={menu === 'saved'}
              title="Saved replies (/)"
              onClick={() => setMenu(menu === 'saved' ? null : 'saved')}
              className={iconBtn}
            >
              <Zap size={16} />
            </button>
            {!isNote && (
              <button
                type="button"
                aria-pressed={p.aiOpen}
                onClick={p.onToggleAi}
                className={cn(
                  'ml-1 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium',
                  p.aiOpen ? 'bg-primary-soft text-primary-hover' : 'text-muted hover:bg-wash-2',
                )}
              >
                <Sparkles size={13} />
                AI Assist
              </button>
            )}
            <span className="flex-1" />
            {tooLong && (
              <span role="alert" className="mr-2 text-xs text-danger">
                {p.draft.length}/{MAX_MESSAGE_LENGTH}
              </span>
            )}
            <button
              type="button"
              onClick={p.onSend}
              disabled={empty || tooLong || p.sending || !p.canReply}
              title={p.canReply ? undefined : "You don't have permission to reply"}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D9DBE1]',
                isNote ? 'bg-[#D98A00]' : 'bg-primary hover:bg-primary-hover',
              )}
            >
              <Send size={14} />
              {isNote ? 'Add note' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
