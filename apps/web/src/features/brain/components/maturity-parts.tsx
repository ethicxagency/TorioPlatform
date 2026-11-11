'use client';

import type { BrainMaturity, SectionKey, Stage } from '@torio/contracts';
import { STAGE_MIN, STAGES } from '@torio/contracts';
import { ArrowRight, Brain, Check, Lock, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { DIMENSION_INFO, STAGE_META } from './stage-meta';

/**
 * Pieces of the Brain maturity display, shared by the Summary tab (compact) and the Intelligence tab (full). Everything is
 * drawn from the SAVED Brain's `maturity`, evaluated by the server with the shared engine.
 */

/** The "brain" illustration: a layered rounded-square with soft indigo, violet and blue light. Decorative. */
export function BrainIllustration({ size = 112 }: { size?: number }) {
  const icon = Math.round(size * 0.48);
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="absolute -left-1 top-2 h-1/2 w-1/2 rounded-full bg-[#7C4DE8]/25 blur-xl" />
      <span className="absolute -right-1 bottom-0 h-1/2 w-1/2 rounded-full bg-[#2B8FD9]/25 blur-xl" />
      <span
        className="absolute inset-0 border border-primary-line bg-gradient-to-br from-[#F0F0FF] via-[#F3EEFF] to-[#E8F3FC]"
        style={{ borderRadius: size * 0.27 }}
      />
      <span
        className="absolute bg-white shadow-[0_6px_20px_-6px_rgba(91,92,226,0.35)]"
        style={{ inset: size * 0.08, borderRadius: size * 0.2 }}
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <Brain size={icon} strokeWidth={1.5} className="text-primary" />
      </span>
    </div>
  );
}

/** Donut progress, animated from empty on first paint. The number in the middle is the real value. */
export function Ring({
  value,
  color,
  size = 132,
  stroke = 11,
  caption = 'of 100',
  showValue = true,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  caption?: string | null;
  /** false: draw the donut only (the number is shown beside it). */
  showValue?: boolean;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(t);
  }, [value]);
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
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center',
          !showValue && 'hidden',
        )}
      >
        <span
          className="font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink"
          style={{ fontSize: size * 0.26 }}
        >
          {value}
        </span>
        {caption && <span className="mt-1 text-[11px] font-medium text-muted">{caption}</span>}
      </div>
    </div>
  );
}

export function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  bar,
  accent = '#5B5CE2',
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'warn' | 'ok';
  bar?: number;
  /** The card's accent: tints the icon and the bar. */
  accent?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-1.5 rounded-xl border bg-white p-3 transition-[border-color,box-shadow] duration-150 hover:shadow-[0_2px_10px_-4px_rgba(23,24,28,0.12)] motion-reduce:transition-none',
        tone === 'warn' ? 'border-[#F3C4C4]' : 'border-line hover:border-line-input',
      )}
    >
      <div className="flex items-center gap-2 text-[11.5px] font-medium text-muted">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={13} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[21px] font-semibold leading-tight tabular-nums text-ink">{value}</div>
      {bar !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-wash-2" aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${bar}%`, backgroundColor: accent }}
          />
        </div>
      )}
      {hint && <div className="text-[11.5px] leading-snug text-faint">{hint}</div>}
    </div>
  );
}

/** Stage badge + the explanation, next stage and what is still needed for it. */
export function MaturityCard({
  m,
  ringSize = 132,
  maxRequirements = 3,
}: {
  m: BrainMaturity;
  ringSize?: number;
  maxRequirements?: number;
}) {
  const meta = STAGE_META[m.stage];
  const next = m.nextStage ? STAGE_META[m.nextStage] : null;
  const StageIcon = meta.icon;
  return (
    <div
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line-subtle p-4 sm:flex-row sm:items-center"
      style={{ background: `linear-gradient(135deg, ${meta.tint}, #FFFFFF 70%)` }}
    >
      <div className="mx-auto sm:mx-0">
        <div
          role="img"
          aria-label={`Brain intelligence score ${m.score} out of 100, stage ${meta.label}`}
        >
          <Ring value={m.score} color={meta.color} size={ringSize} />
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
                {m.requirements.slice(0, maxRequirements).map((r) => (
                  <li key={r.id} className="flex items-start gap-1.5 text-[12.5px] text-muted">
                    <span
                      aria-hidden
                      className="mt-[6px] h-1 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: next.color }}
                    />
                    {r.label}
                  </li>
                ))}
                {m.requirements.length > maxRequirements && (
                  <li className="text-[12px] text-faint">
                    +{m.requirements.length - maxRequirements} more
                  </li>
                )}
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
  );
}

