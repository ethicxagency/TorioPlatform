import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  AI_MODE_LABEL,
  AI_MODES,
  type AiMode,
  type AiSettings,
  type AiErrorCategory,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { BrainService } from '../brain/brain.service';
import { AiConfigService, type UsableProvider } from './ai-config.service';
import { AiProviderRegistry } from './ai-registry';
import { CircuitBreaker } from './circuit-breaker';
import { buildPrompt, type AiRefinementInput, type ChatLine } from './context';
import { compare, evaluate, type Evaluation } from './evaluator';
import { AiProviderError, classifyError } from './providers/types';
import { synthesisPrompt, SYNTHESIS_SYSTEM, type Candidate } from './synthesis';
import { validateDraft } from './validator';

type Phase = 'understanding' | 'consulting' | 'evaluating' | 'preparing' | 'done';
const RUNNING_WINDOW_MS = 2 * 60_000;
const MAX_CONCURRENT_PER_WORKSPACE = 3;
const DEFAULT_MAX_TOKENS = 1024;

interface CallOutcome {
  ok: boolean;
  provider: UsableProvider;
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  retries: number;
  costMicros: number | null;
  category: AiErrorCategory | null;
}

export interface AiDraftResult {
  requestId: string;
  draft: string;
  mode: AiMode;
  strategy: string;
  providers: string[];
  durationMs: number;
  needsReview: boolean;
  warnings: string[];
  qualityScore: number | null;
}

