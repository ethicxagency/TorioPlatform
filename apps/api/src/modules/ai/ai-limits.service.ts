import { Injectable } from '@nestjs/common';
import type { AiMode, AiPlanLimit, AiSettings } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';

/** The first moment of the current calendar month, in UTC. Allowances and budgets reset then. */
export const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export interface Allowance {
  planKey: string;
  limit: AiPlanLimit;
  usage: {
    requests: number;
    requestLimit: number | null;
    tokens: number;
    tokenLimit: number | null;
  };
  /** Why AI cannot be used now, or null. */
  blocked: string | null;
}

export interface BudgetAlert {
  scope: 'platform' | 'provider';
  provider?: string;
  spendMicros: number;
  limitMicros: number;
  percent: number;
  level: 'warning' | 'limit';
}

/**
 * Plan allowances and spending controls. Everything is counted from the recorded requests of the current UTC month, so the numbers
 * are the same ones the admin screens show. Spend only counts requests whose model had prices entered, so it is a lower bound when
 * some prices are missing.
 */
@Injectable()
export class AiLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The plan a workspace is on: its active or trialing subscription, otherwise "free". */
  async planKey(workspaceId: string): Promise<string> {
    const sub = await this.prisma.client.subscription.findUnique({
      where: { workspaceId },
      select: { planKey: true, status: true },
    });
    return sub && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status) ? sub.planKey : 'free';
  }

  limitFor(settings: AiSettings, planKey: string): AiPlanLimit {
    return settings.planLimits[planKey] ?? settings.defaultPlanLimit;
  }

  async usage(workspaceId: string) {
    const agg = await this.prisma.client.aiRequest.aggregate({
      where: { workspaceId, createdAt: { gte: monthStart() }, status: { not: 'failed' } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return {
      requests: agg._count._all,
      tokens: (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0),
    };
  }

  private async spend(where: { workspaceId?: string; provider?: string }): Promise<number> {
    const since = monthStart();
    if (where.provider) {
      const a = await this.prisma.client.aiCall.aggregate({
        where: { provider: where.provider, createdAt: { gte: since } },
        _sum: { costMicros: true },
      });
      return a._sum.costMicros ?? 0;
    }
    const a = await this.prisma.client.aiRequest.aggregate({
      where: {
        ...(where.workspaceId && { workspaceId: where.workspaceId }),
        createdAt: { gte: since },
      },
      _sum: { costMicros: true },
    });
    return a._sum.costMicros ?? 0;
  }

  /** Whether this workspace may use AI right now, and how much of its allowance is used. */
  async allowance(workspaceId: string, settings: AiSettings): Promise<Allowance> {
    const planKey = await this.planKey(workspaceId);
    const limit = this.limitFor(settings, planKey);
    const u = await this.usage(workspaceId);
    const usage = {
      requests: u.requests,
      requestLimit: limit.monthlyRequests,
      tokens: u.tokens,
      tokenLimit: limit.monthlyTokens,
    };
    let blocked: string | null = null;
    if (!limit.included) blocked = 'AI Assist is not included in your plan.';
    else if (limit.monthlyRequests !== null && u.requests >= limit.monthlyRequests)
      blocked = `You have used all ${limit.monthlyRequests} AI drafts in your plan this month.`;
    else if (limit.monthlyTokens !== null && u.tokens >= limit.monthlyTokens)
      blocked = 'You have used your AI allowance for this month.';
    if (!blocked) blocked = await this.budgetBlock(workspaceId, settings);
    return { planKey, limit, usage, blocked };
  }

  /** A spending limit that has been reached and is set to block. Null when AI may run. */
  async budgetBlock(workspaceId: string, settings: AiSettings): Promise<string | null> {
    const b = settings.budgets;
    if (b.onLimit !== 'block') return null;
    if (b.monthlyMicros !== null && (await this.spend({})) >= b.monthlyMicros)
      return 'AI Assist is paused for this month.';
    if (b.workspaceMicros !== null && (await this.spend({ workspaceId })) >= b.workspaceMicros)
      return 'Your workspace has reached its AI limit for this month.';
    return null;
  }

  /**
   * Whether one provider may be called now: its monthly spend limit (when set to block) and its requests-per-minute limit.
   * A blocked provider is skipped, so the engine can use another one instead.
   */
  async providerBlock(
    provider: string,
    settings: AiSettings,
  ): Promise<'budget' | 'rate_limit' | null> {
    const cap = settings.budgets.providerMicros[provider];
    if (
      cap != null &&
      settings.budgets.onLimit === 'block' &&
      (await this.spend({ provider })) >= cap
    )
      return 'budget';
    const rpm = settings.providerRpm[provider];
    if (rpm != null) {
      const n = await this.prisma.client.aiCall.count({
        where: { provider, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (n >= rpm) return 'rate_limit';
    }
    return null;
  }

  /** Modes the plan allows. Synthesis needs the plan's multi-model permission. */
  allows(limit: AiPlanLimit, mode: AiMode) {
    return mode !== 'synthesis' || limit.multiModel;
  }

  /** Budget alerts for the admin overview: spend against each configured budget. */
  async alerts(settings: AiSettings) {
    const b = settings.budgets;
    const month = monthStart().toISOString().slice(0, 7);
    const out: BudgetAlert[] = [];
    const add = (
      scope: BudgetAlert['scope'],
      spend: number,
      limit: number | null | undefined,
      provider?: string,
    ) => {
      if (limit == null || limit <= 0) return;
      const percent = Math.round((spend / limit) * 100);
      if (percent >= b.alertPercent)
        out.push({
          scope,
          provider,
          spendMicros: spend,
          limitMicros: limit,
          percent,
          level: percent >= 100 ? 'limit' : 'warning',
        });
    };
    const platform = await this.spend({});
    add('platform', platform, b.monthlyMicros);
    for (const [p, cap] of Object.entries(b.providerMicros))
      add('provider', await this.spend({ provider: p }), cap, p);
    return { month, platformSpendMicros: platform, alerts: out };
  }
}
