'use client';

import { DollarSign, MessageSquareText, Search, Send, Smile, StickyNote, X } from 'lucide-react';
import { forwardRef, useMemo, useRef, useState, type Ref } from 'react';
import { AIButton } from '@/components/ui/ai';
import { cn } from '@/lib/utils';
import { MAX_MESSAGE_LENGTH } from '@torio/contracts';
import { renderTemplate } from '../format';
import { useDismiss } from '../use-dismiss';
import type { SavedReply } from '../types';

type ToolActionProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  /** Visible on hover/keyboard focus (and while active); always the accessible name. */
  label: string;
  active?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Composer toolbar action: icon only at rest, sliding its label out on hover or keyboard focus. Touch screens
 * (no hover) keep the compact icon and rely on the accessible name. Only the later buttons in the row move.
 */
function ToolAction({ icon, label, active, className, ref, ...rest }: ToolActionProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'group/act flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-2 text-[12.5px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none',
        active ? 'bg-primary-soft text-primary-hover' : 'text-muted hover:bg-wash-2 hover:text-ink',
        className,
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span
        aria-hidden
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
          active
            ? 'ml-1.5 max-w-[120px] opacity-100'
            : 'ml-0 max-w-0 opacity-0 group-hover/act:ml-1.5 group-hover/act:max-w-[120px] group-hover/act:opacity-100 group-focus-visible/act:ml-1.5 group-focus-visible/act:max-w-[120px] group-focus-visible/act:opacity-100',
        )}
      >
        {label}
      </span>
    </button>
  );
}

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
  /** Opens Create Order for this conversation; absent when the agent can't create orders. */
  onCreateOrder?: () => void;
}

export const MessageComposer = forwardRef<HTMLTextAreaElement, Props>(
  function MessageComposer(p, ref) {
    const [menu, setMenu] = useState<'saved' | 'emoji' | null>(null);
    const [slashSel, setSlashSel] = useState(0);
    const [replyQuery, setReplyQuery] = useState('');
    const savedBtn = useRef<HTMLButtonElement>(null);
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

    const textarea = () => (ref as React.RefObject<HTMLTextAreaElement | null>)?.current ?? null;

    /**
     * Saved replies only fill the draft; the agent still presses Send. A slash command is replaced by
     * the reply; from the picker the reply goes in at the cursor, keeping the rest of the draft.
     */
    const insertReply = (r: SavedReply, at: 'replace' | 'cursor') => {
      const text = renderTemplate(r.body, { name: p.customerName });
      const el = textarea();
      let next = text;
      let caret = text.length;
      if (at === 'cursor' && p.draft) {
        const start = el?.selectionStart ?? p.draft.length;
        const end = el?.selectionEnd ?? p.draft.length;
        const before = p.draft.slice(0, start);
        const after = p.draft.slice(end);
        const lead = before && !/\s$/.test(before) ? ' ' : '';
        const trail = after && !/^\s/.test(after) ? ' ' : '';
        next = before + lead + text + trail + after;
        caret = (before + lead + text).length;
      }
      p.onDraft(next);
      setMenu(null);
      setSlashSel(0);
      setReplyQuery('');
      requestAnimationFrame(() => {
        const t = textarea();
        t?.focus();
        t?.setSelectionRange(caret, caret);
      });
    };

    const q = replyQuery.trim().toLowerCase();
    const pickable = q
      ? p.savedReplies.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.shortcut.toLowerCase().includes(q) ||
            r.body.toLowerCase().includes(q),
        )
      : p.savedReplies;
    const closeSaved = () => {
      setMenu(null);
      setReplyQuery('');
      savedBtn.current?.focus();
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
          insertReply(slash[sel]!, 'replace');
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
            className="absolute inset-x-3 bottom-full z-20 mb-1 max-h-60 animate-panel-in overflow-y-auto rounded-xl border border-line glass-menu p-1.5 shadow-popover"
          >
            {slash.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={i === sel}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertReply(r, 'replace');
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
            role="dialog"
            aria-label="Saved replies"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                closeSaved();
              }
            }}
            className="absolute bottom-full left-3 z-20 mb-1 flex max-h-[min(360px,calc(100vh-200px))] w-[min(360px,calc(100%-24px))] animate-panel-in flex-col rounded-xl border border-line glass-menu shadow-popover"
          >
            <label className="m-1.5 flex h-8 items-center gap-2 rounded-[var(--radius-input)] border border-line px-2 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
              <Search size={14} className="shrink-0 text-faint" aria-hidden />
              <input
                autoFocus
                type="search"
                aria-label="Search saved replies"
                placeholder="Search saved replies"
                value={replyQuery}
                onChange={(e) => setReplyQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pickable[0]) {
                    e.preventDefault();
                    insertReply(pickable[0], 'cursor');
                  }
                }}
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink"
              />
            </label>
            <div role="list" className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
              {p.savedReplies.length === 0 ? (
                <p className="m-0 p-3 text-[13px] text-muted">
                  No saved replies in this workspace yet.
                </p>
              ) : pickable.length === 0 ? (
                <p className="m-0 p-3 text-[13px] text-muted">
                  No saved replies match &ldquo;{replyQuery.trim()}&rdquo;.
                </p>
              ) : (
                pickable.map((r) => (
                  <button
                    key={r.id}
                    role="listitem"
                    type="button"
                    onClick={() => insertReply(r, 'cursor')}
                    className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg p-2 text-left hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="flex items-baseline gap-2 text-[13px]">
                      <span className="font-semibold text-ink">{r.title}</span>
                      <span className="font-mono text-xs text-faint">{r.shortcut}</span>
                    </span>
                    <span className="line-clamp-2 text-xs text-muted">
                      {renderTemplate(r.body, { name: p.customerName })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        {menu === 'emoji' && (
          <div
            role="menu"
            aria-label="Emoji"
            className="absolute bottom-full right-3 z-20 mb-1 grid animate-panel-in grid-cols-8 gap-0.5 rounded-xl border border-line glass-menu p-1.5 shadow-popover"
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
                : `Reply to ${p.customerName.split(' ')[0]} on ${p.channelLabel}… (type / for saved replies)`
            }
            onChange={(e) => {
              p.onDraft(e.target.value);
              setSlashSel(0);
            }}
            onKeyDown={onKeyDown}
            className="block max-h-40 w-full resize-none border-none bg-transparent px-3.5 py-2 text-sm leading-[1.5] text-ink"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            {p.onCreateOrder && (
              <ToolAction
                icon={<DollarSign size={16} />}
                label="Create order"
                aria-haspopup="dialog"
                onClick={() => {
                  setMenu(null);
                  p.onCreateOrder?.();
                }}
              />
            )}
            <ToolAction
              ref={savedBtn}
              icon={<MessageSquareText size={16} />}
              label="Saved replies"
              title="Saved replies (or type /)"
              aria-haspopup="dialog"
              aria-expanded={menu === 'saved'}
              active={menu === 'saved'}
              onClick={() => (menu === 'saved' ? closeSaved() : setMenu('saved'))}
            />
            <ToolAction
              icon={<Smile size={16} />}
              label="Emoji"
              aria-label="Insert emoji"
              aria-expanded={menu === 'emoji'}
              active={menu === 'emoji'}
              onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')}
            />
            {!isNote && (
              <AIButton
                size="sm"
                aria-label="AI Assist"
                title="AI Assist"
                aria-pressed={p.aiOpen}
                hideLabelOnSmall
                onClick={p.onToggleAi}
              >
                AI Assist
              </AIButton>
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
