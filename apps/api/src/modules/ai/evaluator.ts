import type { AiWeights, BrainConfig } from '@torio/contracts';

/**
 * Internal, heuristic scoring of a candidate reply. These are signals for ranking and for deciding when a person must look closer;
 * they are not a measure of factual correctness. Knowledge accuracy in particular only checks that the figures a reply states
 * (prices, amounts, delivery times) appear in the business knowledge it was given.
 */
export interface Scores {
  relevance: number;
  knowledge: number;
  instructions: number;
  completeness: number;
  clarity: number;
  safety: number;
}
export interface Evaluation {
  scores: Scores;
  overall: number;
  /** Figures stated in the reply that the business knowledge does not contain. */
  ungrounded: string[];
  findings: string[];
  leaked: boolean;
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Bengali digits to ASCII, so "৫০০" and "500" are the same figure. */
const ascii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
/** Text for matching figures: ASCII digits and no thousands separators, so "25,000" and "25000" are the same. */
const plain = (s: string) => ascii(s).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');

/** Money and duration figures in a text, normalised ("1,500" and "1500" match; Bengali digits are converted). */
export function figures(text: string): string[] {
  const t = ascii(text);
  const out = new Set<string>();
  // An amount: a number next to a currency mark, or a number of days/hours.
  const money =
    /(?:৳|\$|tk\.?|taka|bdt|usd)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:৳|tk\b|taka|bdt|usd|dollars?)/gi;
  for (const m of t.matchAll(money)) out.add(num(m[1] ?? m[2]!));
  const time =
    /(\d+(?:\s*[-–]\s*\d+)?)\s*(?:working\s+|business\s+)?(?:days?|hours?|hrs?|দিন|ঘণ্টা|ঘন্টা)/gi;
  for (const m of t.matchAll(time)) out.add(`t${m[1]!.replace(/\s+/g, '')}`);
  const pct = /(\d+(?:\.\d+)?)\s*%/g;
  for (const m of t.matchAll(pct)) out.add(`p${m[1]}`);
  return [...out];
}
const num = (s: string) => s.replace(/,/g, '').replace(/\.0+$/, '');

/** Whether a figure from a reply is present in the knowledge text. */
function grounded(fig: string, knowledgeFigures: Set<string>, knowledgeAscii: string): boolean {
  if (knowledgeFigures.has(fig)) return true;
  const raw = fig.replace(/^[tp]/, '');
  // A range like "2-3" is grounded when the knowledge states the same range.
  return (
    raw.length > 0 &&
    new RegExp(`(^|[^\\d])${raw.replace(/[-–]/g, '\\s*[-–]\\s*')}([^\\d]|$)`).test(knowledgeAscii)
  );
}

const LEAK =
  /(BUSINESS KNOWLEDGE|=== (INSTRUCTIONS|CONVERSATION|DRAFT|TASK)|system prompt|my instructions|\bsk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})/i;
