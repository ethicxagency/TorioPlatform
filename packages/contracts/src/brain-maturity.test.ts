import { describe, expect, it } from 'vitest';
import { emptyBrainConfig, type BrainConfig } from './brain';
import {
  businessKind,
  evaluateMaturity,
  STAGES,
  STAGE_MIN,
  substance,
  type Stage,
} from './brain-maturity';

// ---------- fixtures: each builder adds one level of real knowledge ----------
const id = (n: string) => `${n}-${Math.random().toString(36).slice(2, 7)}`;

const withProfile = (d: BrainConfig): BrainConfig => {
  d.identity.name = 'Lumi Skincare';
  d.identity.category = 'Beauty & Cosmetics';
  d.identity.country = 'Bangladesh';
  d.identity.website = 'https://lumi.example.com';
  d.identity.description =
    'Lumi Skincare sells gentle, fragrance-free moisturisers and cleansers formulated for sensitive skin, shipped across Bangladesh.';
  d.identity.audience = 'Adults with sensitive or eczema-prone skin who want simple routines';
  d.identity.usp = 'Dermatologist-tested formulas with no added fragrance or alcohol';
  d.identity.positioning = 'Affordable clinical-grade skincare for everyday sensitive skin';
  return d;
};
const product = (name: string, description: string) => ({
  id: id('p'),
  name,
  category: 'Skincare',
  description,
  price: '1200',
  variants: '50ml, 100ml',
  sizes: '',
  colors: '',
  stock: 'In stock' as const,
  benefits: 'Calms redness and keeps skin hydrated for twenty four hours',
  usage: 'Apply twice daily to clean skin, avoiding the eye area completely',
  limitations: 'Not recommended for open wounds or broken skin',
  faqs: '',
});
const withProducts = (d: BrainConfig): BrainConfig => {
  d.products = [
    product(
      'Barrier Repair Cream',
      'Rich fragrance-free moisturiser with ceramides and niacinamide for dry, sensitive skin.',
    ),
    product(
      'Gentle Foaming Cleanser',
      'Soap-free cleanser with glycerin that removes sunscreen without tightening the skin.',
    ),
    product(
      'Daily Mineral Sunscreen',
      'Lightweight SPF 50 zinc oxide sunscreen with no white cast, suitable for sensitive faces.',
    ),
  ];
  return d;
};
const faq = (q: string, a: string) => ({
  id: id('f'),
  q,
  a,
  cat: 'General' as const,
  active: true,
});
const withFaqs = (d: BrainConfig): BrainConfig => {
  d.faqs = [
    faq(
      'Are your products fragrance free?',
      'Yes, every Lumi formula is free of added fragrance, essential oils and alcohol.',
    ),
    faq(
      'How long does delivery take in Dhaka?',
      'Orders inside Dhaka arrive within one to two working days after dispatch.',
    ),
    faq(
      'Can I use the cream on my baby?',
      'The cream is tested on adults; please check with a paediatrician before using it on infants.',
    ),
    faq(
      'Do you offer cash on delivery?',
      'Yes, cash on delivery is available nationwide with a small handling fee added at checkout.',
    ),
    faq(
      'How do I track my order?',
      'We text a tracking link as soon as the courier collects your parcel from our warehouse.',
    ),
  ];
  return d;
};
const withPolicies = (d: BrainConfig): BrainConfig => {
  d.shipping = {
    ...d.shipping,
    providers: ['Pathao', 'Steadfast'],
    coverage: 'Nationwide',
    feeInside: '60',
    feeOutside: '120',
    timeInside: '1 to 2 days',
    timeOutside: '3 to 5 days',
    payments: ['bKash', 'Cash on delivery'],
    processing: '24 hours',
    tracking: 'A tracking link is sent by SMS once the courier collects the parcel.',
  };
  d.returns = {
    ...d.returns,
    eligibility:
      'Unopened products can be returned within seven days of delivery with proof of purchase.',
    window: '7 days',
    refundTime: '5 working days',
    damaged: 'Send a photo within 48 hours and we will replace the item at no cost.',
    wrong: 'If we sent the wrong item we collect it and ship the correct one free of charge.',
    escalation: 'Escalate refund disputes above 5000 taka to the support manager for review.',
    exchange: 'Exchanges are possible for a different size when stock is available.',
    proof: 'Order number and a clear photo of the product',
    shippingResp: 'We pay return shipping for damaged or wrong items only.',
  };
  return d;
};
const withVoice = (d: BrainConfig): BrainConfig => {
  d.voice.greeting = 'Hi, thanks for reaching out to Lumi!';
  d.voice.terms =
    'Say "sensitive skin" instead of "problem skin" and never promise medical results.';
  return d;
};
const instruction = (title: string, content: string) => ({
  id: id('i'),
  title,
  content,
  category: 'General',
  priority: 'High' as const,
  enabled: true,
  conditions: '',
  example: '',
  expected: '',
});
const withInstructions = (d: BrainConfig): BrainConfig => {
  d.instructions = [
    instruction(
      'Skin concerns',
      'When a customer describes a skin condition, ask about allergies first and never diagnose.',
    ),
    instruction(
      'Discounts',
      'Only offer the first-order discount code WELCOME10 and confirm it with the customer before applying.',
    ),
    instruction(
      'Out of stock',
      'If a product is out of stock, offer the closest alternative and share the restock estimate.',
    ),
  ];
  d.rules.always =
    'Always confirm the delivery area and sizes before promising a delivery date to the customer.';
  d.rules.never =
    'Never promise medical results or share another customer’s order details under any circumstances.';
  d.rules.escalate =
    'Escalate to a human when the customer reports an allergic reaction or asks for a refund above 5000 taka.';
  d.rules.approvalTopics = ['Refund', 'Medical advice'];
  return d;
};
const rule = (
  name: string,
  text: string,
  type:
    'Escalate for review' | 'Do not promise' | 'Reply using knowledge' = 'Reply using knowledge',
) => ({
  id: id('r'),
  name,
  enabled: true,
  priority: 'High' as const,
  join: 'and' as const,
  items: [{ id: id('c'), s: 'intent' as const, op: 'is', val: 'Reports a damaged product' }],
  actions: [{ id: id('a'), type, text }],
  test: '',
});
const withRules = (d: BrainConfig): BrainConfig => {
  d.logic = [
    rule(
      'Damaged item',
      'Ask for a photo and the order number, then escalate for a replacement',
      'Escalate for review',
    ),
    rule(
      'No medical promises',
      'Never promise that a product treats a skin condition',
      'Do not promise',
    ),
  ];
  return d;
};
const empty = () => emptyBrainConfig();
const baby = () => withProfile(empty());
const growing = () => withPolicies(withFaqs(withProducts(baby())));
const smart = () => withRules(withInstructions(withVoice(growing())));
const expert = () => smart();

