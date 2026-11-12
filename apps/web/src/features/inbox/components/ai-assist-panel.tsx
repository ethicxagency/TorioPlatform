'use client';

import { AI_PHASE_LABEL, AI_PHASES, AI_MODE_LABEL, type AiMode } from '@torio/contracts';
import { Check, CornerDownLeft, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AIBadge, AIIcon, AIProcessingIndicator } from '@/components/ui/ai';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import {
  requestDraft,
  requestPhase,
  useAiOptions,
  type AiDraft,
  type AiPhaseName,
} from '../ai-queries';

interface Props {
  conversationId: string;
  /** Current composer text, so an insert adds to it instead of replacing what the agent typed. */
  composerText: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}

const REFINE: { key: string; label: string }[] = [
  { key: 'shorter', label: 'Make shorter' },
  { key: 'detailed', label: 'More detailed' },
  { key: 'tone', label: 'Improve tone' },
  { key: 'translate_en', label: 'Translate to English' },
  { key: 'translate_bn', label: 'Translate to Bengali' },
];
const STRATEGY_LABEL: Record<string, string> = {
  single: 'One model',
  fallback: 'Backup model',
  synthesis: 'Combined from several models',
  best_candidate: 'Best of several models',
  auto_second_opinion: 'Second opinion',
};

const newId = () => crypto.randomUUID();

/**
 * Real AI Assist. The agent picks a mode, Torio prepares ONE draft from the store's Brain knowledge (the provider keys live on the
 * server, never here), and the agent reviews and edits it before inserting it into the composer. Nothing is sent automatically.
 * The processing steps are the server's real phases, polled while the draft is prepared.
 */
