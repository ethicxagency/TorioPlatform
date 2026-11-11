'use client';

import type { BrainMaturity, SectionKey, Stage } from '@torio/contracts';
import { STAGES } from '@torio/contracts';
import {
  ArrowRight,
  BookOpenText,
  Brain,
  Check,
  Clock,
  Gauge,
  ListChecks,
  Puzzle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtAgoIso } from './bits';
import { DIMENSION_INFO, STAGE_META } from './stage-meta';

/** The "brain" illustration: a layered rounded-square with soft indigo, violet and blue light. Decorative. */
function BrainIllustration() {
  return (
    <div aria-hidden className="relative h-[104px] w-[104px] shrink-0 sm:h-[112px] sm:w-[112px]">
      <span className="absolute -left-2 top-3 h-14 w-14 rounded-full bg-[#7C4DE8]/25 blur-xl" />
      <span className="absolute -right-2 bottom-1 h-14 w-14 rounded-full bg-[#2B8FD9]/25 blur-xl" />
      <span className="absolute inset-0 rounded-[30px] border border-primary-line bg-gradient-to-br from-[#F0F0FF] via-[#F3EEFF] to-[#E8F3FC]" />
      <span className="absolute inset-[9px] rounded-[23px] bg-white shadow-[0_6px_20px_-6px_rgba(91,92,226,0.35)]" />
      <span className="absolute inset-0 flex items-center justify-center">
        <Brain size={54} strokeWidth={1.5} className="text-primary" />
      </span>
      <span className="absolute right-[18px] top-[18px] h-2 w-2 rounded-full bg-[#7C4DE8]" />
    </div>
  );
}

/** Donut progress, animated from empty on first paint. The number in the middle is the real score. */
function Ring({ value, color, size = 132 }: { value: number; color: string; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(t);
  }, [value]);
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#EEF0F4"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
          {value}
        </span>
        <span className="mt-1 text-[11px] font-medium text-muted">of 100</span>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  bar,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: 'warn' | 'ok';
  bar?: number;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-1 rounded-xl border bg-white p-3',
        tone === 'warn' ? 'border-[#F3C4C4] bg-danger-soft/50' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
        <Icon size={13} aria-hidden className={tone === 'warn' ? 'text-danger' : 'text-primary'} />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[19px] font-semibold leading-tight tabular-nums text-ink">{value}</div>
      {bar !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-wash-2" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${bar}%` }}
          />
        </div>
      )}
      <div className="text-[11.5px] leading-snug text-faint">{hint}</div>
    </div>
  );
}

/**
 * The Brain hero: identity, intelligence score and stage, the real statistics, the four intelligence dimensions, the
 * growth journey and the one next step. Everything shown comes from the SAVED Brain (`maturity`, evaluated by the server
 * with the shared engine); only the issue count is live, because it describes what currently blocks a save.
 */
