'use client';

import type { BrainMaturity, Stage } from '@torio/contracts';
import { STAGES } from '@torio/contracts';
import { ArrowRight, Brain, Check, type LucideIcon } from 'lucide-react';
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

export function Journey({ m }: { m: BrainMaturity }) {
  return (
    <ol
      aria-label="Growth journey"
      className="m-0 flex list-none gap-3.5 overflow-x-auto p-0 pb-1 [scrollbar-width:none] md:grid md:grid-cols-6 md:overflow-visible"
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
              'relative flex min-w-[148px] flex-1 flex-col gap-1.5 rounded-xl border p-3 transition-colors duration-200 motion-reduce:transition-none md:min-w-0',
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
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className="absolute -right-[15px] top-[27px] z-10 hidden h-0.5 w-[14px] md:block"
                style={{
                  backgroundColor: i < m.stageIndex ? STAGE_META[STAGES[i + 1]!].color : '#E5E7EB',
                }}
              />
            )}
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