const FRIENDLY: Record<string, string> = {
  auth: 'The AI service is not set up correctly. Your admin has been notified.',
  rate_limit: 'The AI service is busy right now. Try again in a moment.',
  timeout: 'The AI service took too long to answer. Try again.',
  unavailable: 'The AI service is unavailable right now. Try again shortly.',
  empty: 'The AI service returned no answer. Try again.',
  blocked: 'The draft was blocked by safety checks. Try again or write the reply yourself.',
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Turns a conversation into one reviewed draft. It builds a single normalised context from Torio Brain, asks one or more providers
 * (in parallel when synthesising), scores and compares their answers, synthesises one reply that the business knowledge supports,
 * validates it, and records usage. The result is always a draft for the agent; nothing is sent from here.
 */
@Injectable()
export class AiOrchestrator {
  private readonly breaker = new CircuitBreaker();
  /** Replaceable in tests. */
  wait: (ms: number) => Promise<void> = sleep;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
    private readonly registry: AiProviderRegistry,
    private readonly brain: BrainService,
  ) {}

  // ---------- availability ----------
  async options(): Promise<{
    available: boolean;
    reason: string | null;
    modes: { mode: AiMode; label: string; available: boolean; reason: string | null }[];
    recommended: AiMode | null;
  }> {
    const s = await this.config.settings();
    const usable = await this.config.usable();
    const off = (reason: string) => ({
      available: false,
      reason,
      modes: AI_MODES.map((mode) => ({
        mode,
        label: AI_MODE_LABEL[mode],
        available: false,
        reason,
      })),
      recommended: null as AiMode | null,
    });
    if (!s.enabled) return off('AI Assist is turned off.');
    if (usable.length === 0) return off('AI Assist is not set up yet.');
    const has = (k: string) => usable.some((p) => p.key === k);
    const modes = AI_MODES.map((mode) => {
      let reason: string | null = null;
      if (mode === 'auto' && !s.modes.auto) reason = 'Not enabled by your platform.';
      else if ((mode === 'openai' || mode === 'gemini') && !s.modes.single)
        reason = 'Not enabled by your platform.';
      else if (mode === 'openai' && !has('openai')) reason = 'OpenAI is not available.';
      else if (mode === 'gemini' && !has('gemini')) reason = 'Gemini is not available.';
      else if (mode === 'synthesis' && !s.modes.synthesis) reason = 'Not enabled by your platform.';
      else if (mode === 'synthesis' && usable.length < 2) reason = 'Needs two AI providers.';
      return { mode, label: AI_MODE_LABEL[mode], available: reason === null, reason };
    });
    const first = modes.find((m) => m.available);
    return {
      available: !!first,
      reason: first ? null : 'No AI mode is available.',
      modes,
      recommended: first?.mode ?? null,
    };
  }

  async phase(workspaceId: string, requestId: string) {
    const r = await this.prisma.client.aiRequest.findUnique({
      where: { workspaceId_requestId: { workspaceId, requestId } },
      select: { phase: true, status: true },
    });
    if (!r) throw new NotFoundException('Request not found');
    return { phase: r.phase as Phase, status: r.status as 'running' | 'succeeded' | 'failed' };
  }

  // ---------- the draft ----------
  async draft(
    workspaceId: string,
    userId: string,
    conversationId: string,
    input: { requestId: string; mode: AiMode; refine?: AiRefinementInput; previousDraft?: string },
  ): Promise<AiDraftResult> {
    const started = Date.now();
    const db = this.prisma.client;
    const [settings, usable, opts] = await Promise.all([
      this.config.settings(),
      this.config.usable(),
      this.options(),
    ]);
    const choice = opts.modes.find((m) => m.mode === input.mode);
    if (!opts.available || !choice?.available)
      throw new ServiceUnavailableException(
        choice?.reason ?? opts.reason ?? 'AI Assist is not available.',
      );

    let req;
    try {
      req = await db.aiRequest.create({
        data: { workspaceId, userId, conversationId, requestId: input.requestId, mode: input.mode },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'This request was already handled. Use Regenerate to ask again.',
        );
      throw e;
    }
    const calls: CallOutcome[] = [];
    try {
      const running = await db.aiRequest.count({
        where: {
          workspaceId,
          status: 'running',
          createdAt: { gt: new Date(Date.now() - RUNNING_WINDOW_MS) },
        },
      });
      if (running > MAX_CONCURRENT_PER_WORKSPACE)
        throw new HttpException(
          'Too many AI requests at once. Try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
        );

      // Step 1: understand the request (tenant-scoped reads only).
      const convo = await db.conversation.findFirst({
        where: { id: conversationId, workspaceId },
        select: { channel: { select: { provider: true } }, customer: { select: { name: true } } },
      });
      if (!convo) throw new NotFoundException('Conversation not found');
      const rows = await db.message.findMany({
        where: { workspaceId, conversationId, kind: { in: ['INBOUND', 'OUTBOUND'] } },
        orderBy: { createdAt: 'desc' },
        take: settings.contextMessages,
        select: { kind: true, body: true },
      });
      const lines: ChatLine[] = rows.reverse().map((m) => ({
        from: m.kind === 'INBOUND' ? ('customer' as const) : ('agent' as const),
        text: m.body,
      }));
      if (!lines.some((l) => l.from === 'customer'))
        throw new BadRequestException('There is no customer message to answer yet.');
      const brain = (await this.brain.get(workspaceId)).config;
      const built = buildPrompt({
        brain,
        lines,
        customerFirstName: convo.customer.name.split(/\s+/)[0] ?? null,
        channel: convo.channel.provider,
        refine: input.refine,
        previousDraft: input.previousDraft,
      });

      await this.setPhase(req.id, 'consulting');
      const ordered = [...usable].sort(
        (a, b) =>
          (a.models[0]?.priority ?? 1e9) - (b.models[0]?.priority ?? 1e9) ||
          a.key.localeCompare(b.key),
      );
      const ctx = { reqId: req.id, settings, calls };
      const result = await this.run({
        ctx,
        mode: input.mode,
        refining: !!input.refine,
        ordered,
        built,
        brain,
        channel: convo.channel.provider,
      });

      const durationMs = Date.now() - started;
      await this.finish(req.id, 'succeeded', {
        durationMs,
        calls,
        strategy: result.strategy,
        needsReview: result.needsReview,
        qualityScore: result.qualityScore,
      });
      return {
        requestId: input.requestId,
        draft: result.text,
        mode: input.mode,
        strategy: result.strategy,
        providers: result.providers,
        durationMs,
        needsReview: result.needsReview,
        warnings: result.warnings,
        qualityScore: result.qualityScore,
      };
    } catch (e) {
      const category: AiErrorCategory =
        e instanceof AiProviderError
          ? e.category
          : e instanceof HttpException
            ? 'rate_limit'
            : 'unknown';
      await this.finish(req.id, 'failed', {
        durationMs: Date.now() - started,
        calls: [],
        errorCategory: category,
      }).catch(() => undefined);
      if (e instanceof HttpException) throw e;
      if (e instanceof AiProviderError)
        throw new ServiceUnavailableException(
          FRIENDLY[e.category] ?? 'AI Assist could not prepare a draft. Try again.',
        );
      throw new ServiceUnavailableException('AI Assist could not prepare a draft. Try again.');
    }
  }

  // ---------- strategies ----------
  private async run(a: {
    ctx: { reqId: string; settings: AiSettings; calls: CallOutcome[] };
    mode: AiMode;
    refining: boolean;
    ordered: UsableProvider[];
    built: ReturnType<typeof buildPrompt>;
    brain: Parameters<typeof evaluate>[0]['brain'];
    channel: string;
  }) {
    const { ctx, built, brain, channel, ordered } = a;
    const s = ctx.settings;
    const judge = (text: string) => {
      const v = validateDraft({
        text,
        channel,
        brain,
        knowledge: built.knowledge,
        lastCustomerMessage: built.lastCustomerMessage,
        weights: s.weights,
      });
      const ev: Evaluation | null = v.blocked
        ? null
        : evaluate({
            reply: v.text,
            lastCustomerMessage: built.lastCustomerMessage,
            knowledge: built.knowledge,
            brain,
            weights: s.weights,
          });
      return { v, ev };
    };
    const done = (
      text: string,
      strategy: string,
      providers: string[],
      warnings: string[],
      ev: Evaluation,
      forceReview = false,
    ) => ({
      text,
      strategy,
      providers,
      warnings,
      qualityScore: ev.overall,
      needsReview: forceReview || warnings.length > 0 || ev.overall < s.minQualityScore,
    });

    // Which provider leads for single-model work.
    const lead = (): UsableProvider[] => {
      if (a.mode === 'openai' || a.mode === 'gemini')
        return [
          ordered.find((p) => p.key === a.mode)!,
          ...(s.fallback ? ordered.filter((p) => p.key !== a.mode) : []),
        ];
      const def = s.defaultProvider ? ordered.find((p) => p.key === s.defaultProvider) : undefined;
      const first = def ?? ordered[0]!;
      return [first, ...(s.fallback ? ordered.filter((p) => p.key !== first.key) : [])];
    };

    const single = async () => {
      const order = lead();
      let first = true;
      for (const p of order) {
        const o = await this.call(ctx, 'single', p, built.system, built.prompt);
        if (!o.ok) {
          first = false;
          continue;
        }
        await this.setPhase(ctx.reqId, 'evaluating');
        const { v, ev } = judge(o.text);
        if (v.blocked || !ev) {
          first = false;
          continue;
        }
        await this.setPhase(ctx.reqId, 'preparing');
        // Auto mode: a weak answer gets a second opinion from another provider when one is available.
        if (a.mode === 'auto' && ev.overall < s.minQualityScore && s.fallback) {
          const other = order.find((x) => x.key !== p.key);
          if (other) {
            const o2 = await this.call(ctx, 'candidate', other, built.system, built.prompt);
            if (o2.ok) {
              const j2 = judge(o2.text);
              if (j2.ev && !j2.v.blocked && j2.ev.overall > ev.overall)
                return done(j2.v.text, 'auto_second_opinion', [other.name], j2.v.warnings, j2.ev);
            }
          }
        }
        return done(v.text, first ? 'single' : 'fallback', [p.name], v.warnings, ev);
      }
      throw this.failure(ctx.calls);
    };

    if (a.refining || a.mode !== 'synthesis') return single();

    // Multi-AI synthesis: independent candidates in parallel, compared, then merged into one answer.
    const pool = ordered.slice(0, s.maxParallel);
    const outs = await Promise.all(
      pool.map((p) => this.call(ctx, 'candidate', p, built.system, built.prompt)),
    );
    await this.setPhase(ctx.reqId, 'evaluating');
    const good = outs
      .filter((o) => o.ok)
      .map((o) => ({ o, ...judge(o.text) }))
      .filter((c) => !c.v.blocked && c.ev);
    if (good.length === 0) throw this.failure(ctx.calls);
    good.sort((x, y) => y.ev!.overall - x.ev!.overall);
    const best = good[0]!;
    if (good.length === 1)
      return done(best.v.text, 'fallback', [best.o.provider.name], best.v.warnings, best.ev!, true);

    const cmp = compare(good[0]!.v.text, good[1]!.v.text, built.knowledge);
    await this.setPhase(ctx.reqId, 'preparing');
    const candidates: Candidate[] = good.map((c) => ({
      provider: c.o.provider.name,
      text: c.v.text,
      overall: c.ev!.overall,
    }));
    const prompt = synthesisPrompt({
      context: built.prompt,
      candidates,
      conflicts: cmp.conflicts,
      unsupported: cmp.unsupported,
    });
    const synthPref = s.synthesisProvider
      ? ordered.find((p) => p.key === s.synthesisProvider)
      : undefined;
    const synthOrder = [
      synthPref ?? ordered[0]!,
      ...(s.fallback ? ordered.filter((p) => p !== (synthPref ?? ordered[0])) : []),
    ];
    for (const p of synthOrder) {
      const o = await this.call(ctx, 'synthesis', p, SYNTHESIS_SYSTEM, prompt);
      if (!o.ok) continue;
      const { v, ev } = judge(o.text);
      if (v.blocked || !ev) continue;
      const warnings = [...v.warnings];
      if (cmp.conflicts.length)
        warnings.push('The models disagreed on some figures; they were left out.');
      return done(
        v.text,
        'synthesis',
        [...new Set([...candidates.map((c) => c.provider), p.name])],
        warnings,
        ev,
      );
    }
    // The synthesis step failed everywhere: use the best candidate only if it is safe and confident enough.
    if (best.ev!.overall >= s.minQualityScore && best.ev!.ungrounded.length === 0)
      return done(
        best.v.text,
        'best_candidate',
        [best.o.provider.name],
        best.v.warnings,
        best.ev!,
        true,
      );
    throw new AiProviderError('unavailable', true);
  }

  private failure(calls: CallOutcome[]): AiProviderError {
    const last = [...calls].reverse().find((c) => !c.ok);
    return new AiProviderError(last?.category ?? 'blocked', false);
  }

  // ---------- one provider call ----------
  private async call(
    ctx: { reqId: string; settings: AiSettings; calls: CallOutcome[] },
    role: 'single' | 'candidate' | 'synthesis',
    provider: UsableProvider,
    system: string,
    prompt: string,
  ): Promise<CallOutcome> {
    const s = ctx.settings;
    const model = provider.models[0]!;
    const adapter = this.registry.get(provider.key)!;
    let out: CallOutcome = {
      ok: false,
      provider,
      text: '',
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      latencyMs: 0,
      retries: 0,
      costMicros: null,
      category: null,
    };
    if (!this.breaker.allow(provider.key)) {
      out.category = 'unavailable'; // the provider is being skipped while it recovers; nothing is sent or billed
    } else {
      const key = await this.config.keyOf(provider.key);
      for (let attempt = 0; attempt <= s.maxRetries; attempt++) {
        const t0 = Date.now();
        try {
          const r = await this.withTimeout(
            adapter.generate({
              apiKey: key,
              model: model.modelId,
              system,
              prompt,
              maxOutputTokens: model.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
              ...(model.supportsTemperature &&
                model.temperature !== null && { temperature: model.temperature }),
              timeoutMs: s.requestTimeoutMs,
            }),
            s.requestTimeoutMs + 1000,
          );
          this.breaker.success(provider.key);
          out = {
            ...out,
            ok: true,
            text: r.text,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            cachedTokens: r.cachedTokens,
            latencyMs: Date.now() - t0,
            retries: attempt,
            category: null,
            costMicros:
              model.inputPriceMicros !== null && model.outputPriceMicros !== null
                ? Math.round(
                    (r.inputTokens * model.inputPriceMicros +
                      r.outputTokens * model.outputPriceMicros) /
                      1_000_000,
                  )
                : null,
          };
          void this.config.recordHealth(provider.key, true, null).catch(() => undefined);
          break;
        } catch (e) {
          const err = classifyError(e);
          out = { ...out, latencyMs: Date.now() - t0, retries: attempt, category: err.category };
          if (!err.retryable || attempt === s.maxRetries) {
            this.breaker.failure(provider.key);
            void this.config.recordHealth(provider.key, false, err.category).catch(() => undefined);
            break;
          }
          // Bounded exponential backoff with jitter; a failed attempt is not billed twice because providers charge for completed calls.
          await this.wait(Math.min(400 * 2 ** attempt, 2000) + Math.floor(Math.random() * 150));
        }
      }
    }
    ctx.calls.push(out);
    await this.prisma.client.aiCall
      .create({
        data: {
          requestId: ctx.reqId,
          modelRefId: model.id,
          role,
          provider: provider.key,
          model: model.modelId,
          status: out.ok ? 'ok' : 'failed',
          errorCategory: out.category,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          cachedTokens: out.cachedTokens,
          latencyMs: out.latencyMs,
          retries: out.retries,
          costMicros: out.costMicros,
        },
      })
      .catch(() => undefined);
    return out;
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let t: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new AiProviderError('timeout', true)), ms);
      }),
    ]).finally(() => clearTimeout(t));
  }

  // ---------- bookkeeping ----------
  private async setPhase(id: string, phase: Phase) {
    await this.prisma.client.aiRequest
      .update({ where: { id }, data: { phase } })
      .catch(() => undefined);
  }

  private async finish(
    id: string,
    status: 'succeeded' | 'failed',
    d: {
      durationMs: number;
      calls: CallOutcome[];
      strategy?: string;
      needsReview?: boolean;
      qualityScore?: number | null;
      errorCategory?: AiErrorCategory;
    },
  ) {
    const costs = d.calls.map((c) => c.costMicros).filter((c): c is number => c !== null);
    await this.prisma.client.aiRequest.update({
      where: { id },
      data: {
        status,
        phase: 'done',
        strategy: d.strategy ?? null,
        inputTokens: d.calls.reduce((n, c) => n + c.inputTokens, 0),
        outputTokens: d.calls.reduce((n, c) => n + c.outputTokens, 0),
        costMicros: costs.length ? costs.reduce((n, c) => n + c, 0) : null,
        durationMs: d.durationMs,
        retryCount: d.calls.reduce((n, c) => n + c.retries, 0),
        errorCategory: d.errorCategory ?? null,
        needsReview: d.needsReview ?? false,
        qualityScore: d.qualityScore ?? null,
        finishedAt: new Date(),
      },
    });
  }
}
