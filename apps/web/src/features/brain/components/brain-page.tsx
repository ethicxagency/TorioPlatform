'use client';

import {
  areas,
  changedSections,
  conflicts,
  issuesOf,
  readinessPct,
  type BrainConfig,
  type SectionKey,
} from '@torio/contracts';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { useBrain, useSaveBrain, type BrainDoc } from '../queries';
import { BrainHeader, SaveControls } from './brain-header';
import {
  DEFAULT_TAB,
  isTab,
  KNOWLEDGE_NAV,
  RULES_NAV,
  SECTION_TAB,
  TABS,
  type TabId,
} from './brain-tabs';
import { IntelligenceTab } from './intelligence-tab';
import { Playground, type PlaygroundHandle } from './playground';
import { FieldsSection } from './sections-fields';
import { KbSection, ProductsSection } from './sections-knowledge';
import { InstructionsSection, LogicSection } from './sections-logic';
import {
  GuardrailsSection,
  IdentitySection,
  PoliciesSection,
  VoiceSection,
} from './sections-basic';
import { fixItems, SummaryTab } from './summary-tab';
import type { Mut } from './types';

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
    // useSearchParams (the active tab) needs a Suspense boundary.
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <BrainEditor
        key={`${ws}`}
        ws={ws}
        initial={brain.data}
        canWrite={can('brain:write')}
        onReload={async () => (await brain.refetch()).data}
      />
    </Suspense>
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
  const { toast } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  // The tab lives in the URL: it survives a refresh, can be bookmarked, and back/forward move between tabs.
  const tab: TabId = isTab(tabParam) ? tabParam : DEFAULT_TAB;
  const save = useSaveBrain(ws);
  const [saved, setSaved] = useState<BrainDoc>(initial);
  const [draft, setDraft] = useState<BrainConfig>(initial.config);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [conflict, setConflict] = useState(false);
  const [active, setActive] = useState('identity');
  const pendingScroll = useRef<{ sec: string; focus: boolean } | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [fieldRequest, setFieldRequest] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const play = useRef<PlaygroundHandle>(null);

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

  const selectTab = useCallback(
    (id: TabId) => {
      if (id === tab) return;
      router.push(id === DEFAULT_TAB ? pathname : `${pathname}?tab=${id}`, { scroll: false });
    },
    [router, pathname, tab],
  );

  // Scroll tracking: highlight the section nearest the top, within the visible editing tab.
  useEffect(() => {
    const nav = tab === 'knowledge' ? KNOWLEDGE_NAV : tab === 'rules' ? RULES_NAV : null;
    if (!nav) return;
    const root = document.querySelector('main');
    const els = nav.map((n) => document.getElementById(n.key)).filter((e): e is HTMLElement => !!e);
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

  const scrollTo = useCallback((sec: string, focus = false) => {
    const el = document.getElementById(sec);
    el?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    setActive(sec === 'returns' ? 'policies' : sec);
    if (focus) {
      // Put the cursor in the section's first field (or, failing that, its first action) so Fix lands on the thing to do.
      const target = el?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
      );
      target?.focus({ preventScroll: true });
    }
  }, []);
  // After the tab that holds a section becomes visible, bring the section into view.
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    const t = setTimeout(() => scrollTo(pending.sec, pending.focus), 40);
    return () => clearTimeout(t);
  }, [tab, scrollTo]);

  /** Opens the tab that holds `sec` and scrolls to it. */
  const goTo = useCallback(
    (sec: string, focus = false) => {
      const target = SECTION_TAB[sec];
      if (target && target !== tab) {
        pendingScroll.current = { sec, focus };
        selectTab(target);
      } else scrollTo(sec, focus);
    },
    [tab, selectTab, scrollTo],
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

  const runTest = (msg: string) => {
    selectTab('test');
    setTimeout(() => play.current?.ask(msg), 60);
  };
  const bundle = { d: draft, mut, canWrite };

  const controls = {
    dirty,
    changed,
    saveState,
    canWrite,
    showChanges,
    onToggleChanges: () => setShowChanges((v) => !v),
    onDiscard: discard,
    onSave: doSave,
  };
  const subNav = (items: readonly { key: string; label: string }[], label: string) => (
    <nav
      aria-label={label}
      className="sticky top-0 z-20 -mx-1 overflow-x-auto rounded-xl border border-line bg-white/80 px-1.5 py-1.5 backdrop-blur-[16px] [scrollbar-width:none]"
    >
      <ul className="m-0 flex list-none gap-1 p-0">
        {items.map((n) => (
          <li key={n.key}>
            <button
              type="button"
              aria-current={active === n.key ? 'true' : undefined}
              onClick={() => goTo(n.key)}
              className={cn(
                'h-8 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors duration-150 motion-reduce:transition-none',
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
  );
  const readOnlyNote = !canWrite && (
    <p
      role="status"
      className="m-0 rounded-lg border border-line bg-[#FBFBFC] px-3 py-2 text-[13px] text-muted"
    >
      You can view Brain but only admins and owners can edit it.
    </p>
  );
  const goToSection = (s: SectionKey) => goTo(s);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 pb-8 pt-5 sm:px-6">
      <BrainHeader
        maturity={saved.maturity}
        setup={pct}
        savedAt={saved.updatedAt}
        dirty={dirty}
        showActions={tab !== 'summary'}
        controls={controls}
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

      <div
        role="tablist"
        aria-label="Brain"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 [scrollbar-width:none]"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              id={`brain-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`brain-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              type="button"
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => {
                const i = TABS.findIndex((x) => x.id === tab);
                const go = (n: number) => {
                  e.preventDefault();
                  const next = TABS[(n + TABS.length) % TABS.length]!;
                  selectTab(next.id);
                  setTimeout(() => document.getElementById(`brain-tab-${next.id}`)?.focus(), 0);
                };
                if (e.key === 'ArrowRight') go(i + 1);
                else if (e.key === 'ArrowLeft') go(i - 1);
                else if (e.key === 'Home') go(0);
                else if (e.key === 'End') go(TABS.length - 1);
              }}
              className={cn(
                '-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary motion-reduce:transition-none',
                on
                  ? 'border-primary font-semibold text-primary-hover'
                  : 'border-transparent font-medium text-muted hover:text-ink',
              )}
            >
              <Icon size={15} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Every panel stays mounted (hidden when inactive), so unsaved edits, open drawers and the test chat survive a tab switch. */}
      <div
        role="tabpanel"
        id="brain-panel-summary"
        aria-labelledby="brain-tab-summary"
        hidden={tab !== 'summary'}
      >
        <SummaryTab
          maturity={saved.maturity}
          areaList={list}
          pct={pct}
          fixes={fixItems(issues, conflicts(draft))}
          savedAt={saved.updatedAt}
          savedBy={saved.updatedBy?.name ?? null}
          dirty={dirty}
          onGoTo={goTo}
          actions={
            <>
              <SaveControls {...controls} />
              <Button variant="dark" className="h-9" onClick={() => selectTab('test')}>
                <Sparkles size={14} />
                Test AI
              </Button>
            </>
          }
        />
      </div>
      <div
        role="tabpanel"
        id="brain-panel-intelligence"
        aria-labelledby="brain-tab-intelligence"
        hidden={tab !== 'intelligence'}
      >
        <IntelligenceTab
          maturity={saved.maturity}
          dirty={dirty}
          savedAt={saved.updatedAt}
          savedBy={saved.updatedBy?.name ?? null}
          onGoTo={goToSection}
        />
      </div>
      <div
        role="tabpanel"
        id="brain-panel-knowledge"
        aria-labelledby="brain-tab-knowledge"
        hidden={tab !== 'knowledge'}
        className="flex min-w-0 flex-col gap-4"
      >
        {subNav(KNOWLEDGE_NAV, 'Knowledge sections')}
        {readOnlyNote}
        <fieldset disabled={!canWrite} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <IdentitySection {...bundle} onAddField={() => setFieldRequest(true)} />
          <ProductsSection {...bundle} remove={remove} />
          <PoliciesSection {...bundle} />
          <FieldsSection
            {...bundle}
            remove={remove}
            openRequest={fieldRequest}
            onRequestHandled={() => setFieldRequest(false)}
          />
          <KbSection {...bundle} remove={remove} />
        </fieldset>
      </div>
      <div
        role="tabpanel"
        id="brain-panel-rules"
        aria-labelledby="brain-tab-rules"
        hidden={tab !== 'rules'}
        className="flex min-w-0 flex-col gap-4"
      >
        {subNav(RULES_NAV, 'Rules and behavior sections')}
        {readOnlyNote}
        <fieldset disabled={!canWrite} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <VoiceSection {...bundle} />
          <InstructionsSection {...bundle} remove={remove} onTest={runTest} />
          <GuardrailsSection {...bundle} />
          <LogicSection {...bundle} remove={remove} onTest={(m) => runTest(m)} />
        </fieldset>
      </div>
      <div
        role="tabpanel"
        id="brain-panel-test"
        aria-labelledby="brain-tab-test"
        hidden={tab !== 'test'}
        className="mx-auto flex w-full max-w-[860px] min-w-0 flex-col gap-3"
      >
        <p className="m-0 flex items-start gap-2 rounded-xl border border-[rgba(91,92,226,0.18)] bg-primary-tint px-3 py-2.5 text-[13px] text-ink">
          <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
          <span>
            <b>This is a test, not a live conversation.</b> Nothing here is sent to customers, and
            it uses your current edits, saved or not.
          </span>
        </p>
        <div className="h-[calc(100vh-300px)] min-h-[480px]">
          <Playground ref={play} config={draft} dirty={dirty} onGoTo={goTo} />
        </div>
        <section
          aria-label="Inbox integration"
          className="rounded-[14px] border border-line bg-white p-4 text-[12.5px] text-muted"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="min-w-[200px] flex-1 text-[13.5px] font-semibold text-ink">
              Brain helps your AI understand your business before responding to customers.
            </span>
            <Link href="/inbox" className="text-[13px] font-semibold">
              Open Inbox →
            </Link>
          </div>
          <dl className="m-0 mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-faint">Brand knowledge configured</dt>
              <dd className="m-0 mt-0.5 font-medium text-ink">
                {pct}% complete · {draft.products.length} products ·{' '}
                {draft.faqs.filter((f) => f.active).length} FAQs
              </dd>
            </div>
            <div>
              <dt className="text-faint">AI reply behavior</dt>
              <dd className="m-0 mt-0.5 font-medium text-ink">
                {draft.voice.tone} · {draft.voice.language} · {draft.voice.length}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Human approval required</dt>
              <dd className="m-0 mt-0.5 font-medium text-ink">
                {draft.rules.approvalTopics.join(', ') || 'No topics selected'}
              </dd>
            </div>
          </dl>
          <p className="m-0 mt-3 text-xs">
            <b>AI suggestions in Inbox aren&apos;t connected yet</b> — saving Brain stores your
            configuration; nothing here changes live replies today. When AI is connected it will use
            the last saved version only.
          </p>
        </section>
      </div>

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
