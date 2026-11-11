import { z } from 'zod';
import {
  areas,
  brainDocumentSchema,
  conflicts,
  filled,
  issuesOf,
  readinessPct,
  ruleCheck,
  cfHasVal,
  type BrainConfig,
} from './brain';

/**
 * Brain maturity: how well Torio actually understands the business, judged on the SAVED Brain document.
 *
 * This is deliberately separate from Setup Completion (`readinessPct`), which only measures how much of the recommended
 * form has been filled in. Maturity rewards meaningful, specific, valid and operational knowledge; empty, duplicate,
 * vague, placeholder, inactive or invalid entries earn nothing, and volume alone never raises it.
 *
 * Everything here is deterministic, pure and shared by the API (which stores and serves the result) and the web app.
 * There is no AI evaluation: semantic quality is approximated by transparent text-substance rules (see `substance`).
 *
 * Final score = 0.30 Information Quality + 0.25 Knowledge Completeness + 0.25 Information Validity + 0.20 Operational
 * Intelligence (each 0 to 100). The stage is the HIGHEST stage whose score band AND every cumulative gate are satisfied.
 */

export const MATURITY_ENGINE_VERSION = 1;

export const STAGES = ['BORN', 'BABY', 'GROWING', 'SMART', 'MATURE', 'EXPERT'] as const;
export type Stage = (typeof STAGES)[number];

/** Minimum score for each stage. A high score alone never grants a stage: its gates must also pass. */
export const STAGE_MIN: Record<Stage, number> = {
  BORN: 0,
  BABY: 20,
  GROWING: 40,
  SMART: 55,
  MATURE: 70,
  EXPERT: 85,
};

export const DIMENSIONS = [
  { key: 'quality', label: 'Information Quality', weight: 0.3 },
  { key: 'completeness', label: 'Knowledge Completeness', weight: 0.25 },
  { key: 'validity', label: 'Information Validity', weight: 0.25 },
  { key: 'operational', label: 'Operational Intelligence', weight: 0.2 },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]['key'];

/** A text entry counts as meaningful at or above this substance. */
export const MEANINGFUL = 0.3;

// ---------- text analysis ----------

const STOP = new Set(
  (
    'the and for with that this from your you our are was were has have had not but all any can will would should could ' +
    'its their them they there what when where which who how why into onto over under out about also just than then very ' +
    'more most some such each every per via too etc'
  ).split(' '),
);
const PLACEHOLDER =
  /^(n\/?a|na|none|nil|null|tbd|tba|todo|test|testing|asdf+|qwer\w*|xxx+|lorem|\.+|-+|\?+|\*+)$|lorem ipsum|asdfgh|dummy text|placeholder/i;
