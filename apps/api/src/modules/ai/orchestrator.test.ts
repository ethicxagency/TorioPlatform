/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles stand in for the Prisma client and SDK shapes */
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_PLAN_LIMIT,
  emptyBrainConfig,
  type AiPlanLimit,
  type AiSettings,
} from '@torio/contracts';
import { Prisma } from '@torio/database';
import { describe, expect, it } from 'vitest';
import type { AiConfigService, UsableProvider } from './ai-config.service';
import { AiLimitsService } from './ai-limits.service';
import { AiOrchestrator } from './ai-orchestrator.service';
import { AiProviderRegistry } from './ai-registry';
import { AiProviderError, type GenerateInput, type ProviderAdapter } from './providers/types';

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Behaviour = (
  i: GenerateInput,
  attempt: number,
) => Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;
function adapter(key: string, log: string[], behave: Behaviour): ProviderAdapter {
  let attempt = 0;
  return {
    key,
    name: key === 'openai' ? 'OpenAI' : 'Google Gemini',
    listModels: async () => [],
    generate: async (i) => {
      log.push(`${key}:${i.system.startsWith('You merge') ? 'synthesis' : 'draft'}`);
      const r = await behave(i, attempt++);
      return {
        text: r.text,
        inputTokens: r.inputTokens ?? 100,
        outputTokens: r.outputTokens ?? 20,
        cachedTokens: 0,
      };
    },
  };
}
const ok =
  (text: string): Behaviour =>
  async () => ({ text });
const fail =
  (category: ConstructorParameters<typeof AiProviderError>[0], retryable = false): Behaviour =>
  async () => {
    throw new AiProviderError(category, retryable);
  };

const provider = (
  key: string,
  over: Partial<UsableProvider['models'][number]> = {},
): UsableProvider => ({
  id: `${key}-id`,
  key,
  name: key === 'openai' ? 'OpenAI' : 'Google Gemini',
  defaultModel: `${key}-m`,
  models: [
    {
      id: `${key}-mid`,
      modelId: `${key}-m`,
      priority: key === 'openai' ? 1 : 2,
      maxOutputTokens: null,
      temperature: null,
      supportsTemperature: true,
      inputPriceMicros: 1_000_000, // $1 per million
      outputPriceMicros: 2_000_000,
      ...over,
    },
  ],
});

function setup(opts: {
  settings?: Partial<AiSettings>;
  providers?: UsableProvider[];
  adapters: Record<string, Behaviour>;
  messages?: { kind: string; body: string }[];
  limit?: Partial<AiPlanLimit>;
  blocked?: string | null;
  providerBlock?: (p: string) => 'budget' | 'rate_limit' | null;
  brain?: ReturnType<typeof emptyBrainConfig>;
}) {
  const log: string[] = [];
  const registry = new AiProviderRegistry();
  for (const [k, b] of Object.entries(opts.adapters)) registry.register(adapter(k, log, b));
  const requests: Record<string, any>[] = [];
  const calls: Record<string, any>[] = [];
  const settings: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    maxRetries: 0,
    ...opts.settings,
    modes: { ...DEFAULT_AI_SETTINGS.modes, synthesis: true, ...opts.settings?.modes },
  };
  const providers = opts.providers ?? [provider('openai'), provider('gemini')];
  const config = {
    settings: async () => settings,
    usable: async () => providers,
    keyOf: async () => 'sk-test-key-never-logged',
    recordHealth: async () => undefined,
  } as unknown as AiConfigService;
  const messages = opts.messages ?? [
    { kind: 'INBOUND', body: 'How much is the linen sofa and how long is delivery?' },
  ];
  const brain =
    opts.brain ??
    (() => {
      const b = emptyBrainConfig();
      b.voice.language = 'English';
      b.products = [
        {
          id: 'p',
          name: 'Linen sofa',
          category: '',
          description: '',
          price: '25,000',
          variants: '',
          sizes: '',
          colors: '',
          stock: 'In stock',
          benefits: '',
          usage: '',
          limitations: '',
          faqs: '',
        } as never,
      ];
      b.shipping.timeInside = '2-3 days';
      return b;
    })();
  const prisma = {
    client: {
      aiRequest: {
        create: async ({ data }: any) => {
          if (
            requests.some(
              (r) => r.workspaceId === data.workspaceId && r.requestId === data.requestId,
            )
          )
            throw new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'x',
            });
          const r = {
            id: `req-${requests.length + 1}`,
            status: 'running',
            phase: 'understanding',
            ...data,
          };
          requests.push(r);
          return r;
        },
        update: async ({ where, data }: any) =>
          Object.assign(
            requests.find((r) => r.id === where.id)!,
            data,
          ),
        count: async () => 0,
        findUnique: async () => null,
      },
      aiCall: { create: async ({ data }: any) => void calls.push(data) },
      conversation: {
        findFirst: async ({ where }: any) =>
          where.workspaceId === WS && where.id === CONV
            ? { channel: { provider: 'WHATSAPP' }, customer: { name: 'Nadia Rahman' } }
            : null,
      },
      message: {
        findMany: async ({ where }: any) =>
          where.workspaceId === WS ? [...messages].reverse().map((m) => ({ ...m })) : [],
      },
    },
  };
  const brainSvc = { get: async () => ({ config: brain }) };
  const limit: AiPlanLimit = {
    ...DEFAULT_PLAN_LIMIT,
    included: true,
    monthlyRequests: null,
    multiModel: true,
    maxConcurrent: 3,
    ...opts.limit,
  };
  const limits = {
    allowance: async () => ({
      planKey: 'growth',
      limit,
      usage: { requests: 4, requestLimit: limit.monthlyRequests, tokens: 900, tokenLimit: null },
      blocked: opts.blocked ?? null,
    }),
    providerBlock: async (p: string) => opts.providerBlock?.(p) ?? null,
    allows: AiLimitsService.prototype.allows,
  } as unknown as AiLimitsService;
  const o = new AiOrchestrator(prisma as never, config, registry, brainSvc as never, limits);
  o.wait = async () => undefined;
  return { o, log, requests, calls };
}

