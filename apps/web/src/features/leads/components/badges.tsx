import { Globe, Upload, UserPen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCORE_HELP, SCORE_STYLE, scoreBand } from '../score';
import { SOURCE, STAGE } from '../constants';
import type { LeadSource, LeadStage } from '../types';

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const s = STAGE[stage];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ background: s.bg, color: s.color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: LeadSource }) {
  const s = SOURCE[source];
  const Icon =
    source === 'WEBSITE'
      ? Globe
      : source === 'IMPORT'
        ? Upload
        : source === 'MANUAL'
          ? UserPen
          : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink">
      {Icon ? (
        <Icon size={13} style={{ color: s.color }} aria-hidden />
      ) : (
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
      )}
      {s.label}
    </span>
  );
}

/** Bar + number + text label, so the score is never communicated by colour alone. */
export function ScoreIndicator({
  score,
  showLabel = true,
}: {
  score: number;
  showLabel?: boolean;
}) {
  const st = SCORE_STYLE[scoreBand(score)];
  return (
    <span className="inline-flex items-center gap-2" title={SCORE_HELP}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-wash-2" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${score}%`, background: st.bar }}
        />
      </span>
      <span className="text-[13px] font-semibold tabular-nums">{score}</span>
      {showLabel && (
        <span className="text-xs" style={{ color: st.color }}>
          {st.label}
        </span>
      )}
      <span className="sr-only">
        Lead score {score} of 100, {st.label}
      </span>
    </span>
  );
}