const AI_TELL = /as an ai (language )?model|i am an ai|i'm an ai/i;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function evaluate(i: {
  reply: string;
  lastCustomerMessage: string;
  knowledge: string;
  brain: BrainConfig;
  weights: AiWeights;
}): Evaluation {
  const { reply, brain } = i;
  const findings: string[] = [];
  const kAscii = plain(i.knowledge);
  const kFigs = new Set(figures(i.knowledge));

  // Relevance: shares substance with what the customer asked.
  const ask = new Set(words(i.lastCustomerMessage));
  const ans = new Set(words(reply));
  const shared = [...ask].filter((w) => ans.has(w)).length;
  const relevance = ask.size === 0 ? 70 : clamp(45 + (shared / Math.min(ask.size, 8)) * 55);

  // Knowledge accuracy: every figure the reply states must come from the knowledge.
  const claimed = figures(reply);
  const ungrounded = claimed.filter((f) => !grounded(f, kFigs, kAscii));
  const knowledge = claimed.length === 0 ? 85 : clamp(100 - ungrounded.length * 35);
  if (ungrounded.length)
    findings.push(`States ${ungrounded.length} figure(s) not found in the business knowledge.`);

  // Instruction compliance: language, things to avoid, forbidden promises.
  let instructions = 100;
  const bnShare =
    (reply.match(/[ঀ-৿]/g) ?? []).length / Math.max(1, reply.replace(/\s/g, '').length);
  if (brain.voice.language === 'Bengali' && bnShare < 0.3) {
    instructions -= 30;
    findings.push('Not in Bengali, which the brand voice requires.');
  }
  if (brain.voice.language === 'English' && bnShare > 0.5) {
    instructions -= 30;
    findings.push('Not in English, which the brand voice requires.');
  }
  for (const a of brain.voice.avoid
    .split(/[,\n;]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length >= 3))
    if (reply.toLowerCase().includes(a)) {
      instructions -= 20;
      findings.push(`Uses a term the brand avoids ("${a}").`);
    }
  if (
    !brain.rules.promises &&
    /\b(guarantee|guaranteed|promise|100%|definitely will)\b/i.test(reply)
  ) {
    instructions -= 25;
    findings.push('Makes a promise or guarantee, which the rules forbid.');
  }
  if (!brain.rules.competitors && /competitor/i.test(reply)) instructions -= 15;

  // Completeness: answers with enough substance.
  const wc = reply.split(/\s+/).filter(Boolean).length;
  const completeness = wc < 5 ? 35 : wc < 12 ? 65 : wc <= 220 ? 90 : 70;

  // Clarity: readable sentence length, no repetition, no markdown scaffolding.
  const sentences = reply.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const avg = wc / Math.max(1, sentences.length);
  const dupes = sentences.length - new Set(sentences.map((s) => s.trim().toLowerCase())).size;
  let clarity = avg <= 28 ? 92 : avg <= 40 ? 75 : 55;
  clarity -= dupes * 15;
  if (/^#{1,6}\s|\*\*/m.test(reply)) clarity -= 15;

  // Safety: no leaked instructions or secrets, no AI boilerplate.
  const leaked = LEAK.test(reply);
  let safety = leaked ? 0 : 100;
  if (AI_TELL.test(reply)) safety -= 40;
  if (leaked) findings.push('Reply appears to expose internal instructions or a secret.');

  const scores: Scores = {
    relevance,
    knowledge,
    instructions: clamp(instructions),
    completeness,
    clarity: clamp(clarity),
    safety: clamp(safety),
  };
  const w = i.weights;
  const total =
    w.relevance + w.knowledge + w.instructions + w.completeness + w.clarity + w.safety || 1;
  const overall = clamp(
    (scores.relevance * w.relevance +
      scores.knowledge * w.knowledge +
      scores.instructions * w.instructions +
      scores.completeness * w.completeness +
      scores.clarity * w.clarity +
      scores.safety * w.safety) /
      total,
  );
  return { scores, overall, ungrounded, findings, leaked };
}

/**
 * Where two candidates disagree. A figure stated by only one of them, and not backed by the business knowledge, is a conflict.
 * Agreement is not trusted either: a figure both state but the knowledge lacks is reported as unsupported.
 */
export function compare(a: string, b: string, knowledge: string) {
  const kAscii = plain(knowledge);
  const kFigs = new Set(figures(knowledge));
  const fa = new Set(figures(a));
  const fb = new Set(figures(b));
  const conflicts: string[] = [];
  const unsupported: string[] = [];
  for (const f of new Set([...fa, ...fb])) {
    const ok = grounded(f, kFigs, kAscii);
    const both = fa.has(f) && fb.has(f);
    if (!ok && both) unsupported.push(f);
    if (!ok && !both) conflicts.push(f);
  }
  const supported = [...new Set([...fa, ...fb])].filter((f) => grounded(f, kFigs, kAscii));
  return { conflicts, unsupported, supported };
}

/** A figure as people read it, for warnings ("t2-3" is "2-3 days"). */
export const describeFigure = (f: string) =>
  f.startsWith('t') ? `${f.slice(1)} day/hour period` : f.startsWith('p') ? `${f.slice(1)}%` : f;
