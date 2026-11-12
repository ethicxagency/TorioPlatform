import { z } from 'zod';

/**
 * Torio Brain: the per-workspace knowledge/rules document that guides AI-assisted replies.
 * Stored as one validated JSON document per workspace. The pure functions below (readiness,
 * validation, conflicts, rule checks, preview) are shared by the web app and the API so both
 * judge a configuration identically.
 */

const text = (max = 2000) => z.string().max(max);
const id = z.string().min(1).max(40);

export const FIELD_TYPES = [
  'Short text',
  'Long text',
  'Number',
  'Currency',
  'Boolean',
  'Single select',
  'Multi-select',
  'Date',
  'URL',
  'Structured list',
] as const;
export const CF_CATS = [
  'General Business',
  'Products',
  'Orders',
  'Shipping',
  'Payments',
  'Returns',
  'Customer Support',
  'Marketing',
] as const;
export const SCOPES = [
  'AI replies & Inbox suggestions',
  'AI replies only',
  'Internal reference only',
] as const;
export const STOCK_STATES = ['In stock', 'Low stock', 'Out of stock', 'Pre-order'] as const;
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const ACTION_TYPES = [
  'Ask the customer',
  'Reply using knowledge',
  'Follow a policy',
  'Request information',
  'Do not promise',
  'Offer human assistance',
  'Escalate for review',
] as const;
export const FAQ_CATS = [
  'Products',
  'Pricing',
  'Delivery',
  'Returns',
  'Payments',
  'Orders',
  'General',
] as const;
export const TONES = ['Friendly', 'Professional', 'Casual', 'Premium', 'Playful'] as const;

export const INTENT_LABEL = {
  fee: 'Asks about delivery charges',
  discount: 'Requests a discount',
  avail: 'Asks about variant availability',
  damaged: 'Reports a damaged product',
  wholesale: 'Asks about wholesale',
  cod: 'Asks about COD',
  warranty: 'Asks about warranty',
  area: 'Asks about service area',
  tracking: 'Asks about order tracking',
} as const;
export const INTENTS: string[] = Object.values(INTENT_LABEL);

export const SUBJECTS = [
  { v: 'intent', l: 'Customer intent', ops: ['is'], values: INTENTS },
  { v: 'location', l: 'Delivery location', ops: ['is'], values: ['known', 'unknown'] },
  { v: 'discount', l: 'Requested discount', ops: ['exceeds', 'is within'], values: 'fieldNum' },
  { v: 'stock', l: 'Stock information', ops: ['is'], values: ['missing or outdated', 'available'] },
  { v: 'tag', l: 'Customer tag', ops: ['is', 'is not'], values: 'text' },
  { v: 'amount', l: 'Order amount', ops: ['is less than', 'is at least'], values: 'fieldNum' },
  { v: 'field', l: 'Custom field', ops: ['is set', 'is not set', 'equals'], values: 'text' },
] as const;

export const brainProductSchema = z.object({
  id,
  name: text(120),
  category: text(60),
  description: text(1000),
  price: text(20),
  variants: text(300),
  sizes: text(300),
  colors: text(300),
  stock: z.enum(STOCK_STATES),
  benefits: text(1000),
  usage: text(1000),
  limitations: text(1000),
  faqs: text(2000),
  updatedAt: text(40).optional(),
});

export const brainCustomFieldSchema = z.object({
  id,
  name: text(80),
  key: text(60),
  desc: text(300),
  type: z.enum(FIELD_TYPES),
  value: z.union([z.string().max(4000), z.boolean(), z.array(z.string().max(100)).max(100)]),
  options: text(1000),
  category: text(60),
  required: z.boolean(),
  scope: z.enum(SCOPES),
  min: text(20),
  max: text(20),
  maxLen: text(10),
  def: text(200),
  unit: text(20),
  enabled: z.boolean(),
});