const GENERIC = [
  /^we sell (products|things|items|stuff|goods)\.?$/i,
  /^(best|good|great|top|high)[ -](quality|service|products?)\.?$/i,
  /^(we are|we're|this is|our) (a |the )?(business|company|store|shop)\.?$/i,
  /^(all|many) (kinds|types) of (products|things)\.?$/i,
];
const ACTIONABLE =
  /\b(always|never|must|should|do not|don'?t|avoid|ask|confirm|offer|reply|respond|escalate|refer|check|verify|share|provide|only|before|when|if|within|unless)\b/i;

const words = (t: string) => (t.toLowerCase().match(/[a-z0-9ঀ-৿]+/g) ?? []) as string[];
export const norm = (t: string) => words(t).join(' ');
export const isPlaceholder = (t: string) => {
  const s = t.trim();
  return !s || PLACEHOLDER.test(s) || GENERIC.some((g) => g.test(s));
};

/**
 * How much real, specific information a piece of text carries, 0 to 1. It counts DISTINCT meaningful words (so length
 * and repetition do not help), zeroes placeholders and generic filler, and gives a small bonus for concrete details.
 */
export function substance(text: string): number {
  const t = (text ?? '').trim();
  if (isPlaceholder(t)) return 0;
  const all = words(t).filter((w) => w.length >= 3 && !STOP.has(w));
  const unique = new Set(all);
  const n = unique.size;
  let s =
    n === 0 ? 0 : n <= 2 ? 0.1 : n <= 4 ? 0.3 : n <= 7 ? 0.5 : n <= 11 ? 0.75 : n <= 17 ? 0.9 : 1;
  if (all.length >= 6 && unique.size / all.length < 0.5) s *= (unique.size / all.length) * 2;
  const concrete = /\d/.test(t) || /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}/.test(t);
  if (s >= MEANINGFUL && concrete) s = Math.min(1, s + 0.1);
  return Math.round(s * 100) / 100;
}
const meaningful = (t: string) => substance(t) >= MEANINGFUL;
const actionable = (t: string) => ACTIONABLE.test(t);
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const isUrl = (v: string) => /^(https?:\/\/)?[^\s./]+(\.[^\s./]+)+(\/\S*)?$/i.test(v.trim());
const isMoney = (v: string) => /^[^\d]*\d+([.,]\d+)*\s*[^\d\s]*$/.test(v.trim());

// ---------- business type ----------

export type BusinessKind = 'physical' | 'service' | 'general';
const SERVICE =
  /travel|tour|educat|school|course|digital|software|saas|health|wellness|clinic|salon|spa|consult|agency|service|booking|hotel|coach|training/i;
const PHYSICAL =
  /fashion|apparel|cloth|beauty|cosmetic|electronic|gadget|food|beverage|grocer|home|lifestyle|furniture|retail|shop|store|commerce|goods|merchandise|jewel|toy|book/i;
/** Shipping and returns knowledge is only required of businesses that ship physical goods. */
export function businessKind(category: string): BusinessKind {
  const c = category.trim();
  if (!c) return 'general';
  if (SERVICE.test(c)) return 'service';
  if (PHYSICAL.test(c)) return 'physical';
  return 'general';
}

// ---------- output types ----------

export const sectionKeySchema = z.enum([
  'identity',
  'products',
  'policies',
  'voice',
  'fields',
  'instructions',
  'guardrails',
  'logic',
  'kb',
]);
export type SectionKey = z.infer<typeof sectionKeySchema>;

export const brainMaturitySchema = z.object({
  engine: z.number().int(),
  evaluatedAt: z.iso.datetime(),
  /** Overall intelligence score, 0 to 100. */
  score: z.number().int(),
  stage: z.enum(STAGES),
  stageIndex: z.number().int(),
  nextStage: z.enum(STAGES).nullable(),
  /** 0 to 1: progress toward the next stage (half score distance, half gates met). */
  progressToNext: z.number(),
  dimensions: z.array(
    z.object({ key: z.string(), label: z.string(), weight: z.number(), score: z.number().int() }),
  ),
  gates: z.array(
    z.object({
      stage: z.enum(STAGES),
      id: z.string(),
      label: z.string(),
      met: z.boolean(),
      section: sectionKeySchema,
    }),
  ),
  /** What is still needed to reach the next stage (empty at EXPERT). */
  requirements: z.array(
    z.object({
      kind: z.enum(['score', 'gate']),
      id: z.string(),
      label: z.string(),
      section: sectionKeySchema.nullable(),
    }),
  ),
  recommendations: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['critical', 'important', 'improve']),
      title: z.string(),
      why: z.string(),
      section: sectionKeySchema,
      cta: z.string(),
    }),
  ),
  /** Setup completion: how much of the recommended configuration is filled in. Not the same as maturity. */
  setupCompletion: z.number().int(),
  businessKind: z.enum(['physical', 'service', 'general']),
  stats: z.object({
    activeRules: z.number().int(),
    customFields: z.number().int(),
    activeFaqs: z.number().int(),
    products: z.number().int(),
    activeInstructions: z.number().int(),
    issues: z.number().int(),
    conflicts: z.number().int(),
    duplicates: z.number().int(),
  }),
});
export type BrainMaturity = z.infer<typeof brainMaturitySchema>;
/** The Brain document as the API serves it: the saved config plus its maturity evaluation. */
export const brainDocumentWithMaturitySchema = brainDocumentSchema.extend({
  maturity: brainMaturitySchema,
});
export type MaturityGate = BrainMaturity['gates'][number];
export type MaturityRecommendation = BrainMaturity['recommendations'][number];

// ---------- the evaluation ----------