export function AiAssistPanel({ conversationId, composerText, onInsert, onClose }: Props) {
  const { workspaceId: ws } = useWorkspace();
  const opts = useAiOptions(ws, true);
  const [mode, setMode] = useState<AiMode | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<AiDraft | null>(null);
  const [busy, setBusy] = useState<null | { phase: AiPhaseName }>(null);
  const [error, setError] = useState('');
  const [inserted, setInserted] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);
  const chosen = mode ?? opts.data?.recommended ?? null;

  useEffect(() => () => clearInterval(poll.current), []);
  const run = async (refine?: string) => {
    if (!ws || !chosen || busy) return;
    const requestId = newId();
    setError('');
    setInserted(false);
    setBusy({ phase: 'understanding' });
    clearInterval(poll.current);
    poll.current = setInterval(() => {
      void requestPhase(ws, requestId)
        .then((p) => setBusy((b) => (b ? { phase: p.phase } : b)))
        .catch(() => undefined);
    }, 900);
    try {
      const r = await requestDraft(ws, conversationId, {
        requestId,
        mode: chosen,
        ...(refine && text.trim() && { refine, previousDraft: text.trim() }),
      });
      setResult(r);
      setText(r.draft);
    } catch (e) {
      // The previous draft stays: a failed regenerate never throws away text the agent was reading.
      setError(e instanceof Error ? e.message : 'AI Assist could not prepare a draft.');
    } finally {
      clearInterval(poll.current);
      setBusy(null);
    }
  };

  const insert = () => {
    const t = text.trim();
    if (!t) return;
    onInsert(composerText.trim() ? `${composerText.trimEnd()}\n\n${t}` : t);
    setInserted(true);
  };

  const header = (
    <div className="flex flex-wrap items-center gap-2 font-semibold">
      AI Assist
      <AIBadge>AI</AIBadge>
    </div>
  );
  const close = (
    <button
      type="button"
      aria-label="Dismiss AI Assist"
      onClick={onClose}
      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-white/70"
    >
      <X size={13} />
    </button>
  );

  if (opts.isPending)
    return (
      <Shell>
        <AIProcessingIndicator label="Checking AI Assist…" />
        {close}
      </Shell>
    );
  if (opts.isError || !opts.data?.available)
    return (
      <Shell>
        <div className="min-w-0 flex-1">
          {header}
          <p className="m-0 mt-0.5 text-muted">
            {opts.isError
              ? opts.error.message
              : (opts.data?.reason ?? 'AI Assist is not available.')}{' '}
            Nothing is generated or sent automatically.
          </p>
        </div>
        {close}
      </Shell>
    );

  const modeOptions = opts.data.modes.map((m) => ({
    value: m.mode,
    label: AI_MODE_LABEL[m.mode] ?? m.label,
    description: m.available ? undefined : (m.reason ?? undefined),
    disabled: !m.available,
  }));

  return (
    <Shell>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {header}
          <div className="ml-auto flex items-center gap-2">
            <Select
              aria-label="AI mode"
              value={chosen ?? ''}
              options={modeOptions}
              onChange={(v) => setMode(v as AiMode)}
              disabled={!!busy}
            />
            <Button size="sm" loading={!!busy} onClick={() => void run()} disabled={!chosen}>
              <Sparkles aria-hidden /> {result ? 'Regenerate' : 'Suggest a reply'}
            </Button>
          </div>
        </div>

        {busy && (
          <ol
            aria-label="Progress"
            className="m-0 mt-2.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs"
          >
            {AI_PHASES.filter((p) => p !== 'done').map((p, i) => {
              const at = AI_PHASES.indexOf(busy.phase);
              const state = i < at ? 'done' : i === at ? 'now' : 'todo';
              return (
                <li
                  key={p}
                  aria-current={state === 'now' ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-1.5',
                    state === 'now'
                      ? 'font-medium text-ink'
                      : state === 'done'
                        ? 'text-muted'
                        : 'text-faint',
                  )}
                >
                  {state === 'done' ? (
                    <Check size={12} className="text-success" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        state === 'now' ? 'bg-primary' : 'bg-line',
                      )}
                    />
                  )}
                  {AI_PHASE_LABEL[p]}
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <p
            role="alert"
            className="m-0 mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-[#8F2424]"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="mt-2.5 flex flex-col gap-2">
            <textarea
              aria-label="Suggested reply"
              value={text}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-y rounded-[10px] border border-line bg-white p-2.5 text-[13.5px] leading-snug text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
            />
            {result.needsReview && (
              <p
                role="status"
                className="m-0 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12.5px] text-[#7A4700]"
              >
                Please review this draft before sending.
                {result.warnings.length > 0 && (
                  <span className="mt-0.5 block text-xs">{result.warnings.join(' ')}</span>
                )}
              </p>
            )}
            {!result.needsReview && result.warnings.length > 0 && (
              <p className="m-0 text-xs text-muted">{result.warnings.join(' ')}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
              <span>{AI_MODE_LABEL[result.mode]}</span>
              <span>{STRATEGY_LABEL[result.strategy] ?? result.strategy}</span>
              <span>{result.providers.join(' + ')}</span>
              <span className="tabular-nums">{(result.durationMs / 1000).toFixed(1)}s</span>
              {result.qualityScore !== null && (
                <span title="An internal check, not a guarantee that the answer is correct">
                  Check {result.qualityScore}/100
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={insert} disabled={!text.trim() || !!busy}>
                {inserted ? <Check aria-hidden /> : <CornerDownLeft aria-hidden />}
                {inserted ? 'Inserted' : 'Insert into composer'}
              </Button>
              {REFINE.map((r) => (
                <Button
                  key={r.key}
                  size="sm"
                  variant="outline"
                  disabled={!!busy || !text.trim()}
                  onClick={() => void run(r.key)}
                >
                  {r.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => void run()}
                aria-label="Regenerate"
              >
                <RefreshCw aria-hidden />
              </Button>
            </div>
          </div>
        )}
        {!result && !busy && !error && (
          <p className="m-0 mt-1 text-muted">
            Drafts use your Brain knowledge. You review and edit every suggestion; nothing is sent
            automatically.
          </p>
        )}
      </div>
      {close}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="AI Assist"
      className="mx-3 mb-2 flex animate-panel-in items-start gap-2.5 rounded-xl border border-primary-line bg-primary-tint px-3 py-2.5 text-[12.5px] text-[#3A3C42] motion-reduce:animate-none"
    >
      <AIIcon size={15} className="mt-0.5 shrink-0" />
      {children}
    </div>
  );
}
