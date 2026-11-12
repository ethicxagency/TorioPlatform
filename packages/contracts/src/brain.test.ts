import { describe, expect, it } from 'vitest';
import {
  areas,
  brainConfigSchema,
  changedSections,
  conflicts,
  emptyBrainConfig,
  issuesOf,
  readinessPct,
  ruleCheck,
  type BrainConfig,
} from './brain';
import { previewReply } from './brain-preview';

const base = (): BrainConfig => {
  const d = emptyBrainConfig();
  d.identity.name = 'UrbanNest';
  d.shipping = {
    ...d.shipping,
    feeInside: '60',
    feeOutside: '120',
    timeInside: '1–2 days',
    timeOutside: '3–5 days',
    cod: true,
    coverage: 'Nationwide',
  };
  d.returns.damaged = 'Send a photo within 48 hours and we will replace it.';
  d.returns.proof = 'Order number and photo';
  d.voice.greeting = 'Hi!';
  d.voice.emoji = 'None';
  return d;
};
const cf = (
  over: Partial<BrainConfig['customFields'][number]>,
): BrainConfig['customFields'][number] => ({
  id: 'cf1',
  name: 'Field',
  key: 'field',
  desc: '',
  type: 'Short text',
  value: '',
  options: '',
  category: 'General Business',
  required: false,
  scope: 'AI replies & Inbox suggestions',
  min: '',
  max: '',
  maxLen: '',
  def: '',
  unit: '',
  enabled: true,
  ...over,
});

describe('brain config', () => {
  it('empty config validates and is not pre-filled with business facts', () => {
    const e = emptyBrainConfig();
    expect(brainConfigSchema.safeParse(e).success).toBe(true);
    expect(e.identity.name).toBe('');
    expect(e.products).toEqual([]);
  });
  it('rejects oversized or malformed documents', () => {
    const e = emptyBrainConfig();
    expect(brainConfigSchema.safeParse({ ...e, voice: { ...e.voice, formality: 9 } }).success).toBe(
      false,
    );
    expect(
      brainConfigSchema.safeParse({
        ...e,
        faqs: Array.from({ length: 501 }, (_, i) => ({
          id: 'f' + i,
          q: 'q',
          a: 'a',
          cat: 'General',
          active: true,
        })),
      }).success,
    ).toBe(false);
  });
});

describe('validation & readiness', () => {
  it('requires a business name and required field values', () => {
    const d = emptyBrainConfig();
    expect(issuesOf(d).map((i) => i.sec)).toEqual(['identity']);
    d.identity.name = 'X';
    d.customFields = [cf({ required: true, value: '' })];
    expect(issuesOf(d)[0]!.text).toMatch(/Required field/);
  });
  it('flags duplicate custom field keys', () => {
    const d = base();
    d.customFields = [cf({ id: 'a', key: 'k', value: 'x' }), cf({ id: 'b', key: 'k', value: 'y' })];
    expect(issuesOf(d).some((i) => /share the same key/.test(i.text))).toBe(true);
  });
  it('readiness is derived from the current form state, 0 when empty', () => {
    expect(readinessPct(areas(emptyBrainConfig()))).toBeLessThan(25);
    const d = base();
    const before = readinessPct(areas(d));
    d.identity = {
      ...d.identity,
      category: 'Home',
      website: 'x.co',
      country: 'BD',
      market: 'Dhaka',
      languages: ['Bengali'],
      currency: 'BDT',
      description: 'd',
      audience: 'a',
      positioning: 'p',
      usp: 'u',
    };
    expect(readinessPct(areas(d))).toBeGreaterThan(before);
  });
  it('detects conflicts between a custom field and a policy', () => {
    const d = base();
    d.customFields = [
      cf({ key: 'cod_available', name: 'COD Available', type: 'Boolean', value: false }),
    ];
    expect(conflicts(d)[0]!.text).toMatch(/COD Available/);
    expect(areas(d).find((a) => a.key === 'fields')!.review).toBe(true);
  });
  it('tracks which sections changed', () => {
    const a = base();
    const b = structuredClone(a);
    b.voice.tone = 'Premium';
    b.faqs.push({ id: 'f1', q: 'q', a: 'a', cat: 'General', active: true });
    expect(changedSections(a, b).sort()).toEqual(['Brand voice', 'Knowledge base']);
    expect(changedSections(a, a)).toEqual([]);
  });
  it('rule check finds incomplete conditions and actions', () => {
    const d = base();
    const r = {
      id: 'r',
      name: 'R',
      enabled: true,
      priority: 'High' as const,
      join: 'and' as const,
      items: [{ id: 'c', s: 'intent' as const, op: 'is', val: '' }],
      actions: [],
      test: '',
    };
    expect(ruleCheck(d, r).issues).toEqual(expect.arrayContaining(['value', 'action']));
  });
});