export function BrainHero({
  maturity: m,
  liveIssues,
  dirty,
  savedAt,
  savedBy,
  actions,
  onGoTo,
}: {
  maturity: BrainMaturity;
  liveIssues: number;
  dirty: boolean;
  savedAt: string | null;
  savedBy: string | null;
  actions: React.ReactNode;
  onGoTo: (section: SectionKey) => void;
}) {
  const meta = STAGE_META[m.stage];
  const next = m.nextStage ? STAGE_META[m.nextStage] : null;
  const top = m.recommendations[0] ?? null;
  const StageIcon = meta.icon;

  return (
    <section aria-label="Brain overview" className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          {/* left: identity */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-start gap-4">
              <BrainIllustration />
              <div className="min-w-0 pt-1">
                <h1 className="m-0 font-page-title">Brain</h1>
                <p className="m-0 text-sm font-medium text-primary-hover">
                  Your business. Your rules. Your AI.
                </p>
                <p className="m-0 mt-1.5 max-w-[520px] text-[13.5px] text-muted">
                  Teach Torio how your business works, what your customers need, and how your AI
                  should respond.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>

          {/* right: intelligence + maturity */}
          <div
            className="flex min-w-0 flex-col gap-4 rounded-xl border border-line-subtle p-4 sm:flex-row sm:items-center"
            style={{ background: `linear-gradient(135deg, ${meta.tint}, #FFFFFF 70%)` }}
          >
            <div className="mx-auto sm:mx-0">
              <div
                role="img"
                aria-label={`Brain intelligence score ${m.score} out of 100, stage ${meta.label}`}
              >
                <Ring value={m.score} color={meta.color} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="maturity-stage"
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  <StageIcon size={13} aria-hidden />
                  {m.stage}
                </span>
                <span className="text-xs text-muted">Intelligence score</span>
              </div>
              <p className="m-0 mt-2 text-[13.5px] text-ink">{meta.now}</p>
              {next ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted">
                    <span>
                      Next: <b className="text-ink">{next.label}</b>
                    </span>
                    <span className="tabular-nums">{Math.round(m.progressToNext * 100)}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Progress to ${next.label}`}
                    aria-valuenow={Math.round(m.progressToNext * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-line-subtle"
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
                      style={{ width: `${m.progressToNext * 100}%`, backgroundColor: next.color }}
                    />
                  </div>
                  {m.requirements.length > 0 && (
                    <ul className="m-0 mt-2.5 flex list-none flex-col gap-1 p-0">
                      {m.requirements.slice(0, 3).map((r) => (
                        <li
                          key={r.id}
                          className="flex items-start gap-1.5 text-[12.5px] text-muted"
                        >
                          <span
                            aria-hidden
                            className="mt-[6px] h-1 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: next.color }}
                          />
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="m-0 mt-2 text-[12.5px] text-muted">
                  You have reached the highest stage. Keep your knowledge current to stay here.
                </p>
              )}
            </div>
          </div>
        </div>
        {dirty && (
          <p className="m-0 border-t border-line-subtle bg-[#FBFBFC] px-5 py-2 text-xs text-muted">
            Scores describe your last saved Brain. Unsaved changes count once you save.
          </p>
        )}
      </div>

      {/* statistics */}
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 xl:grid-cols-6">
        <li>
          <Stat
            icon={Gauge}
            label="Setup completion"
            value={`${m.setupCompletion}%`}
            bar={m.setupCompletion}
            hint="Recommended setup filled in"
          />
        </li>
        <li>
          <Stat
            icon={ListChecks}
            label="Active rules"
            value={m.stats.activeRules}
            hint="Business rules guiding AI"
          />
        </li>
        <li>
          <Stat
            icon={Puzzle}
            label="Custom fields"
            value={m.stats.customFields}
            hint="Extra business context"
          />
        </li>
        <li>
          <Stat
            icon={BookOpenText}
            label="Knowledge base"
            value={m.stats.activeFaqs}
            hint={`Active FAQ${m.stats.activeFaqs === 1 ? '' : 's'} answering customers`}
          />
        </li>
        <li>
          <Stat
            icon={liveIssues > 0 ? TriangleAlert : Check}
            label="Issues"
            value={liveIssues}
            tone={liveIssues > 0 ? 'warn' : 'ok'}
            hint={liveIssues > 0 ? 'Fix before saving' : 'Configuration valid'}
          />
        </li>
        <li>
          <Stat
            icon={Clock}
            label="Last saved"
            value={<span className="text-[15px]">{savedAt ? fmtAgoIso(savedAt) : 'Never'}</span>}
            hint={savedAt ? (savedBy ? `by ${savedBy}` : 'Saved') : 'Not saved yet'}
          />
        </li>
      </ul>

      {/* the four intelligence dimensions */}
      <ul
        aria-label="Intelligence dimensions"
        className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-4"
      >
        {m.dimensions.map((x) => (
          <li key={x.key} className="rounded-xl border border-line bg-white p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">{x.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-ink">
                {x.score}
                <span className="font-normal text-faint">/100</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={x.label}
              aria-valuenow={x.score}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash-2"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${x.score}%`, opacity: 0.45 + x.score / 190 }}
              />
            </div>
            <p className="m-0 mt-2 text-[12px] leading-snug text-muted">{DIMENSION_INFO[x.key]}</p>
          </li>
        ))}
      </ul>

      {/* growth journey */}
      <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <h2 className="m-0 text-[15px] font-semibold">Your Brain&apos;s Growth Journey</h2>
        <ol
          aria-label="Growth journey"
          className="m-0 mt-3 flex list-none gap-2 overflow-x-auto p-0 pb-1 [scrollbar-width:none] md:grid md:grid-cols-6 md:overflow-visible"
        >
          {STAGES.map((s: Stage, i) => {
            const sm = STAGE_META[s];
            const Icon = sm.icon;
            const state = i < m.stageIndex ? 'done' : i === m.stageIndex ? 'current' : 'locked';
            return (
              <li
                key={s}
                aria-current={state === 'current' ? 'step' : undefined}
                data-state={state}
                className={cn(
                  'flex min-w-[148px] flex-1 flex-col gap-1.5 rounded-xl border p-3 transition-colors duration-200 motion-reduce:transition-none md:min-w-0',
                  state === 'locked' && 'border-line-subtle bg-white opacity-70',
                  state === 'done' && 'border-line-subtle',
                  state === 'current' && 'shadow-[0_0_0_3px_var(--ring)]',
                )}
                style={
                  {
                    '--ring': `${sm.color}26`,
                    backgroundColor: state === 'locked' ? undefined : sm.tint,
                    borderColor: state === 'current' ? sm.color : undefined,
                  } as React.CSSProperties
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                    style={{
                      backgroundColor: state === 'locked' ? '#EEF0F4' : sm.color,
                      color: state === 'locked' ? '#9A9DA6' : '#fff',
                    }}
                  >
                    {state === 'done' ? (
                      <Check size={16} aria-hidden />
                    ) : (
                      <Icon size={16} aria-hidden />
                    )}
                  </span>
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted">
                    {state === 'done' ? 'Done' : state === 'current' ? 'You are here' : 'Locked'}
                  </span>
                </div>
                <div className="text-[13px] font-semibold text-ink">{sm.label}</div>
                <div className="text-[11.5px] leading-snug text-muted">{sm.blurb}</div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* next step */}
      {top && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-2xl border p-4 sm:p-5',
            top.severity === 'critical'
              ? 'border-[#F3C4C4] bg-danger-soft/40'
              : 'border-primary-line bg-primary-tint',
          )}
        >
          <div className="min-w-0 flex-1 basis-72">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
              {top.severity === 'critical' ? 'Fix this first' : 'Your next step'}
            </div>
            <div className="mt-0.5 text-[14.5px] font-semibold text-ink">{top.title}</div>
            <p className="m-0 mt-0.5 text-[13px] text-muted">{top.why}</p>
            {m.recommendations.length > 1 && (
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px] text-muted">
                {m.recommendations.slice(1, 4).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onGoTo(r.section)}
                      className="cursor-pointer border-none bg-transparent p-0 text-left text-muted underline decoration-line underline-offset-2 hover:text-ink"
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => onGoTo(top.section)}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-none bg-primary px-4 text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            {top.cta}
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
