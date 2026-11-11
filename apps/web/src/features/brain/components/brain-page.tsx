'use client';

import { areas, changedSections, issuesOf, readinessPct, type BrainConfig } from '@torio/contracts';
import { Check, Loader2, Sparkles, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useBrain, useSaveBrain, type BrainDoc } from '../queries';
import { BrainHero } from './brain-hero';
import { Playground, type PlaygroundHandle } from './playground';
import { Readiness } from './readiness';
import { FieldsSection } from './sections-fields';
import { KbSection, ProductsSection } from './sections-knowledge';
import { InstructionsSection, LogicSection } from './sections-logic';
import {
  GuardrailsSection,
  IdentitySection,
  PoliciesSection,
  VoiceSection,
} from './sections-basic';
import type { Mut } from './types';

const NAV = [
  { key: 'identity', label: 'Business Profile' },
  { key: 'products', label: 'Products & Catalog' },
  { key: 'policies', label: 'Customer Policies' },
  { key: 'voice', label: 'Brand Voice' },
  { key: 'fields', label: 'Custom Fields' },
  { key: 'instructions', label: 'Custom Instructions' },
  { key: 'logic', label: 'Business Logic' },
  { key: 'kb', label: 'Knowledge Base' },
];
const SEC_OF: Record<string, string> = { returns: 'policies', guardrails: 'instructions' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface UndoToast {
  text: string;
  undo?: () => void;
  error?: boolean;
}

export function BrainPage() {
  const { workspaceId: ws, can, isLoading, error } = useWorkspace();
  const brain = useBrain(ws);
  if (isLoading || brain.isPending)
    return (
      <div className="mx-auto max-w-[1440px] p-6" aria-busy="true">
        <Skeleton className="mb-4 h-16 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  if (error || !ws)
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        Couldn&apos;t load your workspace. Please refresh.
      </div>
    );
  if (!can('brain:read'))
    return (
      <div role="alert" className="p-8 text-center text-sm text-muted">
        You don&apos;t have access to Brain in this workspace.
      </div>
    );
  if (brain.isError)
    return (
      <div role="alert" className="p-8 text-center">
        <div className="text-sm font-semibold">Couldn&apos;t load Brain</div>
        <div className="mb-3 mt-1 text-[13px] text-muted">{brain.error.message}</div>
        <Button variant="outline" size="sm" onClick={() => brain.refetch()}>
          Try again
        </Button>
      </div>
    );
  return (
    <BrainEditor
      key={`${ws}`}
      ws={ws}
      initial={brain.data}
      canWrite={can('brain:write')}
      onReload={async () => (await brain.refetch()).data}
    />
  );
}

function BrainEditor({
  ws,
  initial,
  canWrite,
  onReload,
}: {
  ws: string;
  initial: BrainDoc;
  canWrite: boolean;
  onReload: () => Promise<BrainDoc | undefined>;
}) {
  const { vw, contentWidth, toast } = useShell();
  const save = useSaveBrain(ws);
  const [saved, setSaved] = useState<BrainDoc>(initial);
  const [draft, setDraft] = useState<BrainConfig>(initial.config);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [conflict, setConflict] = useState(false);
  const [active, setActive] = useState('identity');
  const [tab, setTab] = useState<'knowledge' | 'test'>('knowledge');
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [fieldRequest, setFieldRequest] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const play = useRef<PlaygroundHandle>(null);
  const readyRef = useRef<HTMLElement>(null);

  const mut: Mut = useCallback((fn) => {
    setDraft((p) => {
      const c = structuredClone(p);
      fn(c);
      return c;
    });
    setSaveState((s) => (s === 'saved' || s === 'error' ? 'idle' : s));
  }, []);
  const changed = useMemo(() => changedSections(saved.config, draft), [saved.config, draft]);
  const dirty = changed.length > 0;
  const issues = useMemo(() => issuesOf(draft), [draft]);
  const list = useMemo(() => areas(draft), [draft]);
  const pct = readinessPct(list);
  const wide = contentWidth >= 1180;

  const flash = (t: UndoToast, ms = 4500) => {
    clearTimeout(toastTimer.current);
    setUndoToast(t);
    toastTimer.current = setTimeout(() => setUndoToast(null), t.undo ? 6000 : ms);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const remove = useCallback(
    (label: string, restore: () => void) =>
      flash({
        text: label,
        undo: () => {
          restore();
          setUndoToast(null);
        },
      }),
    [],
  );

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Scroll tracking: highlight the section nearest the top of the scrolling area.
  useEffect(() => {
    if (tab !== 'knowledge') return;
    const root = document.querySelector('main');
    const els = NAV.map((n) => document.getElementById(n.key)).filter((e): e is HTMLElement => !!e);
    if (!root || !els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const v = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id);
      },
      { root, rootMargin: '-72px 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [tab]);

  const goTo = useCallback(
    (sec: string) => {
      const key = SEC_OF[sec] ?? sec;
      const run = () => {
        document.getElementById(sec)?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
        if (NAV.some((n) => n.key === key)) setActive(key);
      };
      if (tab !== 'knowledge') {
        setTab('knowledge');
        setTimeout(run, 40);
      } else run();
    },
    [tab],
  );

  const doSave = () => {
    if (save.isPending) return;
    if (issues.length) {
      setSaveState('error');
      flash(
        {
          text: `Fix ${issues.length} issue${issues.length > 1 ? 's' : ''} before saving: ${issues[0]!.text}`,
          error: true,
        },
        6000,
      );
      goTo(issues[0]!.sec);
      return;
    }
    setSaveState('saving');
    setShowChanges(false);
    save.mutate(
      { config: draft, baseVersion: saved.version },
      {
        onSuccess: (doc) => {
          setSaved(doc);
          setSaveState('saved');
          setConflict(false);
          flash({ text: 'Brain saved. Inbox AI will use this version.' });
        },
        onError: (e) => {
          setSaveState('error');
          const stale = (e as { status?: number }).status === 409;
          setConflict(stale);
          flash(
            {
              text: stale
                ? 'Someone else saved Brain first. Your edits are kept — reload the latest to compare.'
                : e.message,
              error: true,
            },
            7000,
          );
        },
      },
    );
  };
  const discard = () => {
    setDraft(saved.config);
    setSaveState('idle');
    setShowChanges(false);
    toast('Changes discarded');
  };
  const reloadLatest = async () => {
    const doc = await onReload();
    if (doc) {
      setSaved(doc);
      setDraft(doc.config);
      setConflict(false);
      setSaveState('idle');
      toast('Loaded the latest saved Brain');
    }
  };

  const testAI = () => {
    if (!wide && tab !== 'test') {
      setTab('test');
      setTimeout(() => play.current?.focus(), 60);
    } else play.current?.focus();
  };
  const runTest = (msg: string) => {
    if (!wide) setTab('test');
    setTimeout(() => play.current?.ask(msg), wide ? 0 : 60);
  };

  const bundle = { d: draft, mut, canWrite };

  const knowledge = (
    <div className="flex min-w-0 flex-col gap-4">
      <Readiness ref={readyRef} d={draft} pct={pct} onGoTo={goTo} />
      <nav
        aria-label="Brain sections"
        className="sticky top-0 z-20 -mx-1 overflow-x-auto rounded-xl border border-line bg-white/80 px-1.5 py-1.5 backdrop-blur-[16px] [scrollbar-width:none]"
      >
        <ul className="m-0 flex list-none gap-1 p-0">
          {NAV.map((n) => (
            <li key={n.key}>
              <button
                type="button"
                aria-current={active === n.key ? 'true' : undefined}
                onClick={() => goTo(n.key)}
                className={cn(
                  'h-8 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px]',
                  active === n.key
                    ? 'bg-primary-soft font-semibold text-primary-hover'
                    : 'font-medium text-muted hover:bg-wash',
                )}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {!canWrite && (
        <p
          role="status"
          className="m-0 rounded-lg border border-line bg-[#FBFBFC] px-3 py-2 text-[13px] text-muted"
        >
          You can view Brain but only admins and owners can edit it.
        </p>
      )}
      <fieldset disabled={!canWrite} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <IdentitySection {...bundle} onAddField={() => setFieldRequest(true)} />
        <ProductsSection {...bundle} remove={remove} />
        <PoliciesSection {...bundle} />
        <VoiceSection {...bundle} />
        <FieldsSection
          {...bundle}
          remove={remove}
          openRequest={fieldRequest}
          onRequestHandled={() => setFieldRequest(false)}
        />
        <InstructionsSection {...bundle} remove={remove} onTest={runTest} />
        <GuardrailsSection {...bundle} />
        <LogicSection {...bundle} remove={remove} onTest={(m) => runTest(m)} />
        <KbSection {...bundle} remove={remove} />
      </fieldset>
      <section
        aria-label="Inbox integration"
        className="rounded-[14px] border border-[rgba(91,92,226,0.18)] bg-[linear-gradient(135deg,rgba(240,240,255,0.9),rgba(255,255,255,0.9))] p-4"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="min-w-[200px] flex-1 text-[13.5px] font-semibold">
            Brain helps your AI understand your business before responding to customers.
          </span>
          <Link href="/inbox" className="text-[13px] font-semibold">
            Open Inbox →
          </Link>
        </div>
        <dl className="m-0 mt-3 grid grid-cols-1 gap-x-5 gap-y-2 text-[12.5px] sm:grid-cols-3">
          <div>
            <dt className="text-faint">Brand knowledge configured</dt>
            <dd className="m-0 mt-0.5 font-medium">
              {pct}% complete · {draft.products.length} products ·{' '}
              {draft.faqs.filter((f) => f.active).length} FAQs
            </dd>
          </div>
          <div>
            <dt className="text-faint">AI reply behavior</dt>
            <dd className="m-0 mt-0.5 font-medium">
              {draft.voice.tone} · {draft.voice.language} · {draft.voice.length}
            </dd>
          </div>
          <div>
            <dt className="text-faint">Human approval required</dt>
            <dd className="m-0 mt-0.5 font-medium">
              {draft.rules.approvalTopics.join(', ') || 'No topics selected'}
            </dd>
          </div>
        </dl>
        <p className="m-0 mt-3 text-xs text-muted">
          <b>AI suggestions in Inbox aren&apos;t connected yet</b> — saving Brain stores your
          configuration; nothing here changes live replies today. When AI is connected it will use
          the last saved version only.
        </p>
      </section>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6">
      <BrainHero
        maturity={saved.maturity}
        liveIssues={issues.length}
        dirty={dirty}
        savedAt={saved.updatedAt}
        savedBy={saved.updatedBy?.name ?? null}
        onGoTo={goTo}
        actions={
          <>
            {dirty && (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={showChanges}
                  onClick={() => setShowChanges((v) => !v)}
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-[#FBE3B5] bg-warning-soft px-2.5 text-[12.5px] font-medium text-[#7A4700]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D98A00]" />
                  Unsaved changes ({changed.length})
                </button>
                {showChanges && (
                  <div className="absolute right-0 top-11 z-30 w-60 animate-panel-in rounded-xl border border-line glass-menu p-3 shadow-popover">
                    <div className="mb-1 text-xs font-semibold text-faint">Changed sections</div>
                    <ul className="m-0 mb-2 list-none p-0 text-[13px]">
                      {changed.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <Button size="sm" variant="outline" onClick={discard}>
                      <Undo2 size={13} />
                      Discard changes
                    </Button>
                  </div>
                )}
              </div>
            )}
            {canWrite && (
              <Button
                disabled={!dirty || saveState === 'saving'}
                onClick={doSave}
                variant={saveState === 'error' ? 'outline' : 'primary'}
                className={cn('h-9', saveState === 'error' && 'border-danger text-danger')}
                aria-live="polite"
              >
                {saveState === 'saving' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </>
                ) : saveState === 'saved' && !dirty ? (
                  <>
                    <Check size={14} />
                    Saved
                  </>
                ) : saveState === 'error' ? (
                  'Fix & save'
                ) : (
                  'Save Changes'
                )}
              </Button>
            )}
            <Button variant="dark" className="h-9" onClick={testAI}>
              <Sparkles size={14} />
              Test AI
            </Button>
          </>
        }
      />

      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[#FBE3B5] bg-warning-soft px-3.5 py-2.5 text-[13px] text-[#7A4700]"
        >
          Someone else saved a newer Brain. Your edits are still here.
          <Button size="sm" variant="outline" onClick={() => void reloadLatest()}>
            Discard mine and load latest
          </Button>
        </div>
      )}
      {issues.length > 0 && dirty && saveState === 'error' && (
        <div
          role="alert"
          className="rounded-xl border border-[#F3C4C4] bg-danger-soft px-3.5 py-2.5 text-[13px] text-[#8F2424]"
        >
          <b>Fix before saving:</b>
          <ul className="m-0 mt-1 list-none p-0">
            {issues.slice(0, 4).map((i) => (
              <li key={i.text}>
                {i.text}{' '}
                <button
                  type="button"
                  onClick={() => goTo(i.sec)}
                  className="cursor-pointer font-semibold underline"
                >
                  Go to section
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!wide && (
        <div role="tablist" aria-label="Brain views" className="flex gap-1 border-b border-line">
          {(
            [
              ['knowledge', 'Knowledge'],
              ['test', 'Test AI'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                '-mb-px cursor-pointer border-b-2 px-3 py-2 text-[13px] font-medium',
                tab === k ? 'border-primary text-primary-hover' : 'border-transparent text-muted',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-5">
          {knowledge}
          <div className="sticky top-4 h-[calc(100vh-110px)] min-h-[480px]">
            <Playground ref={play} config={draft} dirty={dirty} onGoTo={goTo} />
          </div>
        </div>
      ) : tab === 'knowledge' ? (
        knowledge
      ) : (
        <div className="h-[calc(100vh-260px)] min-h-[480px]">
          <Playground ref={play} config={draft} dirty={dirty} onGoTo={goTo} />
        </div>
      )}
      <span className="sr-only" aria-hidden>
        {vw}
      </span>

      {undoToast && (
        <div
          role={undoToast.error ? 'alert' : 'status'}
          className={cn(
            'fixed bottom-6 left-1/2 z-[95] flex max-w-[calc(100vw-32px)] -translate-x-1/2 animate-toast-in items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] text-white shadow-[0_8px_24px_rgba(0,55,112,0.2)]',
            undoToast.error ? 'bg-[#8F2424]' : 'bg-ink',
          )}
        >
          <span>{undoToast.text}</span>
          {undoToast.undo && (
            <button
              type="button"
              onClick={undoToast.undo}
              className="cursor-pointer font-semibold underline"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