export const brainInstructionSchema = z.object({
  id,
  title: text(160),
  content: text(2000),
  category: text(60),
  priority: z.enum(PRIORITIES),
  enabled: z.boolean(),
  conditions: text(500),
  example: text(500),
  expected: text(500),
});

const condSchema = z.object({
  id,
  s: z.enum(['intent', 'location', 'discount', 'stock', 'tag', 'amount', 'field']),
  op: text(30),
  val: text(200),
  fk: text(60).optional(),
});
const groupSchema = z.object({
  id,
  group: z.literal(true),
  join: z.enum(['and', 'or']),
  conds: z.array(condSchema).max(20),
});
const actionSchema = z.object({ id, type: z.enum(ACTION_TYPES), text: text(500) });

export const brainRuleSchema = z.object({
  id,
  name: text(160),
  enabled: z.boolean(),
  priority: z.enum(PRIORITIES),
  join: z.enum(['and', 'or']),
  items: z.array(z.union([groupSchema, condSchema])).max(30),
  actions: z.array(actionSchema).max(20),
  otherwise: z.object({ type: z.enum(ACTION_TYPES), text: text(500) }).optional(),
  test: text(300),
});

export const brainFaqSchema = z.object({
  id,
  q: text(300),
  a: text(2000),
  cat: z.enum(FAQ_CATS),
  active: z.boolean(),
});

export const brainConfigSchema = z.object({
  identity: z.object({
    name: text(120),
    category: text(80),
    website: text(200),
    country: text(80),
    market: text(120),
    languages: z.array(text(40)).max(10),
    currency: text(40),
    description: text(1000),
    audience: text(300),
    positioning: text(300),
    usp: text(300),
  }),
  products: z.array(brainProductSchema).max(300),
  shipping: z.object({
    /** Couriers the store has added and left enabled: the ones the AI may name. */
    providers: z.array(text(60)).max(20),
    /** Couriers that were added but are switched off. Kept so their details survive; never quoted. */
    providersOff: z.array(text(60)).max(20).default([]),
    /** Customer-facing details per courier name (e.g. the booking hotline or coverage). */
    providerNotes: z.record(text(60), text(300)).default({}),
    coverage: text(120),
    feeInside: text(20),
    feeOutside: text(20),
    timeInside: text(60),
    timeOutside: text(60),
    cod: z.boolean(),
    payments: z.array(text(60)).max(20),
    paymentsOff: z.array(text(60)).max(20).default([]),
    /** Customer-facing payment instructions per method (e.g. the bKash number and whether to use Send Money). */
    paymentNotes: z.record(text(60), text(300)).default({}),
    freeShip: z.boolean(),
    threshold: text(20),
    processing: text(120),
    tracking: text(1000),
  }),
  returns: z.object({
    eligibility: text(1000),
    window: text(60),
    exchange: text(1000),
    refundTime: text(60),
    damaged: text(1000),
    wrong: text(1000),
    shippingResp: text(300),
    proof: text(500),
    escalation: text(1000),
  }),
  voice: z.object({
    tone: z.enum(TONES),
    language: z.enum(['Bengali', 'English', 'Mixed']),
    formality: z.number().int().min(1).max(5),
    length: z.enum(['Concise', 'Balanced', 'Detailed']),
    emoji: z.enum(['None', 'Minimal', 'Moderate']),
    greeting: text(200),
    terms: text(1000),
    avoid: text(500),
    examples: text(2000),
  }),
  rules: z.object({
    always: text(2000),
    never: text(2000),
    approvalTopics: z.array(text(60)).max(30),
    escalate: text(1000),
    discount: text(60),
    alternatives: z.boolean(),
    competitors: z.boolean(),
    promises: z.boolean(),
    angry: text(120),
    fallback: z.enum(['human', 'clarify', 'plain']),
    sensitive: z.object({
      refund: z.boolean(),
      payment: z.boolean(),
      complaint: z.boolean(),
      delivery: z.boolean(),
    }),
  }),
  cfCats: z.array(text(60)).max(30),
  customFields: z.array(brainCustomFieldSchema).max(100),
  instructions: z.array(brainInstructionSchema).max(100),
  logic: z.array(brainRuleSchema).max(100),
  faqs: z.array(brainFaqSchema).max(500),
});
export type BrainConfig = z.infer<typeof brainConfigSchema>;
export type BrainProduct = z.infer<typeof brainProductSchema>;
export type BrainCustomField = z.infer<typeof brainCustomFieldSchema>;
export type BrainInstruction = z.infer<typeof brainInstructionSchema>;
export type BrainRule = z.infer<typeof brainRuleSchema>;
export type BrainFaq = z.infer<typeof brainFaqSchema>;
export type BrainCond = z.infer<typeof condSchema>;
export type BrainGroup = z.infer<typeof groupSchema>;
export type BrainAction = z.infer<typeof actionSchema>;