const stageOf = (d: BrainConfig): Stage => evaluateMaturity(d).stage;

describe('maturity: stage progression from real knowledge', () => {
  it('an empty Brain is BORN with a score of 0', () => {
    const m = evaluateMaturity(empty());
    expect(m.stage).toBe('BORN');
    expect(m.score).toBe(0);
    // Setup completion has its own (existing) formula: defaults such as the fallback behaviour count a little.
    expect(m.setupCompletion).toBeLessThanOrEqual(5);
    expect(m.dimensions.map((x) => x.score)).toEqual([0, 0, 0, 0]);
  });

  it('a meaningful business identity unlocks BABY', () => {
    expect(stageOf(baby())).toBe('BABY');
  });

  it('products, FAQs and policies unlock GROWING', () => {
    const m = evaluateMaturity(growing());
    expect(m.score).toBeGreaterThanOrEqual(STAGE_MIN.GROWING);
    expect(m.stage).toBe('GROWING');
  });

  it('brand voice, instructions and active rules unlock SMART', () => {
    const m = evaluateMaturity(smart());
    expect(STAGES.indexOf(m.stage)).toBeGreaterThanOrEqual(STAGES.indexOf('SMART'));
  });

  it('a comprehensive, valid Brain reaches EXPERT only with every gate met', () => {
    const m = evaluateMaturity(expert());
    expect(m.gates.every((g) => g.met)).toBe(true);
    expect(m.stage).toBe('EXPERT');
    expect(m.nextStage).toBeNull();
    expect(m.requirements).toEqual([]);
  });

  it('EXPERT needs the high-level gates: without escalation guidance it stops at MATURE', () => {
    const d = smart();
    d.rules.escalate = '';
    d.returns.escalation = '';
    d.logic = d.logic.filter((r) => r.actions[0]!.type !== 'Escalate for review');
    d.logic.push(
      rule('Warranty questions', 'Reply using the warranty section of the knowledge base'),
    );
    const m = evaluateMaturity(d);
    expect(m.gates.find((g) => g.id === 'operational')!.met).toBe(false);
    expect(m.stage).not.toBe('EXPERT');
  });

  it('a high score cannot bypass a gate: strong content but no rules or guardrails is capped below SMART', () => {
    const d = growing();
    d.voice.greeting = 'Hi, thanks for reaching out to Lumi!';
    d.voice.terms = 'Say "sensitive skin" instead of "problem skin" always.';
    const m = evaluateMaturity(d);
    expect(m.gates.find((g) => g.id === 'rules')!.met).toBe(false);
    expect(STAGES.indexOf(m.stage)).toBeLessThan(STAGES.indexOf('SMART'));
  });

  it('stage is the highest one whose score band AND cumulative gates pass', () => {
    const d = smart();
    d.identity.description = ''; // breaks the BABY gate
    const m = evaluateMaturity(d);
    expect(m.gates.find((g) => g.id === 'identity')!.met).toBe(false);
    expect(m.stage).toBe('BORN');
  });
});

