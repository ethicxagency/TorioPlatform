/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles stand in for the Prisma client */
import {
  DEFAULT_AI_BUDGETS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_PLAN_LIMIT,
  type AiSettings,
} from '@torio/contracts';
import { describe, expect, it } from 'vitest';
import { AiLimitsService, monthStart } from './ai-limits.service';

const settings = (over: Partial<AiSettings> = {}): AiSettings => ({
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  ...over,
});

/** A tiny fake of the tables the limits read: requests (per workspace) and calls (per provider), with creation times. */
function fake(opts: {
  sub?: { planKey: string; status: string } | null;
  requests?: {
    workspaceId: string;
    status: string;
    inputTokens: number;
    outputTokens: number;
    costMicros: number | null;
    createdAt: Date;
  }[];
  calls?: { provider: string; costMicros: number | null; createdAt: Date }[];
}) {
  const requests = opts.requests ?? [];
  const calls = opts.calls ?? [];
  const prisma = {
    client: {
      subscription: { findUnique: async () => opts.sub ?? null },
      aiRequest: {
        aggregate: async ({ where }: any) => {
          const rows = requests.filter(
            (r) =>
              (!where.workspaceId || r.workspaceId === where.workspaceId) &&
              r.createdAt >= where.createdAt.gte &&
              (!where.status || r.status !== where.status.not),
          );
          return {
            _count: { _all: rows.length },
            _sum: {
              inputTokens: rows.reduce((n, r) => n + r.inputTokens, 0),
              outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
              costMicros: rows.reduce((n, r) => n + (r.costMicros ?? 0), 0),
            },
          };
        },
      },
      aiCall: {
        aggregate: async ({ where }: any) => ({
          _sum: {
            costMicros: calls
              .filter((c) => c.provider === where.provider && c.createdAt >= where.createdAt.gte)
              .reduce((n, c) => n + (c.costMicros ?? 0), 0),
          },
        }),
        count: async ({ where }: any) =>
          calls.filter((c) => c.provider === where.provider && c.createdAt >= where.createdAt.gte)
            .length,
      },
    },
  };
  return new AiLimitsService(prisma as never);
}
const now = new Date();
const req = (ws: string, over: Record<string, unknown> = {}) => ({
  workspaceId: ws,
  status: 'succeeded',
  inputTokens: 1000,
  outputTokens: 200,
  costMicros: 1000,
  createdAt: now,
  ...over,
});
const LONG_AGO = new Date(Date.UTC(2020, 0, 1));

