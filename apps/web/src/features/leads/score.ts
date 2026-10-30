export type ScoreBand = 'low' | 'medium' | 'high';

export const scoreBand = (score: number): ScoreBand =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

export const SCORE_STYLE: Record<ScoreBand, { label: string; color: string; bar: string }> = {
  low: { label: 'Low', color: '#62656D', bar: '#B7B9C0' },
  medium: { label: 'Medium', color: '#A15C00', bar: '#D98A00' },
  high: { label: 'High', color: '#16803A', bar: '#16A34A' },
};

export const SCORE_HELP =
  'Rules-based score (not an AI prediction): contact completeness, deal value, linked conversation and pipeline stage.';