export const brainDocumentSchema = z.object({
  config: brainConfigSchema,
  /** Increments on every save; send it back as baseVersion to detect concurrent edits. 0 = never saved. */
  version: z.number().int(),
  updatedAt: z.iso.datetime().nullable(),
  updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export const saveBrainSchema = z.object({
  config: brainConfigSchema,
  baseVersion: z.number().int().min(0),
});
export type SaveBrainInput = z.infer<typeof saveBrainSchema>;

/** A brand-new workspace starts empty: nothing is pre-filled as if it were the merchant's real knowledge. */
export const emptyBrainConfig = (): BrainConfig => ({
  identity: {
    name: '',
    category: '',
    website: '',
    country: '',
    market: '',
    languages: [],
    currency: '',
    description: '',
    audience: '',
    positioning: '',
    usp: '',
  },
  products: [],
  shipping: {
    providers: [],
    providersOff: [],
    providerNotes: {},
    coverage: '',
    feeInside: '',
    feeOutside: '',
    timeInside: '',
    timeOutside: '',
    cod: false,
    payments: [],
    paymentsOff: [],
    paymentNotes: {},
    freeShip: false,
    threshold: '',
    processing: '',
    tracking: '',
  },
  returns: {
    eligibility: '',
    window: '',
    exchange: '',
    refundTime: '',
    damaged: '',
    wrong: '',
    shippingResp: '',
    proof: '',
    escalation: '',
  },
  voice: {
    tone: 'Friendly',
    language: 'Mixed',
    formality: 3,
    length: 'Balanced',
    emoji: 'Minimal',
    greeting: '',
    terms: '',
    avoid: '',
    examples: '',
  },
  rules: {
    always: '',
    never: '',
    approvalTopics: [],
    escalate: '',
    discount: 'None',
    alternatives: true,
    competitors: false,
    promises: false,
    angry: 'Apologise, acknowledge, then hand off',
    fallback: 'human',
    sensitive: { refund: true, payment: true, complaint: true, delivery: true },
  },
  cfCats: [],
  customFields: [],
  instructions: [],
  logic: [],
  faqs: [],
});

// ---------- pure helpers ----------

export const filled = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : String(v ?? '').trim().length > 0;
export const slugKey = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
const lc = (s: string) => (s === 'USP' ? s : s.charAt(0).toLowerCase() + s.slice(1));

export const cfByKey = (d: BrainConfig, k: string) => d.customFields.find((f) => f.key === k);
export const cfHasVal = (f: BrainCustomField) => (f.type === 'Boolean' ? true : filled(f.value));
export function cfDisplay(f: BrainCustomField): string {
  if (f.type === 'Boolean') return f.value ? 'Yes' : 'No';
  if (f.type === 'Multi-select') return (Array.isArray(f.value) ? f.value : []).join(', ') || '—';
  if (f.type === 'Currency')
    return filled(f.value) ? '৳' + Number(f.value).toLocaleString('en-US') : '—';
  if (f.type === 'Number') return filled(f.value) ? String(f.value) + (f.unit || '') : '—';
  if (f.type === 'Structured list')
    return (
      String(f.value || '')
        .split('\n')
        .filter(Boolean)
        .join(' · ') || '—'
    );
  return filled(f.value) ? String(f.value) : '—';
}

export const flatConds = (items: BrainRule['items']): BrainCond[] =>
  items.flatMap((i) => ('group' in i ? i.conds : [i]));

export function ruleCheck(d: BrainConfig, r: BrainRule) {
  const issues: string[] = [];
  const refs: string[] = [];
  for (const c of flatConds(r.items)) {
    if (['intent', 'location', 'stock', 'tag'].includes(c.s)) {
      if (!filled(c.val)) issues.push('value');
    } else if (c.s === 'discount' || c.s === 'amount') {
      if (!filled(c.val)) issues.push('field');
      else {
        const f = cfByKey(d, c.val);
        if (!f || !f.enabled) refs.push(f ? f.name : c.val);
      }
    } else if (c.s === 'field') {
      if (!filled(c.fk)) issues.push('field');
      else {
        const f = cfByKey(d, c.fk!);
        if (!f || !f.enabled) refs.push(f ? f.name : c.fk!);
      }
      if (c.op === 'equals' && !filled(c.val)) issues.push('value');
    }
  }
  if (!r.items.length) issues.push('condition');
  if (!r.actions.some((a) => filled(a.text))) issues.push('action');
  if (!filled(r.name)) issues.push('name');
  return { issues, refs, complete: issues.length === 0 };
}

export interface BrainConflict {
  area: string;
  sec: string;
  text: string;
}
export function conflicts(d: BrainConfig): BrainConflict[] {
  const o: BrainConflict[] = [];
  const cod = cfByKey(d, 'cod_available');
  if (cod && cod.enabled && !!cod.value !== !!d.shipping.cod)
    o.push({
      area: 'fields',
      sec: 'fields',
      text: `COD Available (custom field) says ${cod.value ? 'Yes' : 'No'}, but Cash on delivery is ${d.shipping.cod ? 'on' : 'off'} in Customer Policies.`,
    });
  const sa = cfByKey(d, 'service_areas');
  const saVal = Array.isArray(sa?.value) ? sa.value : [];
  if (sa && sa.enabled && saVal.length && d.shipping.coverage === 'Nationwide')
    o.push({
      area: 'fields',
      sec: 'policies',
      text: `Service Areas lists only ${saVal.join(', ')}, but delivery coverage is set to Nationwide.`,
    });
  for (const r of d.logic) {
    if (!r.enabled) continue;
    for (const x of ruleCheck(d, r).refs)
      o.push({
        area: 'logic',
        sec: 'logic',
        text: `Rule “${r.name}” uses ${x}, which is disabled or missing.`,
      });
  }
  return o;
}

export interface BrainIssue {
  text: string;
  sec: string;
}
/** Blocking problems. The API rejects a save with any of these; the UI shows them before saving. */
export function issuesOf(d: BrainConfig): BrainIssue[] {
  const o: BrainIssue[] = [];
  if (!filled(d.identity.name)) o.push({ text: 'Business name is required.', sec: 'identity' });
  for (const f of d.customFields)
    if (f.enabled && f.required && !cfHasVal(f))
      o.push({ text: `Required field “${f.name}” has no value.`, sec: 'fields' });
  for (const i of d.instructions)
    if (i.enabled && (!filled(i.title) || !filled(i.content)))
      o.push({
        text: `An enabled instruction is missing its ${!filled(i.title) ? 'title' : 'content'}.`,
        sec: 'instructions',
      });
  for (const r of d.logic)
    if (r.enabled && ruleCheck(d, r).issues.length)
      o.push({ text: `Rule “${r.name || 'Untitled'}” is incomplete.`, sec: 'logic' });
  const keys = d.customFields.map((f) => f.key).filter(Boolean);
  if (new Set(keys).size !== keys.length)
    o.push({ text: 'Two custom fields share the same key.', sec: 'fields' });
  return o;
}

const ID_F: [keyof BrainConfig['identity'], string][] = [
  ['name', 'Business name'],
  ['category', 'Business category'],
  ['website', 'Website URL'],
  ['country', 'Country'],
  ['market', 'Primary market'],
  ['languages', 'Supported languages'],
  ['currency', 'Currency'],
  ['description', 'Business description'],
  ['audience', 'Target audience'],
  ['positioning', 'Brand positioning'],
  ['usp', 'USP'],
];
const PR_F: [keyof BrainProduct, string][] = [
  ['name', 'name'],
  ['category', 'category'],
  ['description', 'description'],
  ['price', 'price'],
  ['variants', 'variants'],
  ['sizes', 'sizes'],
  ['colors', 'colors'],
  ['stock', 'stock'],
  ['benefits', 'benefits'],
  ['usage', 'usage instructions'],
  ['limitations', 'limitations'],
  ['faqs', 'product FAQs'],
];
const SH_F: [keyof BrainConfig['shipping'], string][] = [
  ['providers', 'Shipping providers'],
  ['coverage', 'Delivery coverage'],
  ['feeInside', 'Inside-city fee'],
  ['feeOutside', 'Outside-city fee'],
  ['timeInside', 'Inside-city delivery time'],
  ['timeOutside', 'Outside-city delivery time'],
  ['payments', 'Payment methods'],
  ['processing', 'Order processing time'],
  ['tracking', 'Tracking instructions'],
];
const RE_F: [keyof BrainConfig['returns'], string][] = [
  ['eligibility', 'Return eligibility'],
  ['window', 'Return window'],
  ['exchange', 'Exchange eligibility'],
  ['refundTime', 'Refund processing time'],
  ['damaged', 'Damaged product policy'],
  ['wrong', 'Wrong product policy'],
  ['shippingResp', 'Return shipping responsibility'],
  ['proof', 'Required proof'],
  ['escalation', 'Escalation instructions'],
];

export interface BrainArea {
  key: string;
  sec: string;
  label: string;
  pct: number;
  rec: string;
  review?: boolean;
}
/** Readiness measures how COMPLETE the configuration is. It says nothing about whether the content is correct. */
export function areas(d: BrainConfig): BrainArea[] {
  const o: BrainArea[] = [];
  const cf = conflicts(d);
  const idM = ID_F.filter(([k]) => !filled(d.identity[k])).map((f) => f[1]);
  o.push({
    key: 'identity',
    sec: 'identity',
    label: 'Business profile',
    pct: (ID_F.length - idM.length) / ID_F.length,
    rec: idM.length ? `Add ${lc(idM[0]!)} to complete your business profile.` : '',
  });
  let tot = 0,
    got = 0,
    pr = '';
  for (const p of d.products) {
    const m = PR_F.filter(([k]) => !filled(p[k])).map((f) => f[1]);
    tot += PR_F.length;
    got += PR_F.length - m.length;
    if (m.length && !pr)
      pr = `Add ${m.slice(0, 2).join(' and ')} for ${p.name || 'an untitled product'} so AI can answer product questions fully.`;
  }
  o.push({
    key: 'products',
    sec: 'products',
    label: 'Product knowledge',
    pct: tot ? got / tot : 0,
    rec: d.products.length ? pr : 'Add at least one product so AI can answer product questions.',
  });
  const shF = SH_F.concat(d.shipping.freeShip ? [['threshold', 'Free shipping threshold']] : []);
  const shM = shF.filter(([k]) => !filled(d.shipping[k])).map((f) => f[1]);
  o.push({
    key: 'shipping',
    sec: 'policies',
    label: 'Shipping policy',
    pct: (shF.length - shM.length) / shF.length,
    rec: shM.length ? `Add ${lc(shM[0]!)} so AI can set accurate delivery expectations.` : '',
  });
  const reM = RE_F.filter(([k]) => !filled(d.returns[k])).map((f) => f[1]);
  o.push({
    key: 'returns',
    sec: 'returns',
    label: 'Return policy',
    pct: (RE_F.length - reM.length) / RE_F.length,
    rec: reM.length
      ? `Add your ${lc(reM.find((x) => x === 'Refund processing time') ?? reM[0]!)} so AI can answer refund questions more accurately.`
      : '',
  });
  const en = d.customFields.filter((f) => f.enabled);
  const emp = en.find((f) => !cfHasVal(f));
  o.push({
    key: 'fields',
    sec: 'fields',
    label: 'Custom fields',
    pct: en.length ? en.filter(cfHasVal).length / en.length : 0,
    rec: en.length
      ? emp
        ? `Add a value for “${emp.name}”.`
        : ''
      : 'Add custom fields for anything specific to how your business works.',
  });
  const ru = d.rules;
  const ic: [boolean, string][] = [
    [d.instructions.some((i) => i.enabled && filled(i.content)), 'an enabled custom instruction'],
    [filled(ru.always), 'what AI should always do'],
    [filled(ru.never), 'what AI must never do'],
    [filled(ru.escalate), 'when to escalate to a human'],
    [filled(ru.approvalTopics), 'topics that need approval'],
    [filled(ru.fallback), 'a fallback behaviour'],
  ];
  const im = ic.filter((x) => !x[0]);
  o.push({
    key: 'instructions',
    sec: 'instructions',
    label: 'Custom instructions',
    pct: (ic.length - im.length) / ic.length,
    rec: im.length ? `Define ${im[0]![1]} so AI knows how to behave.` : '',
  });
  const lt = d.logic.length;
  const lok = d.logic.filter((r) => ruleCheck(d, r).complete).length;
  o.push({
    key: 'logic',
    sec: 'logic',
    label: 'Business logic',
    pct: lt ? lok / lt : 0,
    rec: lt
      ? lok < lt
        ? 'Complete the highlighted conditions and actions in your rules.'
        : ''
      : 'Add a rule for situations that need special handling.',
  });
  const act = d.faqs.filter((f) => f.active).length;
  o.push({
    key: 'faqs',
    sec: 'kb',
    label: 'FAQs',
    pct: Math.min(1, act / 5),
    rec:
      act < 5
        ? `Add ${5 - act} more active FAQ${5 - act > 1 ? 's' : ''} to cover common customer questions.`
        : '',
  });
  for (const a of o) {
    const c = cf.find((x) => x.area === a.key);
    if (c) {
      a.review = true;
      a.rec = c.text;
      a.sec = c.sec;
    }
  }
  return o;
}

export const readinessPct = (list: BrainArea[]) =>
  Math.round((list.reduce((a, x) => a + x.pct, 0) / list.length) * 100);

/** Which top-level sections differ between two configs (drives the "unsaved changes" summary). */
export const CHANGE_LABEL: Record<keyof BrainConfig, string | null> = {
  identity: 'Business profile',
  products: 'Products',
  shipping: 'Delivery',
  returns: 'Returns',
  voice: 'Brand voice',
  rules: 'Guardrails',
  customFields: 'Custom fields',
  cfCats: null,
  instructions: 'Instructions',
  logic: 'Business logic',
  faqs: 'Knowledge base',
};
export function changedSections(a: BrainConfig, b: BrainConfig): string[] {
  const out = new Set<string>();
  for (const k of Object.keys(CHANGE_LABEL) as (keyof BrainConfig)[]) {
    const label = CHANGE_LABEL[k];
    if (label && JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.add(label);
  }
  return [...out];
}
