'use client';

import {
  AI_MODE_LABEL,
  previewReply,
  type AiMode,
  type BrainConfig,
  type PreviewResult,
} from '@torio/contracts';
import { ChevronDown, Send, Trash2, TriangleAlert } from 'lucide-react';
import { AIIcon, AIProcessingIndicator } from '@/components/ui/ai';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Select } from '@/components/ui/select';
import { requestBrainTest, useAiOptions, type AiDraft } from '@/features/inbox/ai-queries';
import { useWorkspace } from '@/lib/workspace';
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
  | { role: 'ai'; r: PreviewResult; unsaved: boolean; open: boolean }
  | { role: 'live'; d: AiDraft; unsaved: boolean }
  | { role: 'err'; text: string };
const STRATEGY: Record<string, string> = {
  single: 'One model',
  fallback: 'Backup model',
  synthesis: 'Combined from several models',
  best_candidate: 'Best of several models',
  auto_second_opinion: 'Second opinion',
};
export interface PlaygroundHandle {
  ask: (q: string) => void;
  focus: () => void;
}

/**
 * "Test your AI". By default a RULE-BASED PREVIEW: it applies your configuration with fixed logic and calls no language model.
 * With "Live AI" it asks the same engine Inbox AI Assist uses (server-side, on the current, possibly unsaved, edits), which counts
 * against the plan allowance. Live AI is only offered when the platform has it set up and the plan includes it.
 */
export const Playground = forwardRef<
  PlaygroundHandle,
  { config: BrainConfig; dirty: boolean; onGoTo: (sec: string) => void }
>(function Playground({ config, dirty, onGoTo }, ref) {
  const [chat, setChat] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const { workspaceId: ws } = useWorkspace();
  const opts = useAiOptions(ws, true);
  const [engine, setEngine] = useState<'rules' | 'ai'>('rules');
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const liveOk = !!opts.data?.available;
  const live = engine === 'ai' && liveOk;
  const chosen = aiMode ?? opts.data?.recommended ?? null;
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
    const next: Msg[] = [...chat, { role: 'customer', text }];
    setChat(next);
    setDraft('');
    setTyping(true);
    if (live && ws && chosen) {
      const lines: { from: 'customer' | 'agent'; text: string }[] = next
        .flatMap((m): { from: 'customer' | 'agent'; text: string }[] =>
          m.role === 'customer'
            ? [{ from: 'customer' as const, text: m.text }]
            : m.role === 'live'
              ? [{ from: 'agent' as const, text: m.d.draft }]
              : m.role === 'ai'
                ? [{ from: 'agent' as const, text: m.r.text }]
                : [],
        )
        .slice(-20);
      requestBrainTest(ws, {
        requestId: crypto.randomUUID(),
        mode: chosen,
        config: cfg.current,
        lines,
      })
        .then((d) => setChat((c) => [...c, { role: 'live', d, unsaved: dirty }]))
        .catch((e: unknown) =>
          setChat((c) => [
            ...c,
            { role: 'err', text: e instanceof Error ? e.message : 'The live AI could not answer.' },
          ]),
        )
        .finally(() => setTyping(false));
      return;
    }
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
            title={
              live
                ? 'Replies come from a live AI model, using your Brain and rules.'
                : 'Responses come from fixed rules applied to your configuration, not from a live AI model.'
            }
          >
            {live ? 'Live AI' : 'Rule-based preview'}
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
          {live
            ? 'Ask as a customer to see how a live AI model answers from your knowledge and rules. Each answer counts toward your plan’s AI allowance.'
            : 'Ask as a customer to see how your knowledge and rules apply. This is a simulation — not a live AI model.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Test engine"
            className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs"
          >
            {(
              [
                ['rules', 'Rules preview'],
                ['ai', 'Live AI'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={engine === k}
                disabled={k === 'ai' && !liveOk}
                title={
                  k === 'ai' && !liveOk
                    ? (opts.data?.reason ?? 'Live AI is not available.')
                    : undefined
                }
                onClick={() => setEngine(k)}
                className={cn(
                  'h-7 cursor-pointer rounded-md border-none px-2.5 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
                  engine === k
                    ? 'bg-primary-soft text-primary-hover'
                    : 'bg-transparent text-muted hover:bg-wash',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {live && opts.data && (
            <Select
              aria-label="Live AI mode"
              value={chosen ?? ''}
              onChange={(v) => setAiMode(v as AiMode)}
              options={opts.data.modes.map((m) => ({
                value: m.mode,
                label: AI_MODE_LABEL[m.mode],
                description: m.available ? undefined : (m.reason ?? undefined),
                disabled: !m.available,
              }))}
            />
          )}
          {!liveOk && !opts.isPending && (
            <span className="text-[11.5px] text-faint">
              Live AI: {opts.data?.reason ?? 'unavailable'}
            </span>
          )}
        </div>
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
          m.role === 'err' ? (
            <p
              key={i}
              role="alert"
              className="m-0 max-w-[94%] self-end rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-[#8F2424]"
            >
              {m.text}
            </p>
          ) : m.role === 'live' ? (
            <div key={i} className="max-w-[94%] self-end">
              <div className="rounded-[14px_14px_4px_14px] border border-primary bg-primary px-3 py-2 text-[13.5px] text-white [overflow-wrap:anywhere]">
                <div className="mb-0.5 text-[11px] text-white/70">
                  Live AI reply{m.unsaved ? ' · unsaved edits' : ''}
                </div>
                {m.d.draft}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
                <span>{STRATEGY[m.d.strategy] ?? m.d.strategy}</span>
                <span>{m.d.providers.join(' + ')}</span>
                <span className="tabular-nums">{(m.d.durationMs / 1000).toFixed(1)}s</span>
                {m.d.needsReview && <Pill tone="warn">Needs review</Pill>}
              </div>
              {m.d.warnings.length > 0 && (
                <p className="m-0 mt-1 rounded-lg border border-[#FBE3B5] bg-warning-soft px-2.5 py-1.5 text-xs text-[#7A4700]">
                  {m.d.warnings.join(' ')}
                </p>
              )}
            </div>
          ) : m.role === 'customer' ? (
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
            <AIProcessingIndicator label={live ? 'Asking the AI…' : 'Applying your rules…'} bar />
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