describe('plan allowance', () => {
  it('uses the subscription plan, or "free" without an active one, and the default limit when the plan has none', async () => {
    expect(await fake({ sub: { planKey: 'growth', status: 'ACTIVE' } }).planKey('w')).toBe(
      'growth',
    );
    expect(await fake({ sub: { planKey: 'growth', status: 'CANCELED' } }).planKey('w')).toBe(
      'free',
    );
    expect(await fake({}).planKey('w')).toBe('free');
    const l = fake({});
    const s = settings({
      planLimits: { growth: { ...DEFAULT_PLAN_LIMIT, included: true, monthlyRequests: 50 } },
    });
    expect(l.limitFor(s, 'growth').monthlyRequests).toBe(50);
    expect(l.limitFor(s, 'starter')).toEqual(DEFAULT_PLAN_LIMIT);
  });
  it('is not included by default: nothing is assumed unlimited', async () => {
    const a = await fake({}).allowance('w', settings());
    expect(a.limit.included).toBe(false);
    expect(a.blocked).toMatch(/not included in your plan/);
  });
  it('counts this month only, per workspace, and blocks at the request cap', async () => {
    const l = fake({
      sub: { planKey: 'growth', status: 'ACTIVE' },
      requests: [
        req('w'),
        req('w'),
        req('w', { createdAt: LONG_AGO }),
        req('other'),
        req('w', { status: 'failed' }),
      ],
    });
    const s = settings({
      planLimits: { growth: { ...DEFAULT_PLAN_LIMIT, included: true, monthlyRequests: 2 } },
    });
    const a = await l.allowance('w', s);
    expect(a.usage).toMatchObject({ requests: 2, requestLimit: 2, tokens: 2400 });
    expect(a.blocked).toMatch(/used all 2 AI drafts/);
    const roomy = await l.allowance(
      'w',
      settings({
        planLimits: { growth: { ...DEFAULT_PLAN_LIMIT, included: true, monthlyRequests: 10 } },
      }),
    );
    expect(roomy.blocked).toBeNull();
  });
  it('blocks at the token cap, and a null cap means no cap', async () => {
    const l = fake({
      sub: { planKey: 'p', status: 'ACTIVE' },
      requests: [req('w', { inputTokens: 5000, outputTokens: 1000 })],
    });
    const base = { ...DEFAULT_PLAN_LIMIT, included: true, monthlyRequests: null };
    expect(
      (await l.allowance('w', settings({ planLimits: { p: { ...base, monthlyTokens: 6000 } } })))
        .blocked,
    ).toMatch(/allowance/);
    expect(
      (await l.allowance('w', settings({ planLimits: { p: { ...base, monthlyTokens: null } } })))
        .blocked,
    ).toBeNull();
  });
  it('starts each month fresh', () => {
    expect(monthStart(new Date('2026-11-23T10:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(monthStart(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });
  it('multi-model is a plan feature', () => {
    const l = fake({});
    expect(l.allows({ ...DEFAULT_PLAN_LIMIT, multiModel: false }, 'synthesis')).toBe(false);
    expect(l.allows({ ...DEFAULT_PLAN_LIMIT, multiModel: false }, 'auto')).toBe(true);
    expect(l.allows({ ...DEFAULT_PLAN_LIMIT, multiModel: true }, 'synthesis')).toBe(true);
  });
});

describe('budgets', () => {
  const open = { ...DEFAULT_PLAN_LIMIT, included: true, monthlyRequests: null };
  const sub = { planKey: 'p', status: 'ACTIVE' };
  it('blocks when the platform or workspace budget is reached, but only when the policy is "block"', async () => {
    const l = fake({
      sub,
      requests: [req('w', { costMicros: 600_000 }), req('x', { costMicros: 500_000 })],
    });
    const budgets = { ...DEFAULT_AI_BUDGETS, monthlyMicros: 1_000_000 };
    expect(
      (await l.allowance('w', settings({ planLimits: { p: open }, budgets }))).blocked,
    ).toMatch(/paused for this month/);
    expect(
      (
        await l.allowance(
          'w',
          settings({ planLimits: { p: open }, budgets: { ...budgets, onLimit: 'alert' } }),
        )
      ).blocked,
    ).toBeNull();
    const ws = { ...DEFAULT_AI_BUDGETS, workspaceMicros: 500_000 };
    expect(
      (await l.allowance('w', settings({ planLimits: { p: open }, budgets: ws }))).blocked,
    ).toMatch(/workspace has reached its AI limit/);
    expect(
      (
        await l.allowance(
          'x',
          settings({ planLimits: { p: open }, budgets: { ...ws, workspaceMicros: 900_000 } }),
        )
      ).blocked,
    ).toBeNull();
  });
  it('blocks a provider over its monthly spend or its requests per minute, without touching others', async () => {
    const l = fake({
      calls: [
        { provider: 'openai', costMicros: 800_000, createdAt: now },
        { provider: 'openai', costMicros: 300_000, createdAt: LONG_AGO },
        { provider: 'gemini', costMicros: 10, createdAt: now },
        { provider: 'gemini', costMicros: 10, createdAt: now },
      ],
    });
    const s = settings({
      budgets: { ...DEFAULT_AI_BUDGETS, providerMicros: { openai: 800_000 } },
      providerRpm: { gemini: 2 },
    });
    expect(await l.providerBlock('openai', s)).toBe('budget');
    expect(await l.providerBlock('gemini', s)).toBe('rate_limit');
    expect(await l.providerBlock('gemini', settings({ providerRpm: { gemini: 3 } }))).toBeNull();
    expect(await l.providerBlock('openai', settings())).toBeNull();
  });
  it('raises alerts at the threshold and again at the limit', async () => {
    const l = fake({
      requests: [req('w', { costMicros: 850_000 })],
      calls: [{ provider: 'openai', costMicros: 1_000_000, createdAt: now }],
    });
    const s = settings({
      budgets: {
        ...DEFAULT_AI_BUDGETS,
        monthlyMicros: 1_000_000,
        providerMicros: { openai: 1_000_000 },
        alertPercent: 80,
      },
    });
    const r = await l.alerts(s);
    expect(r.alerts).toContainEqual(
      expect.objectContaining({ scope: 'platform', percent: 85, level: 'warning' }),
    );
    expect(r.alerts).toContainEqual(
      expect.objectContaining({
        scope: 'provider',
        provider: 'openai',
        percent: 100,
        level: 'limit',
      }),
    );
    expect((await l.alerts(settings())).alerts).toEqual([]); // no budget, no alert
  });
});