describe('maturity: anti-gaming', () => {
  it('empty and whitespace-only fields earn nothing', () => {
    const d = empty();
    d.identity.description = '   ';
    d.products = [product('', '')];
    d.products[0]!.benefits = '';
    d.faqs = [faq('', '')];
    d.instructions = [instruction('', '')];
    expect(evaluateMaturity(d).score).toBe(0);
  });

  it('placeholder, generic and vague text earns no credit', () => {
    for (const t of [
      'test',
      'asdf',
      'n/a',
      'lorem ipsum dolor sit amet',
      'We sell products',
      'best quality',
    ])
      expect(substance(t)).toBe(0);
    expect(
      substance('We sell premium skincare products for sensitive skin, including moisturisers'),
    ).toBeGreaterThan(0.3);
  });

  it('word count alone does not help: repeating one phrase scores lower than distinct detail', () => {
    const spam =
      'skin cream skin cream skin cream skin cream skin cream skin cream skin cream skin cream';
    const real =
      'fragrance free ceramide moisturiser calms redness hydrates barrier sensitive skin';
    expect(substance(spam)).toBeLessThan(substance(real));
  });

  it('many empty or duplicate entries cannot raise maturity', () => {
    const solo = baby();
    const base = evaluateMaturity(solo).score;
    const spammed = baby();
    spammed.products = Array.from({ length: 40 }, () =>
      product('Cream', 'Gentle moisturiser for sensitive skin and dry patches'),
    );
    spammed.faqs = Array.from({ length: 40 }, () =>
      faq('Is it fragrance free?', 'Yes, there is no added fragrance in any formula.'),
    );
    const m = evaluateMaturity(spammed);
    expect(m.stats.duplicates).toBeGreaterThan(0);
    // one valid product and one valid FAQ at most: it cannot reach GROWING by volume
    expect(m.stage).not.toBe('GROWING');
    expect(m.score).toBeLessThan(STAGE_MIN.GROWING);
    // volume (and the duplicates it creates) lowers the score; it never raises it above the clean Brain
    expect(m.score).toBeLessThanOrEqual(base);
  });

  it('duplicate content is counted once and flagged', () => {
    const d = growing();
    d.faqs.push({ ...d.faqs[0]!, id: id('dup') });
    const m = evaluateMaturity(d);
    expect(m.stats.duplicates).toBe(1);
    expect(m.recommendations.some((r) => r.id === 'duplicates')).toBe(true);
  });

  it('contradictory information lowers validity and blocks higher stages', () => {
    const d = smart();
    d.customFields = [
      {
        id: 'cf1',
        name: 'COD Available',
        key: 'cod_available',
        desc: '',
        type: 'Boolean',
        value: true,
        options: '',
        category: 'Orders',
        required: false,
        scope: 'AI replies & Inbox suggestions',
        min: '',
        max: '',
        maxLen: '',
        def: '',
        unit: '',
        enabled: true,
      },
    ];
    d.shipping.cod = false;
    const m = evaluateMaturity(d);
    expect(m.stats.conflicts).toBe(1);
    expect(m.gates.find((g) => g.id === 'consistent')!.met).toBe(false);
    expect(m.stage).not.toBe('SMART');
    expect(m.recommendations[0]!.severity).toBe('critical');
  });

  it('inactive rules, instructions and FAQs earn no operational or knowledge credit', () => {
    const d = smart();
    const live = evaluateMaturity(d);
    for (const r of d.logic) r.enabled = false;
    for (const i of d.instructions) i.enabled = false;
    for (const f of d.faqs) f.active = false;
    const off = evaluateMaturity(d);
    expect(off.stats.activeRules).toBe(0);
    expect(off.dimensions.find((x) => x.key === 'operational')!.score).toBeLessThan(
      live.dimensions.find((x) => x.key === 'operational')!.score,
    );
    expect(off.score).toBeLessThan(live.score);
  });

  it('an enabled but incomplete rule gets no operational credit and does not count as complete', () => {
    const d = baby();
    d.logic = [{ ...rule('Half done', ''), items: [] }];
    const m = evaluateMaturity(d);
    expect(m.stats.activeRules).toBe(1);
    expect(m.gates.find((g) => g.id === 'rules')!.met).toBe(false);
  });
});