interface Facts {
  kind: BusinessKind;
  policiesRelevant: boolean;
  // counts of VALID (counted) entries
  validOfferings: number;
  validFaqs: number;
  validInstr: number;
  completeRules: number;
  incompleteEnabledRules: number;
  activeInstr: number;
  activeFaqs: number;
  products: number;
  fieldsWithValue: number;
  duplicates: number;
  conflicts: number;
  issues: number;
  // coverage 0..1
  cov: Record<
    'profile' | 'offerings' | 'faqs' | 'policies' | 'voice' | 'instructions' | 'logic' | 'fields',
    number
  >;
  identityOk: boolean;
  voiceMeaningful: number; // fields
  guardrails: number; // meaningful guardrail fields (always, never, approval topics, escalate)
  escalation: boolean;
  boundaries: boolean;
  // quality groups 0..1
  q: Record<'profile' | 'offerings' | 'faqs' | 'policies' | 'instructions', number>;
  attempted: number;
  valid: number;
  weakProducts: string[];
  weakFaqs: number;
}

const POLICY_SHORT = [
  'coverage',
  'feeInside',
  'feeOutside',
  'timeInside',
  'timeOutside',
  'processing',
] as const;
const POLICY_LONG = ['tracking'] as const;
const RETURN_SHORT = ['window', 'refundTime'] as const;
const RETURN_LONG = [
  'eligibility',
  'exchange',
  'damaged',
  'wrong',
  'shippingResp',
  'proof',
  'escalation',
] as const;

