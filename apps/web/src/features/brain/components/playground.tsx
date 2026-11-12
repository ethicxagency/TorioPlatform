'use client';

import { previewReply, type BrainConfig, type PreviewResult } from '@torio/contracts';
import { ChevronDown, Send, Trash2, TriangleAlert } from 'lucide-react';
import { AIIcon, AIProcessingIndicator } from '@/components/ui/ai';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Pill } from './bits';

const SUGGEST = [
  'Can I order wholesale?',
  'Do you offer COD?',
  'Can I get a discount?',
  'What is your warranty policy?',
  'Do you deliver to my area?',
  'Delivery charge koto?',
  'Is this product available in black?',
];

type Msg =
  | { role: 'customer'; text: string }
  | { role: 'ai'; r: PreviewResult; unsaved: boolean; open: boolean };
export interface PlaygroundHandle {
  ask: (q: string) => void;
  focus: () => void;
}

/**
 * "Test your AI" — a RULE-BASED PREVIEW. It applies your configuration with fixed logic; it does not call a language
 * model, so wording is simplified and it cannot reflect model behaviour. It tests the current (possibly unsaved) edits.
 */
export const Playground = forwardRef<
  PlaygroundHandle,
  { config: BrainConfig; dirty: boolean; onGoTo: (sec: string) => void }
>(function Playground({ config, dirty, onGoTo }, ref) {
  const [chat, setChat] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cfg = useRef(config);
  useEffect(() => {
    cfg.current = config;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, typing]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || typing) return;
    setChat((c) => [...c, { role: 'customer', text }]);
    setDraft('');
    setTyping(true);
    timer.current = setTimeout(() => {
      setChat((c) => [
        ...c,
        { role: 'ai', r: previewReply(text, cfg.current), unsaved: dirty, open: false },
      ]);
      setTyping(false);
    }, 450);
  };
  useImperativeHandle(ref, () => ({ ask, focus: () => input.current?.focus() }));

  return (
    <aside
      aria-label="Test Your AI"
      className="flex h-full min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[rgba(229,231,235,0.9)] bg-white/80 backdrop-blur-[12px]"
    >
      <div className="border-b border-line-subtle bg-[linear-gradient(180deg,rgba(240,240,255,0.7),rgba(255,255,255,0))] px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <AIIcon size={17} />
          <h2 className="m-0 flex-1 text-[15px] font-semibold">Test Your AI</h2>
          <span
            className="rounded-md bg-wash-2 px-2 py-0.5 text-[11px] font-medium text-muted"
            title="Responses come from fixed rules applied to your configuration, not from a live AI model."
          >
            Rule-based preview
          </span>
          {chat.length > 0 && (
            <button
              type="button"
              aria-label="Clear conversation"
              title="Clear conversation"
              onClick={() => setChat([])}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-wash"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <p className="m-0 mt-1 text-[12.5px] text-muted">
          Ask as a customer to see how your knowledge and rules apply. This is a simulation — not a
          live AI model.
        </p>
      </div>
      {dirty && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-[#FBE3B5] bg-warning-soft px-4 py-1.5 text-xs text-[#7A4700]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#D98A00]" />
          Testing your unsaved edits. Inbox uses the last saved version.
        </div>
      )}
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label="Test conversation"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {chat.length === 0 && (
          <div className="m-auto max-w-[280px] text-center">
            <p className="m-0 text-[13px] font-medium">Try a customer question</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {SUGGEST.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="cursor-pointer rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:bg-wash"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) =>
          m.role === 'customer' ? (
            <div
              key={i}
              className="max-w-[88%] self-start rounded-[14px_14px_14px_4px] border border-[#E9EAEE] bg-white px-3 py-2 text-[13.5px]"
            >
              <div className="mb-0.5 text-[11px] text-faint">Customer</div>
              {m.text}
            </div>
          ) : (
            <div key={i} className="max-w-[94%] self-end">
              <div className="rounded-[14px_14px_4px_14px] border border-primary bg-primary px-3 py-2 text-[13.5px] text-white [overflow-wrap:anywhere]">
                <div className="mb-0.5 text-[11px] text-white/70">
                  Preview reply{m.unsaved ? ' · unsaved edits' : ''}
                </div>
                {m.r.text}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Pill
                  tone={
                    m.r.confidence === 'High' ? 'ok' : m.r.confidence === 'Medium' ? 'warn' : 'bad'
                  }
                >
                  {m.r.confidence} confidence
                </Pill>
                {m.r.approval && <Pill tone="warn">Needs human review</Pill>}
                {m.r.fallback && <Pill tone="neutral">Fallback</Pill>}
                <button
                  type="button"
                  aria-expanded={m.open}
                  onClick={() =>
                    setChat((c) =>
                      c.map((x, j) => (j === i && x.role === 'ai' ? { ...x, open: !x.open } : x)),
                    )
                  }
                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary"
                >
                  Why this reply?
                  <ChevronDown
                    size={12}
                    className={cn('transition-transform', m.open && 'rotate-180')}
                  />
                </button>
              </div>
              {m.r.attention && (
                <button
                  type="button"
                  onClick={() => onGoTo(m.r.attention!.sec)}
                  className="mt-1.5 flex w-full cursor-pointer items-start gap-1.5 rounded-lg border border-[#FBE3B5] bg-warning-soft px-2.5 py-1.5 text-left text-xs text-[#7A4700]"
                >
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  {m.r.attention.text} <span className="font-semibold underline">Fix</span>
                </button>
              )}
              {m.open && (
                <dl className="m-0 mt-1.5 flex flex-col gap-1 rounded-lg border border-line bg-[#FBFBFC] p-2.5 text-xs">
                  {[
                    ['Knowledge used', m.r.sources],
                    ['Custom fields', m.r.fields],
                    ['Instructions', m.r.instructions],
                    ['Rules applied', m.r.rules],
                    ['Missing information', m.r.missing],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex gap-2">
                      <dt className="w-28 shrink-0 text-faint">{k as string}</dt>
                      <dd className="m-0 min-w-0 flex-1">
                        {(v as string[]).length ? (v as string[]).join(' · ') : '—'}
                      </dd>
                    </div>
                  ))}
                  {m.r.reason && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-faint">Review reason</dt>
                      <dd className="m-0 flex-1">{m.r.reason}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          ),
        )}
        {typing && (
          <div
            className="self-end rounded-[14px_14px_4px_14px] bg-primary-soft px-3 py-2"
            aria-label="Generating preview"
          >
            <AIProcessingIndicator label="Applying your rules…" bar />
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-2 border-t border-line-subtle p-3"
      >
        <input
          ref={input}
          aria-label="Customer message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a customer message…"
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || typing}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] bg-primary text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-[#D9DBE1]"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
});
