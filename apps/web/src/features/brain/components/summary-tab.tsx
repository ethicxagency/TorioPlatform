'use client';

import type { BrainArea, BrainConflict, BrainIssue, BrainMaturity, Stage } from '@torio/contracts';
import {
  ArrowRight,
  BookOpenText,
  Building2,
  Check,
  CircleHelp,
  Clock,
  Gauge,
  ListChecks,
  Package,
  Puzzle,
  RotateCcw,
  ScrollText,
  TriangleAlert,
  Truck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtAgoIso } from './bits';
import {
  BrainIllustration,
  Journey,
  MaturityCard,
  QualityCards,
  Ring,
  Stat,
} from './maturity-parts';

/** The section each blocking issue or recommendation points at, in words. */
const SECTION_LABEL: Record<string, string> = {
  identity: 'Business Profile',
  products: 'Products & Catalog',
  policies: 'Customer Policies',
  returns: 'Returns & Refunds',
  fields: 'Custom Fields',
  instructions: 'Custom Instructions',
  guardrails: 'Guardrails',
  logic: 'Business Logic',
  kb: 'Knowledge Base',
  voice: 'Brand Voice',
};

interface Cat {
  title: string;
  icon: LucideIcon;
  color: string;
  /** Why this area matters, for the recommendation that points at it. */
  why: string;
}
/** The eight readiness categories, keyed by the existing readiness areas. */
const CATEGORY: Record<string, Cat> = {
  identity: {
    title: 'Business Profile',
    icon: Building2,
    color: '#5B5CE2',
    why: 'Torio introduces your business using your profile.',
  },
  products: {
    title: 'Product Knowledge',
    icon: Package,
    color: '#2B8FD9',
    why: 'Product details let AI answer price, stock and variant questions.',
  },
  shipping: {
    title: 'Shipping Policy',
    icon: Truck,
    color: '#0F9D8A',
    why: 'Delivery answers need your real fees, times and providers.',
  },
  returns: {
    title: 'Return Policy',
    icon: RotateCcw,
    color: '#D98A00',
    why: 'Refund and return questions need your actual rules.',
  },
  fields: {
    title: 'Custom Fields',
    icon: Puzzle,
    color: '#8B5CF6',
    why: 'Fields hold facts specific to how your business works.',
  },
  instructions: {
    title: 'Custom Instructions',
    icon: ScrollText,
    color: '#A855F7',
    why: 'Instructions shape how AI behaves with your customers.',
  },
  logic: {
    title: 'Business Logic',
    icon: Workflow,
    color: '#0891B2',
    why: 'Rules tell AI what to do in situations that need care.',
  },
  faqs: {
    title: 'FAQs',
    icon: CircleHelp,
    color: '#DB2777',
    why: 'FAQs are the fastest way to answer common questions.',
  },
};

function Heading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[13.5px] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export interface FixItem {
  title: string;
  sec: string;
  kind: 'issue' | 'conflict';
}

/** Blocking problems first (they stop a save), then contradictions. Real data only: nothing is invented. */
export function fixItems(issues: BrainIssue[], cf: BrainConflict[]): FixItem[] {
  return [
    ...issues.map((i): FixItem => ({ title: i.text, sec: i.sec, kind: 'issue' })),
    ...cf.map((c): FixItem => ({ title: c.text, sec: c.sec, kind: 'conflict' })),
  ];
}

const priorityOf = (a: BrainArea): 'High' | 'Medium' | 'Low' =>
  a.review || a.pct === 0 ? 'High' : a.pct < 0.5 ? 'Medium' : 'Low';
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;
const PRIORITY_DOT = { High: '#DC2626', Medium: '#D98A00', Low: '#2B8FD9' } as const;