function gather(d: BrainConfig): Facts {
  const kind = businessKind(d.identity.category);
  const policiesRelevant = kind === 'physical';
  let attempted = 0;
  let valid = 0;
  let duplicates = 0;
  const count = (ok: boolean) => {
    attempted++;
    if (ok) valid++;
  };

  // ----- identity
  const id = d.identity;
  const idDescQ = substance(id.description);
  const nameOk = id.name.trim().length >= 2 && !isPlaceholder(id.name);
  for (const [k, v] of Object.entries(id) as [keyof typeof id, unknown][]) {
    if (!filled(v)) continue;
    if (k === 'website') count(isUrl(String(v)));
    else if (k === 'description' || k === 'audience' || k === 'positioning' || k === 'usp')
      count(meaningful(String(v)));
    else if (typeof v === 'string') count(!isPlaceholder(v));
    else count(true);
  }
  const identityOk =
    nameOk &&
    filled(id.category) &&
    !isPlaceholder(id.category) &&
    idDescQ >= MEANINGFUL &&
    ((filled(id.website) && isUrl(id.website)) || filled(id.country));
  const profileFilled = [
    nameOk,
    filled(id.category) && !isPlaceholder(id.category),
    filled(id.country),
    idDescQ >= MEANINGFUL,
    meaningful(id.audience) || meaningful(id.usp) || meaningful(id.positioning),
  ].filter(Boolean).length;
  const profileQ =
    0.5 * idDescQ +
    0.5 * mean([substance(id.audience), substance(id.usp), substance(id.positioning)]);

  // ----- products / services
  const seenName = new Set<string>();
  const seenDesc = new Set<string>();
  const prodQ: number[] = [];
  const weakProducts: string[] = [];
  let validOfferings = 0;
  for (const p of d.products) {
    const nm = norm(p.name);
    const any = filled(p.name) || filled(p.description) || filled(p.price);
    if (!any) continue;
    const dn = norm(p.description);
    const dup = (!!nm && seenName.has(nm)) || (!!dn && seenDesc.has(dn));
    if (nm) seenName.add(nm);
    if (dn) seenDesc.add(dn);
    if (dup) duplicates++;
    const descQ = substance(p.description);
    const priceOk = !filled(p.price) || isMoney(p.price);
    const ok = nm.length > 0 && descQ >= MEANINGFUL && !dup && priceOk && !isPlaceholder(p.name);
    count(ok);
    if (ok) {
      validOfferings++;
      prodQ.push(
        0.5 * descQ +
          0.25 * mean([substance(p.benefits), substance(p.usage), substance(p.limitations)]) +
          0.15 * (filled(p.price) && priceOk ? 1 : 0) +
          0.1 * ([p.variants, p.sizes, p.colors].some(filled) ? 1 : 0),
      );
    } else if (!dup && nm) weakProducts.push(p.name.trim());
  }

  // ----- FAQs (active only)
  const seenQ = new Set<string>();
  const seenA = new Set<string>();
  const faqQ: number[] = [];
  let validFaqs = 0;
  let activeFaqs = 0;
  let weakFaqs = 0;
  for (const f of d.faqs) {
    if (!f.active) continue;
    if (!filled(f.q) && !filled(f.a)) continue;
    activeFaqs++;
    const qn = norm(f.q);
    const an = norm(f.a);
    const dup = (!!qn && seenQ.has(qn)) || (!!an && seenA.has(an));
    if (qn) seenQ.add(qn);
    if (an) seenA.add(an);
    if (dup) duplicates++;
    const aQ = substance(f.a);
    const ok = words(f.q).length >= 3 && f.q.trim().length >= 8 && aQ >= MEANINGFUL && !dup;
    count(ok);
    if (ok) {
      validFaqs++;
      faqQ.push(aQ);
    } else if (!dup) weakFaqs++;
  }

  // ----- policies
  const policyFilled: { v: string; long: boolean }[] = [];
  for (const k of POLICY_SHORT) {
    const v = d.shipping[k];
    if (filled(v)) policyFilled.push({ v: String(v), long: false });
  }
  if (filled(d.shipping.providers))
    policyFilled.push({ v: d.shipping.providers.join(', '), long: false });
  if (filled(d.shipping.payments))
    policyFilled.push({ v: d.shipping.payments.join(', '), long: false });
  for (const k of POLICY_LONG)
    if (filled(d.shipping[k])) policyFilled.push({ v: d.shipping[k], long: true });
  for (const k of RETURN_SHORT)
    if (filled(d.returns[k])) policyFilled.push({ v: d.returns[k], long: false });
  for (const k of RETURN_LONG)
    if (filled(d.returns[k])) policyFilled.push({ v: d.returns[k], long: true });
  const policyOk: number[] = [];
  for (const p of policyFilled) {
    const ok = p.long ? meaningful(p.v) : !isPlaceholder(p.v);
    count(ok);
    if (ok) policyOk.push(p.long ? substance(p.v) : 1);
  }
  const POLICY_TARGET = 8;

  // ----- instructions (enabled only) and guardrails
  const seenI = new Set<string>();
  const instrQ: number[] = [];
  let validInstr = 0;
  let activeInstr = 0;
  for (const i of d.instructions) {
    if (!i.enabled) continue;
    activeInstr++;
    const cn = norm(i.content);
    const dup = !!cn && seenI.has(cn);
    if (cn) seenI.add(cn);
    if (dup) duplicates++;
    const c = substance(i.content);
    const ok = filled(i.title) && c >= MEANINGFUL && !dup;
    count(ok);
    if (ok) {
      validInstr++;
      instrQ.push(c * (actionable(i.content) ? 1 : 0.5));
    }
  }
  const rl = d.rules;
  const guard: [string, boolean][] = [
    ['always', meaningful(rl.always)],
    ['never', meaningful(rl.never)],
    ['approval', filled(rl.approvalTopics)],
    ['escalate', meaningful(rl.escalate)],
  ];
  for (const [k, t] of [
    ['always', rl.always],
    ['never', rl.never],
    ['escalate', rl.escalate],
  ] as const)
    if (filled(t)) {
      count(meaningful(t));
      if (meaningful(t)) instrQ.push(substance(t) * (actionable(t) || k !== 'always' ? 1 : 0.5));
    }
  const guardrails = guard.filter(([, ok]) => ok).length;

  // ----- brand voice
  const vo = d.voice;
  const voiceTexts = [vo.greeting, vo.terms, vo.avoid, vo.examples].filter(filled);
  for (const t of voiceTexts) count(!isPlaceholder(t));
  const voiceMeaningful = [vo.greeting, vo.terms, vo.avoid, vo.examples].filter(
    (t) =>
      filled(t) && !isPlaceholder(t) && (t === vo.greeting ? t.trim().length >= 3 : meaningful(t)),
  ).length;

  // ----- business rules
  const seenR = new Set<string>();
  let completeRules = 0;
  let incompleteEnabledRules = 0;
  const ruleActions: string[] = [];
  for (const r of d.logic) {
    if (!r.enabled) continue;
    const rn = norm(r.name);
    const dup = !!rn && seenR.has(rn);
    if (rn) seenR.add(rn);
    if (dup) duplicates++;
    const ok = ruleCheck(d, r).complete && !dup;
    count(ok);
    if (ok) {
      completeRules++;
      for (const a of r.actions) if (filled(a.text)) ruleActions.push(a.type);
    } else incompleteEnabledRules++;
  }

  // ----- custom fields (enabled only)
  const seenK = new Set<string>();
  let fieldsWithValue = 0;
  for (const f of d.customFields) {
    if (!f.enabled) continue;
    const dup = !!f.key && seenK.has(f.key);
    if (f.key) seenK.add(f.key);
    if (dup) duplicates++;
    const ok = filled(f.key) && cfHasVal(f) && !dup;
    count(ok);
    if (ok) fieldsWithValue++;
  }

  const escalation =
    meaningful(rl.escalate) ||
    meaningful(d.returns.escalation) ||
    ruleActions.some((t) => t === 'Escalate for review' || t === 'Offer human assistance');
  const boundaries =
    meaningful(rl.never) || meaningful(vo.avoid) || ruleActions.includes('Do not promise');

  const policyCov = clamp(policyOk.length / POLICY_TARGET);
  const group = (qs: number[], target: number) => mean(qs) * clamp(qs.length / target);
  const cov = {
    profile: profileFilled / 5,
    offerings: clamp(validOfferings / 3),
    faqs: clamp(validFaqs / 5),
    policies: policyCov,
    voice: clamp(voiceMeaningful / 2),
    instructions: 0.5 * clamp(validInstr / 2) + 0.5 * clamp(guardrails / 3),
    logic: clamp(completeRules / 2),
    fields: clamp(fieldsWithValue / 2),
  };
  return {
    kind,
    policiesRelevant,
    validOfferings,
    validFaqs,
    validInstr,
    completeRules,
    incompleteEnabledRules,
    activeInstr,
    activeFaqs,
    products: d.products.length,
    fieldsWithValue,
    duplicates,
    conflicts: conflicts(d).length,
    issues: issuesOf(d).length,
    cov,
    identityOk,
    voiceMeaningful,
    guardrails,
    escalation,
    boundaries,
    q: {
      profile: profileQ,
      offerings: group(prodQ, 3),
      faqs: group(faqQ, 5),
      policies: group(policyOk, POLICY_TARGET),
      instructions: group(instrQ, 3),
    },
    attempted,
    valid,
    weakProducts,
    weakFaqs,
  };
}