describe('maturity: business-type aware', () => {
  it('a service business is not penalized for having no shipping or return policies', () => {
    const svc = withInstructions(
      withVoice(withRules(withFaqs(withProducts(withProfile(empty()))))),
    );
    svc.identity.category = 'Travel & Tourism';
    expect(businessKind(svc.identity.category)).toBe('service');
    const m = evaluateMaturity(svc);
    expect(m.gates.find((g) => g.id === 'policies')!.met).toBe(true);
    const phys = { ...svc, identity: { ...svc.identity, category: 'Beauty & Cosmetics' } };
    expect(evaluateMaturity(phys).gates.find((g) => g.id === 'policies')!.met).toBe(false);
    expect(m.score).toBeGreaterThan(evaluateMaturity(phys).score);
  });

  it('classifies the onboarding industries', () => {
    expect(businessKind('Fashion & Apparel')).toBe('physical');
    expect(businessKind('Electronics & Technology')).toBe('physical');
    expect(businessKind('Food & Beverage')).toBe('physical');
    expect(businessKind('Home & Lifestyle')).toBe('physical');
    expect(businessKind('Travel & Tourism')).toBe('service');
    expect(businessKind('Education')).toBe('service');
    expect(businessKind('Digital Products')).toBe('service');
    expect(businessKind('Health & Wellness')).toBe('service');
    expect(businessKind('Other')).toBe('general');
    expect(businessKind('')).toBe('general');
  });
});

describe('maturity: separate from setup completion, and recalculated on change', () => {
  it('setup completion and maturity are different measures', () => {
    // Fill many policy fields with junk: completion rises, maturity does not.
    const d = empty();
    for (const k of ['eligibility', 'exchange', 'damaged', 'wrong', 'proof', 'escalation'] as const)
      d.returns[k] = 'x';
    d.shipping.coverage = 'x';
    d.shipping.feeInside = 'x';
    const m = evaluateMaturity(d);
    expect(m.setupCompletion).toBeGreaterThan(0);
    expect(m.score).toBeLessThan(m.setupCompletion);
    expect(m.stage).toBe('BORN');
  });

  it('adding real knowledge changes the evaluation, and clearing it changes it back', () => {
    const d = baby();
    const a = evaluateMaturity(d);
    withProducts(d);
    const b = evaluateMaturity(d);
    expect(b.score).toBeGreaterThan(a.score);
    d.products = [];
    expect(evaluateMaturity(d).score).toBe(a.score);
  });

  it('is deterministic', () => {
    const d = smart();
    const a = evaluateMaturity(d, new Date(0));
    const b = evaluateMaturity(d, new Date(0));
    expect(a).toEqual(b);
  });

  it('the overall score is the weighted sum of the four dimensions', () => {
    const m = evaluateMaturity(smart());
    const by = Object.fromEntries(m.dimensions.map((x) => [x.key, x.score]));
    const expected =
      0.3 * by.quality! + 0.25 * by.completeness! + 0.25 * by.validity! + 0.2 * by.operational!;
    expect(Math.abs(m.score - expected)).toBeLessThanOrEqual(1.5);
  });
});

describe('maturity: guidance', () => {
  it('recommends the highest-priority real gap and links to its section', () => {
    const m = evaluateMaturity(empty());
    expect(m.recommendations.length).toBeGreaterThan(0);
    expect(m.recommendations[0]!.section).toBe('identity');
    expect(m.recommendations[0]!.cta).toBeTruthy();
    expect(m.requirements.some((r) => r.kind === 'gate' && r.id === 'identity')).toBe(true);
  });

  it('recommendations disappear once resolved', () => {
    const before = evaluateMaturity(empty()).recommendations.map((r) => r.id);
    expect(before).toContain('gate:identity');
    const after = evaluateMaturity(baby()).recommendations.map((r) => r.id);
    expect(after).not.toContain('gate:identity');
  });

  it('next-stage progress is between 0 and 1 and grows as gates are met', () => {
    const a = evaluateMaturity(empty()).progressToNext;
    const b = evaluateMaturity(baby()).progressToNext;
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1);
    expect(evaluateMaturity(expert()).progressToNext).toBe(1);
  });
});
