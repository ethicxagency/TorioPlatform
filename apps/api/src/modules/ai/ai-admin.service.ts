import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { AI_PROVIDER_KEYS, type AiSettings, type UpdateAiSettings } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AdminAudit } from '../admin/admin-audit.service';
import { AiConfigService } from './ai-config.service';
import { AiLimitsService } from './ai-limits.service';
import { AiProviderRegistry } from './ai-registry';
import { classifyError } from './providers/types';

export interface AdminRef {
  admin: { id: string; email: string };
  ip?: string;
}
const PAGE = 25;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the platform owner does with AI configuration. Each credential change is audited (without the key). */
@Injectable()
export class AiAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
    private readonly registry: AiProviderRegistry,
    private readonly audit: AdminAudit,
    private readonly limits: AiLimitsService,
  ) {}

  providers() {
    return this.config
      .views()
      .then((data) => ({ encryptionReady: this.config.encryptionReady, data }));
  }

  private async provider(key: string) {
    if (!(AI_PROVIDER_KEYS as readonly string[]).includes(key))
      throw new NotFoundException('Unknown provider');
    await this.config.ensureProviders();
    const p = await this.prisma.client.aiProvider.findUnique({ where: { key } });
    if (!p) throw new NotFoundException('Unknown provider');
    return p;
  }

  async setKey(ref: AdminRef, key: string, apiKey: string) {
    const p = await this.provider(key);
    const sealed = this.config.encryptKey(apiKey.trim());
    await this.prisma.client.aiProvider.update({
      where: { id: p.id },
      data: {
        keyCiphertext: sealed,
        keyLast4: apiKey.trim().slice(-4),
        keyUpdatedAt: new Date(),
        health: 'UNKNOWN',
        lastErrorCategory: null,
        lastCheckedAt: null,
      },
    });
    await this.audit.log({
      admin: ref.admin,
      ip: ref.ip,
      action: p.keyCiphertext ? 'ai.key.replaced' : 'ai.key.created',
      targetType: 'ai_provider',
      targetId: p.id,
      targetLabel: p.name,
    });
    return this.providers();
  }

  async deleteKey(ref: AdminRef, key: string) {
    const p = await this.provider(key);
    await this.prisma.client.aiProvider.update({
      where: { id: p.id },
      data: {
        keyCiphertext: null,
        keyLast4: null,
        keyUpdatedAt: new Date(),
        enabled: false,
        health: 'UNKNOWN',
        lastErrorCategory: null,
      },
    });
    await this.audit.log({
      admin: ref.admin,
      ip: ref.ip,
      action: 'ai.key.deleted',
      targetType: 'ai_provider',
      targetId: p.id,
      targetLabel: p.name,
    });
    return this.providers();
  }

  /** Server-side connection test: lists the models the key can use. Returns a safe result and refreshes the model list. */
  async test(ref: AdminRef, key: string) {
    const p = await this.provider(key);
    const adapter = this.registry.get(key);
    if (!adapter) throw new NotFoundException('Unknown provider');
    if (!p.keyCiphertext) throw new BadRequestException('Save an API key first.');
    const t0 = Date.now();
    const timeout = (await this.config.settings()).requestTimeoutMs;
    try {
      const models = await adapter.listModels(await this.config.keyOf(key), timeout);
      for (const m of models)
        await this.prisma.client.aiModel.upsert({
          where: { providerId_modelId: { providerId: p.id, modelId: m.modelId } },
          create: {
            providerId: p.id,
            modelId: m.modelId,
            label: m.label,
            supportsTemperature: m.supportsTemperature,
          },
          update: { label: m.label, supportsTemperature: m.supportsTemperature },
        });
      await this.config.recordHealth(key, true, null);
      await this.audit.log({
        admin: ref.admin,
        ip: ref.ip,
        action: 'ai.provider.test',
        targetType: 'ai_provider',
        targetId: p.id,
        targetLabel: p.name,
        metadata: { ok: true, models: models.length },
      });
      return {
        ok: true,
        health: 'HEALTHY' as const,
        category: null,
        modelCount: models.length,
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      const err = classifyError(e);
      await this.config.recordHealth(key, false, err.category);
      await this.audit.log({
        admin: ref.admin,
        ip: ref.ip,
        action: 'ai.provider.test',
        targetType: 'ai_provider',
        targetId: p.id,
        targetLabel: p.name,
        metadata: { ok: false, category: err.category },
      });
      return {
        ok: false,
        health: (err.category === 'auth' ? 'DOWN' : 'DEGRADED') as 'DOWN' | 'DEGRADED',
        category: err.category,
        modelCount: 0,
        latencyMs: Date.now() - t0,
      };
    }
  }

  async updateProvider(
    ref: AdminRef,
    key: string,
    patch: { enabled?: boolean; defaultModel?: string | null },
  ) {
    const p = await this.provider(key);
    const data: Prisma.AiProviderUpdateInput = {};
    if (patch.defaultModel !== undefined) {
      if (patch.defaultModel) {
        const m = await this.prisma.client.aiModel.findUnique({
          where: { providerId_modelId: { providerId: p.id, modelId: patch.defaultModel } },
        });
        if (!m)
          throw new BadRequestException(
            'That model is not in this provider’s list. Run a connection test first.',
          );
        // The default model is also enabled, so choosing it makes it usable.
        await this.prisma.client.aiModel.update({
          where: { id: m.id },
          data: { enabled: true, priority: 1 },
        });
      }
      data.defaultModel = patch.defaultModel;
    }
    if (patch.enabled !== undefined) {
      if (patch.enabled) {
        if (!p.keyCiphertext)
          throw new BadRequestException('Save an API key before enabling this provider.');
        const enabledModels = await this.prisma.client.aiModel.count({
          where: { providerId: p.id, enabled: true },
        });
        if (enabledModels === 0 && !patch.defaultModel && !p.defaultModel)
          throw new BadRequestException(
            'Enable at least one model (or choose a default model) first.',
          );
      }
      data.enabled = patch.enabled;
    }
    await this.prisma.client.aiProvider.update({ where: { id: p.id }, data });
    await this.audit.log({
      admin: ref.admin,
      ip: ref.ip,
      action: 'ai.provider.updated',
      targetType: 'ai_provider',
      targetId: p.id,
      targetLabel: p.name,
      metadata: patch as Record<string, unknown>,
    });
    return this.providers();
  }

  async updateModel(
    ref: AdminRef,
    id: string,
    patch: Partial<{
      enabled: boolean;
      priority: number;
      maxOutputTokens: number | null;
      temperature: number | null;
      inputPriceMicros: number | null;
      outputPriceMicros: number | null;
    }>,
  ) {
    const m = await this.prisma.client.aiModel.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!m) throw new NotFoundException('Model not found');
    if (patch.temperature != null && !m.supportsTemperature)
      throw new BadRequestException('This model does not accept a temperature setting.');
    await this.prisma.client.aiModel.update({ where: { id }, data: patch });
    await this.audit.log({
      admin: ref.admin,
      ip: ref.ip,
      action: 'ai.model.updated',
      targetType: 'ai_model',
      targetId: id,
      targetLabel: `${m.provider.name} ${m.modelId}`,
      metadata: patch as Record<string, unknown>,
    });
    return this.providers();
  }

  settings() {
    return this.config.settings();
  }

  async updateSettings(ref: AdminRef, patch: UpdateAiSettings) {
    const cur = await this.config.settings();
    const next = {
      ...cur,
      ...patch,
      modes: { ...cur.modes, ...patch.modes },
      weights: { ...cur.weights, ...patch.weights },
    } as AiSettings;
    const saved = await this.config.saveSettings(next);
    await this.audit.log({
      admin: ref.admin,
      ip: ref.ip,
      action: 'ai.settings.updated',
      targetType: 'ai_settings',
      metadata: { changed: Object.keys(patch) },
    });
    return saved;
  }

  // ---------- budgets ----------
  async budgetStatus() {
    return this.limits.alerts(await this.config.settings());
  }

  // ---------- usage ----------
  async overview(days: number) {
    const db = this.prisma.client;
    const since = new Date(Date.now() - days * 86_400_000);
    const [providers, models, req, ok, failed, sums, multi, multiOk, byProvider, byModel] =
      await Promise.all([
        db.aiProvider.count({ where: { keyCiphertext: { not: null } } }),
        db.aiModel.count({ where: { enabled: true, provider: { enabled: true } } }),
        db.aiRequest.count({ where: { createdAt: { gte: since } } }),
        db.aiRequest.count({ where: { createdAt: { gte: since }, status: 'succeeded' } }),
        db.aiRequest.count({ where: { createdAt: { gte: since }, status: 'failed' } }),
        db.aiRequest.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { inputTokens: true, outputTokens: true, costMicros: true },
          _avg: { durationMs: true },
        }),
        db.aiRequest.count({ where: { createdAt: { gte: since }, mode: 'synthesis' } }),
        db.aiRequest.count({
          where: { createdAt: { gte: since }, mode: 'synthesis', status: 'succeeded' },
        }),
        db.aiCall.groupBy({
          by: ['provider'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true, costMicros: true },
        }),
        db.aiCall.groupBy({
          by: ['provider', 'model'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true, costMicros: true },
          _avg: { latencyMs: true },
        }),
      ]);
    const activeProviders = await db.aiProvider.count({
      where: { enabled: true, keyCiphertext: { not: null } },
    });
    const okByModel = await db.aiCall.groupBy({
      by: ['provider', 'model'],
      where: { createdAt: { gte: since }, status: 'ok' },
      _count: { _all: true },
    });
    const daily = await db.$queryRaw<
      { d: Date; total: bigint; failed: bigint; cost: bigint | null }[]
    >`
      SELECT date_trunc('day', "createdAt") AS d,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'failed') AS failed,
             SUM("costMicros") AS cost
      FROM ai_requests WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;
    const costs = await db.aiRequest.count({
      where: { createdAt: { gte: since }, status: 'succeeded', costMicros: null },
    });
    return {
      days,
      configuredProviders: providers,
      activeProviders,
      availableModels: models,
      requests: req,
      succeeded: ok,
      failed,
      inputTokens: sums._sum.inputTokens ?? 0,
      outputTokens: sums._sum.outputTokens ?? 0,
      /** Estimated from prices the platform owner entered, not confirmed provider billing. */
      estimatedCostMicros: sums._sum.costMicros ?? null,
      /** True when some requests had no price set, so the total is a lower bound. */
      costIncomplete: costs > 0,
      avgDurationMs: sums._avg.durationMs === null ? null : Math.round(sums._avg.durationMs),
      multiModelRequests: multi,
      orchestrationSuccessRate: multi === 0 ? null : Math.round((multiOk / multi) * 100),
      daily: daily.map((r) => ({
        date: day(r.d),
        total: Number(r.total),
        failed: Number(r.failed),
        costMicros: r.cost === null ? null : Number(r.cost),
      })),
      providerUsage: byProvider.map((p) => ({
        provider: p.provider,
        calls: p._count._all,
        inputTokens: p._sum.inputTokens ?? 0,
        outputTokens: p._sum.outputTokens ?? 0,
        costMicros: p._sum.costMicros,
      })),
      modelPerformance: byModel.map((m) => ({
        provider: m.provider,
        model: m.model,
        calls: m._count._all,
        ok:
          okByModel.find((o) => o.provider === m.provider && o.model === m.model)?._count._all ?? 0,
        avgLatencyMs: m._avg.latencyMs === null ? null : Math.round(m._avg.latencyMs),
        inputTokens: m._sum.inputTokens ?? 0,
        outputTokens: m._sum.outputTokens ?? 0,
        costMicros: m._sum.costMicros,
      })),
    };
  }

  async logs(q: {
    provider?: string;
    model?: string;
    workspaceId?: string;
    status?: string;
    mode?: string;
    from?: string;
    to?: string;
    page: number;
  }) {
    const where: Prisma.AiRequestWhereInput = {
      ...(q.workspaceId && { workspaceId: q.workspaceId }),
      ...(q.status && { status: q.status }),
      ...(q.mode && { mode: q.mode }),
      ...((q.from || q.to) && {
        createdAt: {
          ...(q.from && { gte: new Date(q.from) }),
          ...(q.to && { lte: new Date(q.to) }),
        },
      }),
      ...((q.provider || q.model) && {
        calls: {
          some: { ...(q.provider && { provider: q.provider }), ...(q.model && { model: q.model }) },
        },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.aiRequest.count({ where }),
      this.prisma.client.aiRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE,
        take: PAGE,
        include: {
          workspace: { select: { id: true, name: true } },
          calls: { select: { provider: true, model: true, status: true, role: true } },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        workspace: r.workspace,
        mode: r.mode,
        status: r.status,
        strategy: r.strategy,
        providers: [...new Set(r.calls.map((c) => c.provider))],
        models: [...new Set(r.calls.map((c) => c.model))],
        durationMs: r.durationMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costMicros: r.costMicros,
        errorCategory: r.errorCategory,
        needsReview: r.needsReview,
        retryCount: r.retryCount,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        page: q.page,
        pageSize: PAGE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE)),
      },
    };
  }

  /** Removes request logs older than the retention period. Content was never stored, only metadata. */
  async purgeOld() {
    const days = (await this.config.settings()).logRetentionDays;
    const r = await this.prisma.client.aiRequest.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } },
    });
    return r.count;
  }
}