/** Category weights inside Knowledge Completeness and Information Quality. */
const COMPLETENESS_W = {
  profile: 15,
  offerings: 20,
  faqs: 15,
  policies: 15,
  voice: 10,
  instructions: 15,
  logic: 10,
  fields: 5,
} as const;
const QUALITY_W = { profile: 20, offerings: 25, faqs: 20, policies: 15, instructions: 20 } as const;

function weighted(vals: Record<string, number>, w: Record<string, number>, skip: string[]) {
  let tot = 0;
  let sum = 0;
  for (const [k, wt] of Object.entries(w)) {
    if (skip.includes(k)) continue;
    tot += wt;
    sum += wt * (vals[k] ?? 0);
  }
  return tot ? sum / tot : 0;
}

export interface GateDef {
  stage: Stage;
  id: string;
  label: string;
  section: SectionKey;
  ok: (f: Facts, s: Scores) => boolean;
}
interface Scores {
  quality: number;
  completeness: number;
  validity: number;
  operational: number;
}

const coreOk = (f: Facts, min: number) => {
  const keys: (keyof Facts['cov'])[] = [
    'profile',
    'offerings',
    'faqs',
    'voice',
    'instructions',
    'logic',
  ];
  if (f.policiesRelevant) keys.push('policies');
  return keys.every((k) => f.cov[k] >= min);
};
const clean = (f: Facts) => f.issues === 0 && f.conflicts === 0 && f.duplicates === 0;

/**
 * The gates. Stages are cumulative: a stage is reached only if its score band AND every gate of it and of every lower
 * stage pass, so a high score cannot skip a gate.
 */