/** The four intelligence dimensions. `compact` drops the explanations (Summary); the full list explains each (Intelligence). */
export function Dimensions({ m, compact }: { m: BrainMaturity; compact?: boolean }) {
  return (
    <ul
      aria-label="Intelligence dimensions"
      className={cn(
        'm-0 grid list-none gap-2.5 p-0',
        compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
      )}
    >
      {m.dimensions.map((x) => (
        <li
          key={x.key}
          className={cn('rounded-xl border border-line bg-white', compact ? 'p-3' : 'p-3.5')}
        >
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
          {!compact && (
            <p className="m-0 mt-2 text-[12px] leading-snug text-muted">{DIMENSION_INFO[x.key]}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The score range a stage covers, read from the engine's own thresholds (never hardcoded here). */
const rangeOf = (i: number) => {
  const lo = STAGE_MIN[STAGES[i]!];
  const next = STAGES[i + 1];
  return `${lo}–${next ? STAGE_MIN[next] - 1 : 100}`;
};

/** A stage's icon, in its own container colour, with its own animation while it is the current stage. */
function StageNode({
  stage,
  state,
  celebrate,
}: {
  stage: Stage;
  state: 'done' | 'current' | 'locked';
  celebrate: boolean;
}) {
  const sm = STAGE_META[stage];
  const Icon = sm.icon;
  const live = state === 'current';
  return (
    <span className="relative inline-flex shrink-0">
      <span
        data-stage-icon={stage}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[12px]',
          live && sm.anim !== 'smart' && 'stage-halo',
          live && sm.anim === 'born' && 'stage-anim-born',
          live && sm.anim === 'baby' && 'stage-anim-baby',
          live && sm.anim === 'growing' && 'stage-anim-growing',
          live && sm.anim === 'smart' && 'stage-anim-smart',
          celebrate && 'stage-unlock',
        )}
        style={
          {
            backgroundColor: state === 'locked' ? '#F1F2F5' : sm.iconBg,
            color: state === 'locked' ? '#A3A6AE' : sm.color,
            '--halo': `${sm.color}2B`,
          } as React.CSSProperties
        }
      >
        <Icon size={19} aria-hidden />
        {live && sm.anim === 'expert' && (
          <span aria-hidden className="stage-anim-expert absolute inset-0" />
        )}
      </span>
      {live && sm.anim === 'mature' && (
        <span
          aria-hidden
          className="stage-anim-mature-ring pointer-events-none absolute -inset-1.5"
        >
          <span
            className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: sm.color }}
          />
        </span>
      )}
      {state === 'done' && (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-white"
          style={{ backgroundColor: sm.color }}
        >
          <Check size={9} strokeWidth={3} />
        </span>
      )}
      {state === 'locked' && (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#A3A6AE] text-white"
        >
          <Lock size={8} strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

/** Click a stage to see what it means, what it needs, and (for the current and next stage) what to do about it. */
function StageDetail({
  m,
  index,
  onGoTo,
}: {
  m: BrainMaturity;
  index: number;
  onGoTo?: (section: SectionKey) => void;
}) {
  const stage = STAGES[index]!;
  const sm = STAGE_META[stage];
  const Icon = sm.icon;
  const state = index < m.stageIndex ? 'done' : index === m.stageIndex ? 'current' : 'locked';
  const gates = m.gates.filter((g) => g.stage === stage);
  const scoreOk = m.score >= STAGE_MIN[stage];
  const isNext = index === m.stageIndex + 1;
  const remaining =
    state === 'current'
      ? m.requirements
      : state === 'locked'
        ? [
            ...(scoreOk
              ? []
              : [
                  {
                    id: 'score',
                    label: `Raise your intelligence score from ${m.score} to ${STAGE_MIN[stage]}`,
                    section: null,
                  },
                ]),
            ...gates
              .filter((g) => !g.met)
              .map((g) => ({ id: g.id, label: g.label, section: g.section })),
          ]
        : [];
  const stats = m.stats;
  const knows = [
    stats.products > 0 && `${stats.products} product${stats.products === 1 ? '' : 's'}`,
    stats.activeFaqs > 0 && `${stats.activeFaqs} active FAQ${stats.activeFaqs === 1 ? '' : 's'}`,
    stats.activeRules > 0 &&
      `${stats.activeRules} active rule${stats.activeRules === 1 ? '' : 's'}`,
    stats.activeInstructions > 0 &&
      `${stats.activeInstructions} active instruction${stats.activeInstructions === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[];
  const recs = state === 'current' || isNext ? m.recommendations.slice(0, 3) : [];

  return (
    <div
      role="region"
      aria-label={`${sm.label} stage details`}
      data-testid="stage-detail"
      className="mt-3 rounded-xl border p-4 animate-fade-in motion-reduce:animate-none"
      style={{ borderColor: `${sm.color}55`, backgroundColor: sm.tint }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: sm.iconBg, color: sm.color }}
        >
          <Icon size={16} aria-hidden />
        </span>
        <h3 className="m-0 text-[14.5px] font-semibold text-ink">{sm.label}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
          style={
            state === 'locked'
              ? { backgroundColor: '#EEF0F4', color: '#62656D' }
              : { backgroundColor: sm.color, color: '#fff' }
          }
        >
          {state === 'done' ? 'Completed' : state === 'current' ? 'You are here' : 'Locked'}
        </span>
        <span className="text-xs text-muted">Score {rangeOf(index)}</span>
      </div>
      <p className="m-0 mt-2 text-[13px] text-ink">{sm.now}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            What your Brain understands
          </div>
          {state === 'locked' ? (
            <p className="m-0 text-[12.5px] text-muted">
              Not yet. This stage is locked until its requirements are met.
            </p>
          ) : knows.length ? (
            <p className="m-0 text-[12.5px] text-ink">{knows.join(' · ')}</p>
          ) : (
            <p className="m-0 text-[12.5px] text-muted">
              Very little so far. Add business knowledge to teach it.
            </p>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            Requirements for this stage
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
            {index === 0 ? (
              <li className="text-muted">Every Brain starts here.</li>
            ) : (
              <>
                <li className="flex items-start gap-1.5">
                  <ReqMark ok={scoreOk} color={sm.color} />
                  <span className={scoreOk ? 'text-ink' : 'text-muted'}>
                    Intelligence score {STAGE_MIN[stage]} or more
                  </span>
                </li>
                {gates.map((g) => (
                  <li key={g.id} className="flex items-start gap-1.5">
                    <ReqMark ok={g.met} color={sm.color} />
                    <span className={g.met ? 'text-ink' : 'text-muted'}>{g.label}</span>
                  </li>
                ))}
              </>
            )}
          </ul>
        </div>
      </div>
      {remaining.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: `${sm.color}33` }}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            {state === 'current' ? 'Remaining for the next stage' : 'Still needed to unlock'}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-ink">
            {remaining.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3">
                <span>{r.label}</span>
                {r.section && onGoTo && (
                  <button
                    type="button"
                    onClick={() => onGoTo(r.section!)}
                    className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-primary"
                  >
                    Go
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recs.length > 0 && onGoTo && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: `${sm.color}33` }}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            Recommended
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
            {recs.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3">
                <span className="text-ink">{r.title}</span>
                <button
                  type="button"
                  onClick={() => onGoTo(r.section)}
                  className="shrink-0 cursor-pointer border-none bg-transparent p-0 font-semibold text-primary"
                >
                  {r.cta}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReqMark({ ok, color }: { ok: boolean; color: string }) {
  return ok ? (
    <span
      aria-label="Met"
      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      <Check size={9} strokeWidth={3} />
    </span>
  ) : (
    <span
      aria-label="Not met"
      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#C9CBD3]"
    />
  );
}

/**
 * The six-stage journey. Every stage keeps its own colour identity whether it is completed, current or locked; the
 * connector between stages is filled with real progress (completed segments full, the current one to the engine's own
 * progress toward the next stage). Only the current stage's icon animates, and `celebrate` plays once when a stage was
 * just unlocked.
 */
export function Journey({
  m,
  celebrate,
  onGoTo,
}: {
  m: BrainMaturity;
  celebrate?: Stage | null;
  onGoTo?: (section: SectionKey) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? m.stageIndex;
  return (
    <div>
      <ol
        aria-label="Growth journey"
        className="m-0 flex list-none gap-3.5 overflow-x-auto p-0 pb-1 [scrollbar-width:none] md:grid md:grid-cols-6 md:overflow-visible"
      >
        {STAGES.map((s: Stage, i) => {
          const sm = STAGE_META[s];
          const state = i < m.stageIndex ? 'done' : i === m.stageIndex ? 'current' : 'locked';
          const fill = i < m.stageIndex ? 1 : i === m.stageIndex ? m.progressToNext : 0;
          const selected = sel === i;
          return (
            <li
              key={s}
              aria-current={state === 'current' ? 'step' : undefined}
              data-state={state}
              className="min-w-[160px] flex-1 md:min-w-0"
            >
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${sm.label}, ${state === 'done' ? 'completed' : state === 'current' ? 'you are here' : 'locked'}`}
                onClick={() => setPicked(i === m.stageIndex && picked === null ? null : i)}
                className={cn(
                  'relative flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  state === 'locked' && 'bg-white',
                  state === 'current' && 'shadow-[0_0_0_3px_var(--ring)]',
                )}
                style={
                  {
                    '--ring': `${sm.color}22`,
                    backgroundColor: state === 'locked' ? undefined : sm.tint,
                    borderColor: selected || state === 'current' ? sm.color : '#E5E7EB',
                  } as React.CSSProperties
                }
              >
                <div className="flex items-center">
                  <StageNode stage={s} state={state} celebrate={celebrate === s} />
                  {i < STAGES.length - 1 && (
                    <span
                      aria-hidden
                      data-connector={i}
                      className="relative ml-2 h-[3px] flex-1 overflow-hidden rounded-full bg-[#E5E7EB]"
                      style={{ marginRight: -27 }}
                    >
                      <span
                        className={cn(
                          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 motion-reduce:transition-none',
                          state === 'current' && fill > 0 && fill < 1 && 'stage-track-live',
                        )}
                        style={{ width: `${fill * 100}%`, backgroundColor: sm.color }}
                      />
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink">{sm.label}</span>
                    {celebrate === s && (
                      <span
                        className="rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase text-white animate-fade-in"
                        style={{ backgroundColor: sm.color }}
                      >
                        Unlocked
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] tabular-nums text-faint">Score {rangeOf(i)}</div>
                </div>
                <div className="text-[11.5px] leading-snug text-muted">{sm.blurb}</div>
                <div
                  className="mt-auto flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: state === 'locked' ? '#8A8D96' : sm.color }}
                >
                  {state === 'done' ? (
                    <>
                      <Check size={11} aria-hidden /> Completed
                    </>
                  ) : state === 'current' ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-white"
                      style={{ backgroundColor: sm.color }}
                    >
                      You are here
                    </span>
                  ) : (
                    <>
                      <Lock size={11} aria-hidden /> Locked · needs {STAGE_MIN[s]}+
                    </>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      <StageDetail m={m} index={sel} onGoTo={onGoTo} />
    </div>
  );
}

/** The recommendations, highest priority first. The first is the "next step"; each opens its tab and section. */
export function Recommendations({
  m,
  limit,
  onGoTo,
}: {
  m: BrainMaturity;
  limit: number;
  onGoTo: (section: BrainMaturity['recommendations'][number]['section']) => void;
}) {
  const recs = m.recommendations.slice(0, limit);
  if (!recs.length)
    return (
      <p className="m-0 rounded-xl bg-wash px-3 py-2.5 text-[13px] text-muted">
        Nothing to improve right now. New suggestions appear when your Brain changes.
      </p>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {recs.map((r, i) => (
        <li
          key={r.id}
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border p-3',
            r.severity === 'critical'
              ? 'border-[#F3C4C4] bg-danger-soft/40'
              : i === 0
                ? 'border-primary-line bg-primary-tint'
                : 'border-line bg-white',
          )}
        >
          <div className="min-w-0 flex-1 basis-60">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">
              {r.severity === 'critical'
                ? 'Fix this first'
                : r.severity === 'important'
                  ? 'Needed for the next stage'
                  : 'Improve'}
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{r.title}</div>
            <p className="m-0 mt-0.5 text-[12.5px] text-muted">{r.why}</p>
          </div>
          <button
            type="button"
            onClick={() => onGoTo(r.section)}
            className={cn(
              'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
              i === 0
                ? 'border-none bg-primary text-white hover:bg-primary-hover'
                : 'border border-line bg-white text-ink hover:bg-wash',
            )}
          >
            {r.cta}
            <ArrowRight size={14} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

const DIM_ACCENT: Record<string, string> = {
  quality: '#5B5CE2',
  completeness: '#0F9D8A',
  validity: '#2B8FD9',
  operational: '#7C4DE8',
};

/** The four intelligence dimensions as score cards: a donut, the number out of 100, and what it measures. */
export function QualityCards({ m }: { m: BrainMaturity }) {
  return (
    <ul
      aria-label="Intelligence dimensions"
      className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-4"
    >
      {m.dimensions.map((x) => {
        const accent = DIM_ACCENT[x.key] ?? '#5B5CE2';
        return (
          <li
            key={x.key}
            className="flex items-center gap-3 rounded-xl border border-line bg-white p-3.5 transition-[border-color,box-shadow] duration-150 hover:border-line-input hover:shadow-[0_2px_10px_-4px_rgba(23,24,28,0.12)] motion-reduce:transition-none"
          >
            <div
              role="progressbar"
              aria-label={x.label}
              aria-valuenow={x.score}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <Ring
                value={x.score}
                color={accent}
                size={56}
                stroke={7}
                caption={null}
                showValue={false}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">{x.label}</div>
              <div className="text-[12px] tabular-nums text-muted">
                <b className="text-[18px] text-ink">{x.score}</b>/100
              </div>
              <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-muted">
                {DIMENSION_INFO[x.key]}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