export function SummaryTab({
  maturity: m,
  areaList,
  pct,
  fixes,
  savedAt,
  savedBy,
  dirty,
  celebrate,
  actions,
  onGoTo,
}: {
  maturity: BrainMaturity;
  /** The existing readiness areas, computed from the draft with the shared `areas()`. */
  areaList: BrainArea[];
  /** The existing readiness percentage (`readinessPct`). Separate from the intelligence score. */
  pct: number;
  fixes: FixItem[];
  savedAt: string | null;
  savedBy: string | null;
  dirty: boolean;
  /** The stage that was just unlocked by a save, for a one-time celebration. */
  celebrate?: Stage | null;
  actions: React.ReactNode;
  onGoTo: (section: string, focus?: boolean) => void;
}) {
  const [showAllFixes, setShowAllFixes] = useState(false);
  const recs = areaList
    .filter((a) => a.rec)
    .map((a) => ({ a, p: priorityOf(a) }))
    .sort((x, y) => PRIORITY_RANK[x.p] - PRIORITY_RANK[y.p])
    .slice(0, 5);
  const [first, ...rest] = fixes;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Brain Overview */}
      <section
        aria-label="Brain overview"
        className="relative overflow-hidden rounded-2xl border border-line bg-white"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute -left-10 -top-12 h-40 w-40 rounded-[36px] bg-[#F0F0FF] rotate-12" />
          <span className="absolute -bottom-14 left-1/3 h-32 w-32 rounded-full bg-[#F3EEFF]/70" />
          <span className="absolute right-6 top-4 h-10 w-10 rounded-[12px] bg-[#E8F3FC]/80 -rotate-12" />
        </div>
        <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
          <div className="flex min-w-0 flex-col justify-between gap-4">
            <div className="flex items-start gap-4">
              <BrainIllustration size={104} />
              <div className="min-w-0 pt-1">
                <h2 className="m-0 font-page-title">Brain</h2>
                <p className="m-0 text-sm font-medium text-primary-hover">
                  Your business. Your rules. Your AI.
                </p>
                <p className="m-0 mt-1.5 max-w-[460px] text-[13px] leading-snug text-muted">
                  Teach Torio how your business works, what your customers need, and how your AI
                  should respond.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
          <MaturityCard m={m} ringSize={124} maxRequirements={3} />
        </div>
        {dirty && (
          <p className="relative m-0 border-t border-line-subtle bg-[#FBFBFC] px-5 py-2 text-xs text-muted">
            The intelligence score and stage describe your last saved Brain. Unsaved changes count
            once you save.
          </p>
        )}
      </section>

      {/* 2. Brain Statistics */}
      <section aria-label="Brain statistics" className="flex flex-col gap-2">
        <Heading>Brain statistics</Heading>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 xl:grid-cols-6">
          <li>
            <Stat
              icon={Gauge}
              label="Setup completion"
              value={`${pct}%`}
              bar={pct}
              accent="#5B5CE2"
              hint="Recommended setup filled in"
            />
          </li>
          <li>
            <Stat
              icon={ListChecks}
              label="Active rules"
              value={m.stats.activeRules}
              accent="#2B8FD9"
              hint="Business rules guiding AI"
            />
          </li>
          <li>
            <Stat
              icon={Puzzle}
              label="Custom fields"
              value={m.stats.customFields}
              accent="#8B5CF6"
              hint="Extra business context"
            />
          </li>
          <li>
            <Stat
              icon={BookOpenText}
              label="Knowledge base"
              value={m.stats.activeFaqs}
              accent="#0F9D8A"
              hint={`Active FAQ${m.stats.activeFaqs === 1 ? '' : 's'} answering customers`}
            />
          </li>
          <li>
            <Stat
              icon={fixes.length > 0 ? TriangleAlert : Check}
              label="Issues"
              value={fixes.length}
              tone={fixes.length > 0 ? 'warn' : 'ok'}
              accent={fixes.length > 0 ? '#DC2626' : '#16A34A'}
              hint={fixes.length > 0 ? 'Fix before saving' : 'Configuration valid'}
            />
          </li>
          <li>
            <Stat
              icon={Clock}
              label="Last saved"
              value={<span className="text-[16px]">{savedAt ? fmtAgoIso(savedAt) : 'Never'}</span>}
              accent="#D98A00"
              hint={savedAt ? (savedBy ? `by ${savedBy}` : 'Saved') : 'Not saved yet'}
            />
          </li>
        </ul>
      </section>

      {/* 3. Intelligence Quality */}
      <section aria-label="Intelligence quality" className="flex flex-col gap-2">
        <Heading
          aside={
            <span className="text-[11.5px] text-faint">
              Scored on quality, not on how much is filled in
            </span>
          }
        >
          Intelligence quality
        </Heading>
        <QualityCards m={m} />
      </section>

      {/* 4. Brain Growth Journey */}
      <section aria-label="Brain growth journey" className="flex flex-col gap-2">
        <Heading>Your Brain&apos;s Growth Journey</Heading>
        <div className="rounded-2xl border border-line bg-white p-4">
          <Journey m={m} celebrate={celebrate} onGoTo={(sec) => onGoTo(sec, true)} />
        </div>
      </section>

      {/* 5. Fix This First */}
      <section aria-label="Fix this first" className="flex flex-col gap-2">
        {first ? (
          <div className="rounded-2xl border border-[#F3C4C4] bg-[#FEF5F5] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FDE4E4] text-danger"
              >
                <TriangleAlert size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-danger">
                  Fix this first
                </div>
                <div className="mt-0.5 text-[16px] font-semibold text-ink">{first.title}</div>
                <p className="m-0 mt-1 text-[13px] text-muted">
                  {first.kind === 'issue'
                    ? 'A blocking issue stops this Brain from being saved, so nothing below it counts until it is fixed.'
                    : 'Contradictory information makes answers unreliable and holds back higher stages.'}
                </p>
                <p className="m-0 mt-1 text-[12.5px] text-muted">
                  Where: <b className="text-ink">{SECTION_LABEL[first.sec] ?? first.sec}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onGoTo(first.sec, true)}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border-none bg-danger px-3.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[#A82828] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger motion-reduce:transition-none"
              >
                Fix
                <ArrowRight size={14} aria-hidden />
              </button>
            </div>
            {rest.length > 0 && (
              <div className="mt-3 border-t border-[#F3C4C4] pt-2.5">
                <button
                  type="button"
                  aria-expanded={showAllFixes}
                  onClick={() => setShowAllFixes((v) => !v)}
                  className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-medium text-[#8F2424] underline underline-offset-2"
                >
                  {showAllFixes ? 'Hide' : 'Show'} {rest.length} more issue
                  {rest.length === 1 ? '' : 's'}
                </button>
                {showAllFixes && (
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                    {rest.map((r) => (
                      <li
                        key={`${r.kind}:${r.title}`}
                        className="flex items-start gap-3 text-[13px]"
                      >
                        <span className="min-w-0 flex-1 text-ink">
                          {r.title}{' '}
                          <span className="text-muted">· {SECTION_LABEL[r.sec] ?? r.sec}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onGoTo(r.sec, true)}
                          className="shrink-0 cursor-pointer border-none bg-transparent p-0 font-semibold text-primary"
                        >
                          Fix
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-[#BFE6CD] bg-[#F2FBF5] p-4">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#DDF3E5] text-[#16A34A]"
            >
              <Check size={18} />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-ink">No blocking issues</div>
              <p className="m-0 text-[12.5px] text-muted">
                Your Brain is valid and can be saved. Nothing needs fixing first.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 6. Knowledge Readiness */}
      <section
        aria-label="Knowledge readiness card"
        className="rounded-2xl border border-line bg-white p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Ring value={pct} color="#5B5CE2" size={88} stroke={9} caption={null} />
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="m-0 text-[15px] font-semibold">Knowledge readiness</h2>
              <span className="text-2xl font-metric tabular-nums">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Knowledge readiness"
              className="mt-2 h-2 overflow-hidden rounded-full bg-wash-2"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#5B5CE2] to-[#8B5CF6] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="m-0 mt-2 text-xs text-faint">
              Readiness measures how complete your configuration is — not whether the information is
              correct.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Category-wise Readiness */}
      <section aria-label="Category readiness" className="flex flex-col gap-2">
        <Heading>Category readiness</Heading>
        <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {areaList.map((a) => {
            const c = CATEGORY[a.key];
            if (!c) return null;
            const Icon = c.icon;
            const done = a.pct >= 1 && !a.review;
            const pctRound = Math.round(a.pct * 100);
            return (
              <li key={a.key}>
                <button
                  type="button"
                  onClick={() => onGoTo(a.sec, true)}
                  aria-label={`${c.title}, ${pctRound}% complete`}
                  className="flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl border border-line bg-white p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-line-input hover:shadow-[0_2px_10px_-4px_rgba(23,24,28,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                      style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {c.title}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-ink">
                      {pctRound}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-wash-2" aria-hidden>
                    <div
                      className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                      style={{ width: `${pctRound}%`, backgroundColor: c.color }}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-[11.5px] text-muted">
                    {a.review ? (
                      <>
                        <TriangleAlert size={12} aria-hidden className="text-warning" /> Needs
                        review
                      </>
                    ) : done ? (
                      <>
                        <Check size={12} aria-hidden className="text-success" /> Complete
                      </>
                    ) : pctRound === 0 ? (
                      'Not started'
                    ) : (
                      'In progress'
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 8. Recommended Next */}
      <section aria-label="Recommended next" className="flex flex-col gap-2">
        <Heading>Recommended next</Heading>
        {recs.length === 0 ? (
          <p className="m-0 rounded-xl bg-wash px-3 py-2.5 text-[13px] text-muted">
            Nothing left to recommend. Your setup looks complete; new suggestions appear if
            something changes.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recs.map(({ a, p }) => {
              const c = CATEGORY[a.key];
              return (
                <li
                  key={a.key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3"
                >
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted"
                    title={`${p} priority`}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PRIORITY_DOT[p] }}
                    />
                    {p}
                  </span>
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="text-[13.5px] font-semibold text-ink">{a.rec}</div>
                    {c && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{c.why}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoTo(a.sec, true)}
                    className={cn(
                      'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-white px-3 text-[12.5px] font-semibold text-primary transition-colors duration-150 hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    )}
                  >
                    Fix
                    <ArrowRight size={13} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