export const GATES: GateDef[] = [
  {
    stage: 'BABY',
    id: 'identity',
    label:
      'Describe your business: name, category, a specific description, and a website or country',
    section: 'identity',
    ok: (f) => f.identityOk,
  },
  {
    stage: 'GROWING',
    id: 'offerings',
    label: 'Add at least one product or service with a specific description',
    section: 'products',
    ok: (f) => f.validOfferings >= 1,
  },
  {
    stage: 'GROWING',
    id: 'faqs',
    label: 'Add at least 2 active FAQs with useful answers',
    section: 'kb',
    ok: (f) => f.validFaqs >= 2,
  },
  {
    stage: 'GROWING',
    id: 'policies',
    label: 'Document your shipping and return policies',
    section: 'policies',
    ok: (f) => !f.policiesRelevant || f.cov.policies >= 0.4,
  },
  {
    stage: 'SMART',
    id: 'communication',
    label: 'Set your brand voice or add an active, specific AI instruction',
    section: 'voice',
    ok: (f) => f.voiceMeaningful >= 1 || f.validInstr >= 1,
  },
  {
    stage: 'SMART',
    id: 'rules',
    label: 'Add an active, complete business rule, or at least two AI guardrails',
    section: 'logic',
    ok: (f) => f.completeRules >= 1 || f.guardrails >= 2,
  },
  {
    stage: 'SMART',
    id: 'consistent',
    label: 'Resolve contradictions in your knowledge',
    section: 'fields',
    ok: (f) => f.conflicts === 0,
  },
  {
    stage: 'MATURE',
    id: 'breadth',
    label: 'Cover every relevant area to at least 60%',
    section: 'identity',
    ok: (f) => coreOk(f, 0.6),
  },
  {
    stage: 'MATURE',
    id: 'validity',
    label: 'Raise information validity to 70 or more',
    section: 'identity',
    ok: (_f, s) => s.validity >= 70,
  },
  {
    stage: 'MATURE',
    id: 'clean',
    label: 'Fix blocking issues, contradictions and duplicate entries',
    section: 'identity',
    ok: (f) => clean(f),
  },
  {
    stage: 'EXPERT',
    id: 'comprehensive',
    label: 'Cover every relevant area to at least 85%',
    section: 'identity',
    ok: (f) => coreOk(f, 0.85),
  },
  {
    stage: 'EXPERT',
    id: 'dimensions',
    label: 'Reach 75 or more in all four intelligence dimensions',
    section: 'identity',
    ok: (_f, s) => Math.min(s.quality, s.completeness, s.validity, s.operational) >= 75,
  },
  {
    stage: 'EXPERT',
    id: 'operational',
    label: 'Have 2 or more active rules, escalation guidance and clear response boundaries',
    section: 'logic',
    ok: (f) => f.completeRules >= 2 && f.escalation && f.boundaries,
  },
];

/** Where a gate sends the person, refined by what is actually missing. */
function sectionFor(g: GateDef, f: Facts): SectionKey {
  if (g.id === 'breadth' || g.id === 'comprehensive') {
    const order: [keyof Facts['cov'], SectionKey][] = [
      ['profile', 'identity'],
      ['offerings', 'products'],
      ['faqs', 'kb'],
      ['policies', 'policies'],
      ['voice', 'voice'],
      ['instructions', 'instructions'],
      ['logic', 'logic'],
    ];
    const min = g.id === 'breadth' ? 0.6 : 0.85;
    for (const [k, sec] of order)
      if ((k !== 'policies' || f.policiesRelevant) && f.cov[k] < min) return sec;
  }
  if (g.id === 'operational') {
    if (f.completeRules < 2) return 'logic';
    return 'guardrails';
  }
  if (g.id === 'communication') return f.voiceMeaningful >= 1 ? 'instructions' : 'voice';
  if (g.id === 'rules') return f.guardrails < 2 ? 'guardrails' : 'logic';
  return g.section;
}

const CTA: Record<SectionKey, string> = {
  identity: 'Complete Business Profile',
  products: 'Add Products',
  policies: 'Add Customer Policies',
  voice: 'Configure Brand Voice',
  fields: 'Review Custom Fields',
  instructions: 'Add AI Instructions',
  guardrails: 'Set AI Guardrails',
  logic: 'Add Business Rules',
  kb: 'Add FAQs',
};

