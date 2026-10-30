import { describe, expect, it } from 'vitest';
import {
  definitionSchema,
  emptyDefinition,
  evalCondition,
  evalGate,
  renderTemplate,
  TEMPLATES,
  triggerOf,
  validateDefinition,
  type Definition,
} from './automations';

const MEMBER = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const refs = { isMember: (id: string) => id === MEMBER };

describe('automation templates', () => {
  for (const t of TEMPLATES) {
    it(`“${t.name}” parses and, once its setup is done, validates`, () => {
      expect(definitionSchema.safeParse(t.definition).success).toBe(true);
      const configured: Definition = {
        ...t.definition,
        steps: t.definition.steps.map((s) =>
          s.type === 'action' && 'userId' in s.config ? { ...s, config: { userId: MEMBER } } : s,
        ),
      };
      expect(validateDefinition(configured, refs)).toEqual([]);
    });
  }
  it('assign template is not activatable until an assignee is chosen', () => {
    const t = TEMPLATES.find((x) => x.key === 'assign-new-leads')!;
    expect(validateDefinition(t.definition, refs).map((i) => i.message)).toEqual([
      expect.stringMatching(/assignee is required/),
    ]);
  });
});

describe('validation', () => {
  const base = (steps: Definition['steps'], trigger = 'order.created'): Definition => ({
    ...emptyDefinition(trigger),
    steps,
  });
  it('requires a known trigger and at least one action', () => {
    expect(validateDefinition(base([], 'nope'))[0]!.message).toMatch(/trigger/);
    expect(validateDefinition(base([]))[0]!.message).toMatch(/at least one action/);
  });
  it('rejects actions the trigger cannot provide an entity for', () => {
    const d = base(
      [{ id: 'a', type: 'action', action: 'add_conversation_note', config: { text: 'x' } }],
      'order.created',
    );
    expect(validateDefinition(d)[0]!.message).toMatch(/needs a conversation/);
    const lead = base(
      [{ id: 'a', type: 'action', action: 'add_customer_tag', config: { tag: 'x' } }],
      'lead.created',
    );
    expect(validateDefinition(lead)[0]!.message).toMatch(/needs a customer/);
  });
  it('rejects unknown fields, bad operators, bad enum and number values', () => {
    const cond = (field: string, op: 'equals' | 'gt' | 'contains', value: string): Definition =>
      base([
        { id: 'c', type: 'condition', conditions: [{ field, op, value }] },
        { id: 'a', type: 'action', action: 'add_order_note', config: { text: 'hi' } },
      ]);
    expect(validateDefinition(cond('lead.stage', 'equals', 'WON'))[0]!.message).toMatch(
      /isn’t available/,
    );
    expect(validateDefinition(cond('order.status', 'gt', '1'))[0]!.message).toMatch(
      /doesn’t apply/,
    );
    expect(validateDefinition(cond('order.status', 'equals', 'BOGUS'))[0]!.message).toMatch(
      /valid option/,
    );
    expect(validateDefinition(cond('order.total', 'equals', 'abc'))[0]!.message).toMatch(/number/);
    expect(validateDefinition(cond('order.total', 'gt', '10'))).toEqual([]);
  });
  it('only allows variables from the trigger context and ends flows with an action', () => {
    const note = (text: string): Definition =>
      base([{ id: 'a', type: 'action', action: 'add_order_note', config: { text } }]);
    expect(validateDefinition(note('{{order.number}} {{customer.name}}'))).toEqual([]);
    expect(validateDefinition(note('{{customer.email}}'))[0]!.message).toMatch(/isn’t available/);
    const dangling = base([
      { id: 'a', type: 'action', action: 'add_order_note', config: { text: 'x' } },
      { id: 'w', type: 'wait', minutes: 5 },
    ]);
    expect(validateDefinition(dangling).some((i) => /followed by an action/.test(i.message))).toBe(
      true,
    );
  });
  it('caps total waiting time', () => {
    const w = (id: string) => ({ id, type: 'wait' as const, minutes: 7 * 24 * 60 });
    const d = base([
      w('w1'),
      w('w2'),
      w('w3'),
      { id: 'a', type: 'action', action: 'add_order_note', config: { text: 'x' } },
    ]);
    expect(validateDefinition(d).some((i) => /14 days/.test(i.message))).toBe(true);
  });
  it('definition schema rejects unknown step types and oversized flows', () => {
    expect(
      definitionSchema.safeParse({
        schemaVersion: 1,
        trigger: { type: 'a' },
        steps: [{ id: 'x', type: 'script', code: '1' }],
      }).success,
    ).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `w${i}`, type: 'wait', minutes: 1 }));
    expect(
      definitionSchema.safeParse({ schemaVersion: 1, trigger: { type: 'a' }, steps: many }).success,
    ).toBe(false);
  });
});

describe('evaluation', () => {
  const trig = triggerOf('order.created')!;
  const ctx = {
    order: { total: 900, status: 'PENDING', channel: 'MANUAL' },
    customer: { tags: ['VIP', 'repeat'] },
  };
  it('compares enums, numbers and tags', () => {
    const c = (field: string, op: Parameters<typeof evalCondition>[0]['op'], value = '') =>
      evalCondition({ field, op, value }, ctx, trig);
    expect(c('order.status', 'equals', 'PENDING')).toBe(true);
    expect(c('order.status', 'not_equals', 'PENDING')).toBe(false);
    expect(c('order.total', 'gt', '500')).toBe(true);
    expect(c('order.total', 'lt', '500')).toBe(false);
    expect(c('customer.tags', 'contains', 'vip')).toBe(true);
    expect(c('customer.tags', 'not_contains', 'cold')).toBe(true);
    expect(c('nope', 'equals', 'x')).toBe(false);
  });
  it('a gate needs every condition to match', () => {
    const gate = (v: string) => ({
      id: 'g',
      type: 'condition' as const,
      conditions: [
        { field: 'order.status', op: 'equals' as const, value: 'PENDING' },
        { field: 'order.total', op: 'gt' as const, value: v },
      ],
    });
    expect(evalGate(gate('100'), ctx, trig)).toBe(true);
    expect(evalGate(gate('1000'), ctx, trig)).toBe(false);
  });
  it('renders only allowlisted variables as plain text; missing values are empty', () => {
    const t = triggerOf('conversation.assigned')!;
    const out = renderTemplate(
      'Hi {{customer.name}} {{customer.email}} {{ conversation.id }} <b>{{missing}}</b>',
      { customer: { name: 'Nadia' }, conversation: { id: undefined } },
      t,
    );
    expect(out).toBe('Hi Nadia   <b></b>');
  });
});