describe('previewReply (rule-based simulation, not AI)', () => {
  it('answers delivery fees from policy and cites the source', () => {
    const p = previewReply('Delivery charge koto? Dhaka', base());
    expect(p.text).toContain('৳60');
    expect(p.sources).toContain('Customer Policies: delivery fees');
  });
  it('asks for the location when a rule says so', () => {
    const d = base();
    d.logic = [
      {
        id: 'r1',
        name: 'Ask location',
        enabled: true,
        priority: 'High',
        join: 'and',
        items: [
          { id: 'c1', s: 'intent', op: 'is', val: 'Asks about delivery charges' },
          { id: 'c2', s: 'location', op: 'is', val: 'unknown' },
        ],
        actions: [{ id: 'a1', type: 'Ask the customer', text: 'Inside or outside Dhaka?' }],
        test: '',
      },
    ];
    const p = previewReply('Delivery charge koto?', d);
    expect(p.text).toContain('Inside or outside Dhaka?');
    expect(p.rules).toEqual(['Ask location']);
  });
  it('never invents facts: falls back and lists what is missing', () => {
    const d = emptyBrainConfig();
    d.identity.name = 'X';
    const p = previewReply('What is your return policy?', d);
    expect(p.fallback).toBe(true);
    expect(p.missing).toContain('Return eligibility');
  });
  it('requires review for approval-listed topics', () => {
    const d = base();
    d.rules.approvalTopics = ['Discounts'];
    expect(previewReply('Can I get a discount?', d).approval).toBe(true);
  });
  it('flags configuration conflicts instead of answering confidently', () => {
    const d = base();
    d.customFields = [
      cf({ key: 'cod_available', name: 'COD Available', type: 'Boolean', value: false }),
    ];
    const p = previewReply('Do you offer cash on delivery?', d);
    expect(p.attention?.text).toMatch(/COD Available/);
    expect(p.confidence).toBe('Low');
  });
});

describe('shipping provider and payment method records', () => {
  it('a Brain saved before disable and notes existed still parses, with empty defaults', () => {
    const old = structuredClone(emptyBrainConfig()) as Record<string, any>;
    for (const k of ['providersOff', 'providerNotes', 'paymentsOff', 'paymentNotes'])
      delete old.shipping[k];
    old.shipping.providers = ['Pathao'];
    const r = brainConfigSchema.safeParse(old);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.shipping.providers).toEqual(['Pathao']);
    expect(r.data.shipping.providersOff).toEqual([]);
    expect(r.data.shipping.paymentNotes).toEqual({});
  });

  it('keeps disabled entries and per-name notes, and rejects an over-long note', () => {
    const c = emptyBrainConfig();
    c.shipping.paymentsOff = ['bKash'];
    c.shipping.paymentNotes = { bKash: 'Send Money' };
    expect(brainConfigSchema.safeParse(c).success).toBe(true);
    c.shipping.paymentNotes = { bKash: 'x'.repeat(301) };
    expect(brainConfigSchema.safeParse(c).success).toBe(false);
  });
});