export function evaluateMaturity(d: BrainConfig, now: Date = new Date()): BrainMaturity {
  const f = gather(d);

  // ----- dimension scores
  const quality = 100 * weighted(f.q, QUALITY_W, f.policiesRelevant ? [] : ['policies']);
  const completeness =
    100 * weighted(f.cov, COMPLETENESS_W, f.policiesRelevant ? [] : ['policies']);
  const base = f.attempted ? (f.valid / f.attempted) * 100 : 0;
  const penalties = f.conflicts * 15 + f.duplicates * 10 + f.issues * 10;
  const validity = clamp(base - penalties, 0, 100) * clamp(f.attempted / 10);
  const operational =
    100 *
    (0.3 * clamp(f.completeRules / 3) +
      0.2 * clamp(f.validInstr / 3) +
      0.15 * clamp(f.guardrails / 3) +
      0.15 * (f.escalation ? 1 : 0) +
      0.1 * clamp(f.voiceMeaningful / 2) +
      0.1 * (f.boundaries ? 1 : 0));
  const raw: Scores = { quality, completeness, validity, operational };
  const total = DIMENSIONS.reduce((a, x) => a + raw[x.key] * x.weight, 0);
  const score = Math.round(clamp(total, 0, 100));
  const rounded = {
    quality: Math.round(quality),
    completeness: Math.round(completeness),
    validity: Math.round(validity),
    operational: Math.round(operational),
  };

  // ----- gates and stage
  const gates: MaturityGate[] = GATES.map((g) => ({
    stage: g.stage,
    id: g.id,
    label: g.label,
    met: g.ok(f, raw),
    section: sectionFor(g, f),
  }));
  const gatesOk = (upTo: number) =>
    gates.filter((g) => STAGES.indexOf(g.stage) <= upTo).every((g) => g.met);
  let stageIndex = 0;
  for (let i = STAGES.length - 1; i > 0; i--) {
    if (score >= STAGE_MIN[STAGES[i]!] && gatesOk(i)) {
      stageIndex = i;
      break;
    }
  }
  const stage = STAGES[stageIndex]!;
  const nextStage = STAGES[stageIndex + 1] ?? null;

  // ----- requirements for the next stage
  const requirements: BrainMaturity['requirements'] = [];
  let progressToNext = 1;
  if (nextStage) {
    const nextMin = STAGE_MIN[nextStage];
    if (score < nextMin)
      requirements.push({
        kind: 'score',
        id: 'score',
        label: `Raise your intelligence score from ${score} to ${nextMin}`,
        section: null,
      });
    const nextGates = gates.filter((g) => g.stage === nextStage);
    for (const g of nextGates)
      if (!g.met) requirements.push({ kind: 'gate', id: g.id, label: g.label, section: g.section });
    const curMin = STAGE_MIN[stage];
    const scoreFrac = clamp((score - curMin) / Math.max(1, nextMin - curMin));
    const gateFrac = nextGates.length
      ? nextGates.filter((g) => g.met).length / nextGates.length
      : 1;
    progressToNext = Math.round((0.5 * scoreFrac + 0.5 * gateFrac) * 100) / 100;
  }

  // ----- recommendations: critical first, then what blocks the next stage, then the weakest dimension
  const recs: MaturityRecommendation[] = [];
  const push = (r: Omit<MaturityRecommendation, 'cta'> & { cta?: string }) => {
    if (!recs.some((x) => x.id === r.id)) recs.push({ ...r, cta: r.cta ?? CTA[r.section] });
  };
  for (const i of issuesOf(d))
    push({
      id: `issue:${i.text}`,
      severity: 'critical',
      title: i.text,
      why: 'A blocking issue stops this Brain from being saved, so nothing below it counts until it is fixed.',
      section: (i.sec as SectionKey) in CTA ? (i.sec as SectionKey) : 'identity',
      cta: 'Fix issue',
    });
  for (const c of conflicts(d))
    push({
      id: `conflict:${c.text}`,
      severity: 'critical',
      title: c.text,
      why: 'Contradictory information lowers validity and blocks higher stages.',
      section: (c.sec as SectionKey) in CTA ? (c.sec as SectionKey) : 'fields',
      cta: 'Resolve contradiction',
    });
  if (f.duplicates)
    push({
      id: 'duplicates',
      severity: 'important',
      title: `Remove ${f.duplicates} duplicate entr${f.duplicates === 1 ? 'y' : 'ies'}`,
      why: 'Duplicates earn no credit and lower validity.',
      section: 'products',
      cta: 'Review entries',
    });
  const WHY: Record<string, string> = {
    identity: 'Torio needs to know what your business is before it can talk about it.',
    offerings: 'Customers ask about what you sell first; specific descriptions let Torio answer.',
    faqs: 'Real answers to common questions are the fastest way to help customers.',
    policies: 'Delivery and return answers need your actual policies, not guesses.',
    communication: 'Torio needs to know how you want to sound and what to do.',
    rules: 'Rules and guardrails tell Torio what to do in situations that need care.',
    consistent: 'Contradictions make answers unreliable.',
    breadth: 'Every relevant area needs enough knowledge for consistent answers.',
    validity: 'Valid, specific entries are what raises validity.',
    clean: 'Issues, contradictions and duplicates hold back higher stages.',
    comprehensive: 'Comprehensive coverage is what separates Expert from Mature.',
    dimensions: 'Expert needs every dimension strong, not just a high average.',
    operational: 'Expert Brains know when to escalate and what never to promise.',
  };
  if (nextStage)
    for (const g of gates.filter((x) => x.stage === nextStage && !x.met))
      push({
        id: `gate:${g.id}`,
        severity: 'important',
        title: g.label,
        why: WHY[g.id] ?? '',
        section: g.section,
      });
  // weakest meaningful dimension
  const dimsSorted = (Object.entries(raw) as [DimensionKey, number][]).sort((a, b) => a[1] - b[1]);
  const [weakK, weakV] = dimsSorted[0]!;
  if (weakV < 85 && recs.length < 4) {
    const pick = weakestAction(f, weakK);
    if (pick) push({ id: `dim:${weakK}`, severity: 'improve', ...pick });
  }
  const order = { critical: 0, important: 1, improve: 2 } as const;
  recs.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    engine: MATURITY_ENGINE_VERSION,
    evaluatedAt: now.toISOString(),
    score,
    stage,
    stageIndex,
    nextStage,
    progressToNext,
    dimensions: DIMENSIONS.map((x) => ({
      key: x.key,
      label: x.label,
      weight: x.weight,
      score: rounded[x.key],
    })),
    gates,
    requirements,
    recommendations: recs.slice(0, 5),
    setupCompletion: readinessPct(areas(d)),
    businessKind: f.kind,
    stats: {
      activeRules: d.logic.filter((r) => r.enabled).length,
      customFields: d.customFields.length,
      activeFaqs: f.activeFaqs,
      products: f.products,
      activeInstructions: f.activeInstr,
      issues: f.issues,
      conflicts: f.conflicts,
      duplicates: f.duplicates,
    },
  };
}