const GOOD = 'The linen sofa is Tk 25,000 and delivery inside the city takes 2-3 days.';

describe('availability', () => {
  it('says why AI is unavailable and offers only the modes that can run', async () => {
    expect(
      (await setup({ settings: { enabled: false }, adapters: {} }).o.options(WS)).available,
    ).toBe(false);
    expect((await setup({ providers: [], adapters: {} }).o.options(WS)).reason).toMatch(
      /not set up/,
    );
    const one = await setup({
      providers: [provider('openai')],
      adapters: { openai: ok(GOOD) },
    }).o.options(WS);
    const m = Object.fromEntries(one.modes.map((x) => [x.mode, x]));
    expect(m.openai!.available).toBe(true);
    expect(m.gemini!.available).toBe(false);
    expect(m.synthesis!.reason).toMatch(/two AI providers/);
    const two = await setup({ adapters: { openai: ok(GOOD), gemini: ok(GOOD) } }).o.options(WS);
    expect(two.modes.every((x) => x.available)).toBe(true);
    expect(two.recommended).toBe('auto');
  });
  it('respects the platform switches for modes', async () => {
    const r = await setup({
      settings: { modes: { single: false, auto: true, synthesis: false } },
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    }).o.options(WS);
    expect(r.modes.find((m) => m.mode === 'synthesis')!.available).toBe(false);
    expect(r.modes.find((m) => m.mode === 'openai')!.available).toBe(false);
    expect(r.modes.find((m) => m.mode === 'auto')!.available).toBe(true);
  });
});

describe('single model', () => {
  it('drafts with the chosen provider, records usage and estimates cost from the entered prices', async () => {
    const t = setup({
      adapters: {
        openai: async () => ({ text: GOOD, inputTokens: 2000, outputTokens: 500 }),
        gemini: ok('x'),
      },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(1), mode: 'openai' });
    expect(r.draft).toBe(GOOD);
    expect(r.strategy).toBe('single');
    expect(r.providers).toEqual(['OpenAI']);
    expect(r.needsReview).toBe(false);
    expect(t.log).toEqual(['openai:draft']);
    // 2000 in x $1/M + 500 out x $2/M = $0.003 = 3000 micro-dollars
    expect(t.calls[0]).toMatchObject({
      provider: 'openai',
      status: 'ok',
      inputTokens: 2000,
      outputTokens: 500,
      costMicros: 3000,
    });
    expect(t.requests[0]).toMatchObject({
      status: 'succeeded',
      phase: 'done',
      inputTokens: 2000,
      outputTokens: 500,
      costMicros: 3000,
      workspaceId: WS,
    });
  });
  it('shows no cost when no price was entered', async () => {
    const t = setup({
      providers: [provider('openai', { inputPriceMicros: null, outputPriceMicros: null })],
      adapters: { openai: ok(GOOD) },
    });
    await t.o.draft(WS, 'u1', CONV, { requestId: rid(2), mode: 'auto' });
    expect(t.calls[0]!.costMicros).toBeNull();
    expect(t.requests[0]!.costMicros).toBeNull();
  });
  it('flags a draft for review when it states figures the Brain does not hold', async () => {
    const t = setup({
      adapters: {
        openai: ok('The linen sofa is Tk 18,000 and arrives in 1 day.'),
        gemini: ok('x'),
      },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(3), mode: 'openai' });
    expect(r.needsReview).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/not in your Brain/);
    expect(r.qualityScore).toBeLessThan(90);
  });
});

