import type { LeadStage } from '@torio/database';

export const SCORE_VERSION = 'rules-v1';

export interface ScoreInput {
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  dealValue?: number | null;
  customerId?: string | null;
  stage: LeadStage;
}

const STAGE_POINTS: Record<LeadStage, number> = {
  NEW: 0,
  CONTACTED: 10,
  QUALIFIED: 20,
  PROPOSAL: 30,
  WON: 35,
  LOST: 0,
};

/**
 * Transparent, rules-based lead score (0–100). NOT a prediction and NOT AI-generated.
 *
 *   email 15 · phone 15 · company 10 · job title 5 · deal value > 0: 10 · linked to an Inbox customer: 10
 *   + stage: New 0 · Contacted 10 · Qualified 20 · Proposal 30 · Won 35 · Lost 0
 *   Lost leads are capped at 10. Result is clamped to 0–100.
 *
 * It measures how complete and advanced a lead is, nothing more. Bump SCORE_VERSION when rules change.
 */
export function computeLeadScore(l: ScoreInput): number {
  let score = STAGE_POINTS[l.stage];
  if (l.email) score += 15;
  if (l.phone) score += 15;
  if (l.company) score += 10;
  if (l.jobTitle) score += 5;
  if ((l.dealValue ?? 0) > 0) score += 10;
  if (l.customerId) score += 10;
  if (l.stage === 'LOST') score = Math.min(score, 10);
  return Math.max(0, Math.min(100, score));
}