/** The most useful concrete step for the weakest dimension, from what is actually missing or weak. */
function weakestAction(
  f: Facts,
  dim: DimensionKey,
): { title: string; why: string; section: SectionKey } | null {
  if (dim === 'operational') {
    if (f.completeRules < 1)
      return {
        title: 'Add an active business rule',
        why: 'Rules tell Torio how to handle situations that need care, such as discounts or damaged items.',
        section: 'logic',
      };
    if (!f.escalation)
      return {
        title: 'Add escalation guidance',
        why: 'Torio needs to know when to hand a conversation to a person.',
        section: 'guardrails',
      };
    if (f.validInstr < 1)
      return {
        title: 'Add a specific AI instruction',
        why: 'Instructions make replies match how your business works.',
        section: 'instructions',
      };
    if (!f.boundaries)
      return {
        title: 'Say what Torio must never do',
        why: 'Clear boundaries stop replies you would not want to send.',
        section: 'guardrails',
      };
    return {
      title: 'Add more active rules',
      why: 'More complete rules cover more situations.',
      section: 'logic',
    };
  }
  if (dim === 'completeness') {
    const order: [keyof Facts['cov'], SectionKey, string][] = [
      ['profile', 'identity', 'Complete your business profile'],
      ['offerings', 'products', 'Add products or services'],
      ['faqs', 'kb', 'Add FAQs'],
      ['policies', 'policies', 'Document shipping and return policies'],
      ['voice', 'voice', 'Configure your brand voice'],
      ['instructions', 'instructions', 'Add AI instructions'],
      ['logic', 'logic', 'Add business rules'],
    ];
    for (const [k, sec, title] of order)
      if ((k !== 'policies' || f.policiesRelevant) && f.cov[k] < 1)
        return { title, why: 'Missing areas limit what Torio can answer.', section: sec };
    return null;
  }
  if (dim === 'quality') {
    if (f.weakProducts.length)
      return {
        title: `Make “${f.weakProducts[0]}” more specific`,
        why: 'Vague or very short descriptions earn little credit; add concrete details.',
        section: 'products',
      };
    if (f.weakFaqs)
      return {
        title: 'Improve vague FAQ answers',
        why: 'Short, generic answers do not help customers.',
        section: 'kb',
      };
    return {
      title: 'Make your business description more specific',
      why: 'Concrete detail about what you offer and to whom raises quality.',
      section: 'identity',
    };
  }
  if (f.attempted < 10)
    return {
      title: 'Add more valid knowledge',
      why: 'Validity needs enough valid entries to be meaningful.',
      section: 'products',
    };
  return {
    title: 'Fix invalid or vague entries',
    why: 'Entries that are incomplete, vague or malformed earn no validity credit.',
    section: 'products',
  };
}