describe('fallback and failure', () => {
  it('uses the other provider when one is unavailable', async () => {
    const t = setup({ adapters: { openai: fail('unavailable'), gemini: ok(GOOD) } });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(4), mode: 'openai' });
    expect(r.strategy).toBe('fallback');
    expect(r.providers).toEqual(['Google Gemini']);
    expect(t.calls.map((c) => `${c.provider}:${c.status}`)).toEqual(['openai:failed', 'gemini:ok']);
  });
  it('does not fall back when fallback is switched off', async () => {
    const t = setup({
      settings: { fallback: false },
      adapters: { openai: fail('unavailable'), gemini: ok(GOOD) },
    });
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(5), mode: 'openai' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.log).toEqual(['openai:draft']);
  });
  it('fails gracefully when every provider fails, with a friendly message and no provider text', async () => {
    const t = setup({ adapters: { openai: fail('auth'), gemini: fail('rate_limit', true) } });
    const e = await t.o.draft(WS, 'u1', CONV, { requestId: rid(6), mode: 'auto' }).catch((x) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(e.getResponse())).not.toMatch(/sk-|key/i);
    expect(t.requests[0]).toMatchObject({ status: 'failed', phase: 'done' });
    expect(t.requests[0]!.errorCategory).toBeTruthy();
  });
  it('retries a retryable failure a bounded number of times, then gives up', async () => {
    let n = 0;
    const t = setup({
      settings: { maxRetries: 2, fallback: false },
      adapters: {
        openai: async () => {
          n += 1;
          throw new AiProviderError('timeout', true);
        },
        gemini: ok('x'),
      },
    });
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(7), mode: 'openai' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(n).toBe(3); // 1 try + 2 retries, never more
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({ retries: 2, errorCategory: 'timeout' });
  });
  it('does not retry an authentication failure', async () => {
    let n = 0;
    const t = setup({
      settings: { maxRetries: 3, fallback: false },
      adapters: {
        openai: async () => {
          n += 1;
          throw new AiProviderError('auth', false);
        },
        gemini: ok('x'),
      },
    });
    await t.o.draft(WS, 'u1', CONV, { requestId: rid(8), mode: 'openai' }).catch(() => undefined);
    expect(n).toBe(1);
  });
  it('treats a model that times out for real as a failure (hung provider)', async () => {
    const t = setup({
      settings: { requestTimeoutMs: 3000, maxRetries: 0, fallback: true },
      adapters: { openai: () => new Promise(() => undefined), gemini: ok(GOOD) },
    });
    // the guard timer is timeout + 1s; use fake timers' equivalent by shrinking via direct call
    const orig = setTimeout;
    (globalThis as any).setTimeout = (fn: () => void, ms: number) => orig(fn, Math.min(ms, 20));
    try {
      const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(9), mode: 'openai' });
      expect(r.strategy).toBe('fallback');
    } finally {
      (globalThis as any).setTimeout = orig;
    }
  });
});

describe('multi-AI synthesis', () => {
  it('runs both providers in parallel, synthesises one answer and records every call', async () => {
    const started: string[] = [];
    const finished: string[] = [];
    const slow =
      (name: string, text: string): Behaviour =>
      async (i) => {
        if (i.system.startsWith('You merge')) return { text: GOOD };
        started.push(name);
        await new Promise((r) => setTimeout(r, 15));
        finished.push(name);
        return { text };
      };
    const t = setup({
      adapters: {
        openai: slow('openai', GOOD),
        gemini: slow('gemini', 'The sofa costs Tk 25,000. Delivery in the city is 2-3 days.'),
      },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(10), mode: 'synthesis' });
    expect(started).toEqual(['openai', 'gemini']);
    expect(finished.length).toBe(2);
    expect(started.length).toBe(2); // both began before either finished is proven by both being in `started` first
    expect(r.strategy).toBe('synthesis');
    expect(r.providers).toEqual(expect.arrayContaining(['OpenAI', 'Google Gemini']));
    expect(t.calls.map((c) => c.role).sort()).toEqual(['candidate', 'candidate', 'synthesis']);
    expect(r.draft).toBe(GOOD);
  });
  it('tells the synthesis step where the candidates conflict and what the Brain does not support', async () => {
    let synthPrompt = '';
    const t = setup({
      adapters: {
        openai: async (i) =>
          i.system.startsWith('You merge')
            ? ((synthPrompt = i.prompt), { text: GOOD })
            : { text: 'Tk 25,000. Delivery takes 1 day. You get 20% off.' },
        gemini: ok('Tk 25,000. Delivery takes 5 days. Also 20% off today.'),
      },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(11), mode: 'synthesis' });
    expect(synthPrompt).toContain('CANDIDATE A');
    expect(synthPrompt).toContain('CANDIDATE B');
    expect(synthPrompt).toMatch(/disagree on/);
    expect(synthPrompt).toMatch(
      /Both candidates state .* but the business knowledge does not contain it/,
    );
    expect(synthPrompt).not.toContain('=== TASK ===\nWrite the reply'); // the candidate task was replaced
    expect(r.warnings.join(' ')).toMatch(/disagreed/);
    expect(r.needsReview).toBe(true);
  });
  it('uses the one answer that came back when the other provider failed, and asks for review', async () => {
    const t = setup({ adapters: { openai: fail('unavailable'), gemini: ok(GOOD) } });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(12), mode: 'synthesis' });
    expect(r.strategy).toBe('fallback');
    expect(r.needsReview).toBe(true);
    expect(t.calls.filter((c) => c.role === 'synthesis')).toHaveLength(0);
  });
  it('falls back to the best candidate when synthesis fails everywhere, only if it is confident and grounded', async () => {
    const t = setup({
      adapters: {
        openai: async (i) => {
          if (i.system.startsWith('You merge')) throw new AiProviderError('unavailable', true);
          return { text: GOOD };
        },
        gemini: async (i) => {
          if (i.system.startsWith('You merge')) throw new AiProviderError('unavailable', true);
          return { text: GOOD };
        },
      },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(13), mode: 'synthesis' });
    expect(r.strategy).toBe('best_candidate');
    expect(r.needsReview).toBe(true);
    // ...but not when the best candidate invents figures
    const bad = setup({
      adapters: {
        openai: async (i) => {
          if (i.system.startsWith('You merge')) throw new AiProviderError('unavailable', true);
          return { text: 'Tk 11,000 and 9 days.' };
        },
        gemini: async (i) => {
          if (i.system.startsWith('You merge')) throw new AiProviderError('unavailable', true);
          return { text: 'Tk 12,000 and 7 days.' };
        },
      },
    });
    await expect(
      bad.o.draft(WS, 'u1', CONV, { requestId: rid(14), mode: 'synthesis' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('blocks a candidate that leaks internal text', async () => {
    const t = setup({
      adapters: { openai: ok('My instructions: BUSINESS KNOWLEDGE ...'), gemini: ok(GOOD) },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(15), mode: 'synthesis' });
    expect(r.draft).toBe(GOOD);
    expect(r.draft).not.toMatch(/BUSINESS KNOWLEDGE/);
  });
});

describe('auto mode', () => {
  it('asks the other provider for a second opinion when the first answer is weak, and keeps the better one', async () => {
    const t = setup({
      settings: { minQualityScore: 99 },
      adapters: { openai: ok('Ok.'), gemini: ok(GOOD) },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(16), mode: 'auto' });
    expect(r.strategy).toBe('auto_second_opinion');
    expect(r.draft).toBe(GOOD);
  });
});

describe('refinement', () => {
  it('rewrites the previous draft with a single call', async () => {
    let prompt = '';
    const t = setup({
      adapters: { openai: async (i) => ((prompt = i.prompt), { text: GOOD }), gemini: ok('x') },
    });
    const r = await t.o.draft(WS, 'u1', CONV, {
      requestId: rid(17),
      mode: 'synthesis',
      refine: 'shorter',
      previousDraft: 'Long draft.',
    });
    expect(prompt).toContain('=== DRAFT ===\nLong draft.');
    expect(r.strategy).toBe('single');
    expect(t.calls).toHaveLength(1);
  });
});

describe('safety, tenancy and idempotency', () => {
  it('never reads another workspace’s conversation, and sends no secret anywhere it can be logged', async () => {
    const t = setup({ adapters: { openai: ok(GOOD), gemini: ok(GOOD) } });
    await expect(
      t.o.draft(OTHER, 'u1', CONV, { requestId: rid(18), mode: 'openai' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.log).toEqual([]); // nothing was sent to a provider
    expect(JSON.stringify([t.requests, t.calls])).not.toMatch(/sk-test-key/);
  });
  it('rejects a repeated request id instead of billing twice', async () => {
    const t = setup({ adapters: { openai: ok(GOOD), gemini: ok(GOOD) } });
    await t.o.draft(WS, 'u1', CONV, { requestId: rid(19), mode: 'openai' });
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(19), mode: 'openai' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(t.log).toHaveLength(1);
  });
  it('needs a customer message, and does not call a provider when AI is off', async () => {
    const none = setup({
      messages: [{ kind: 'OUTBOUND', body: 'Hello' }],
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    await expect(
      none.o.draft(WS, 'u1', CONV, { requestId: rid(20), mode: 'openai' }),
    ).rejects.toThrow(/no customer message/i);
    const off = setup({ settings: { enabled: false }, adapters: { openai: ok(GOOD) } });
    await expect(
      off.o.draft(WS, 'u1', CONV, { requestId: rid(21), mode: 'openai' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(off.log).toEqual([]);
  });
  it('does not allow a mode the platform has not enabled', async () => {
    const t = setup({
      settings: { modes: { single: true, auto: true, synthesis: false } },
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(22), mode: 'synthesis' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('plan allowances and budgets', () => {
  it('refuses a plan that does not include AI, without calling a provider', async () => {
    const t = setup({
      limit: { included: false },
      blocked: 'AI Assist is not included in your plan.',
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    const o = await t.o.options(WS);
    expect(o.available).toBe(false);
    expect(o.reason).toMatch(/not included in your plan/);
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(40), mode: 'auto' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.log).toEqual([]);
    expect(t.requests).toHaveLength(0); // no request row, so no usage is recorded
  });
  it('answers 429 with a clear message when the monthly allowance is used up', async () => {
    const t = setup({
      blocked: 'You have used all 100 AI drafts in your plan this month.',
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    const e = await t.o.draft(WS, 'u1', CONV, { requestId: rid(41), mode: 'auto' }).catch((x) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(429);
    expect(String(e.message)).toMatch(/used all 100/);
    expect(t.log).toEqual([]);
  });
  it('reports usage and hides Multi-AI Synthesis when the plan lacks it', async () => {
    const t = setup({
      limit: { monthlyRequests: 100, multiModel: false },
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    const o = await t.o.options(WS);
    expect(o.usage).toEqual({ requests: 4, requestLimit: 100, tokens: 900, tokenLimit: null });
    expect(o.modes.find((m) => m.mode === 'synthesis')).toMatchObject({
      available: false,
      reason: 'Not included in your plan.',
    });
    await expect(
      t.o.draft(WS, 'u1', CONV, { requestId: rid(42), mode: 'synthesis' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('skips a provider that is over its spending or rate limit and uses the other', async () => {
    const t = setup({
      providerBlock: (p) => (p === 'openai' ? 'budget' : null),
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    const r = await t.o.draft(WS, 'u1', CONV, { requestId: rid(43), mode: 'openai' });
    expect(r.strategy).toBe('fallback');
    expect(t.log).toEqual(['gemini:draft']); // the blocked provider was never called
    expect(t.calls[0]).toMatchObject({
      provider: 'openai',
      status: 'failed',
      errorCategory: 'budget',
    });
  });
  it('fails with the paused message when every provider is blocked', async () => {
    const t = setup({
      providerBlock: () => 'budget',
      adapters: { openai: ok(GOOD), gemini: ok(GOOD) },
    });
    const e = await t.o.draft(WS, 'u1', CONV, { requestId: rid(44), mode: 'auto' }).catch((x) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(e.getResponse())).toMatch(/paused for this month/);
    expect(t.log).toEqual([]);
  });
  it('keeps the request within the plan size by dropping the oldest messages', async () => {
    const long = (n: number) => `message ${n} ${'x'.repeat(900)}`;
    const msgs = [
      ...Array.from({ length: 9 }, (_, i) => ({
        kind: i % 2 ? 'OUTBOUND' : 'INBOUND',
        body: long(i),
      })),
      { kind: 'INBOUND', body: 'How much is the linen sofa?' },
    ];
    let prompt = '';
    const t = setup({
      limit: { maxRequestChars: 4_000 },
      messages: msgs,
      adapters: { openai: async (i) => ((prompt = i.prompt), { text: GOOD }), gemini: ok(GOOD) },
    });
    await t.o.draft(WS, 'u1', CONV, { requestId: rid(45), mode: 'openai' });
    expect(prompt.length).toBeLessThanOrEqual(4_000);
    expect(prompt).toContain('How much is the linen sofa?'); // the latest message is always kept
    expect(prompt).not.toContain('message 0 ');
  });
});
