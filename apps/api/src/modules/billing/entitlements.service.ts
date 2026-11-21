import { HttpException, Injectable } from '@nestjs/common';
import {
  ENTITLEMENT_LABEL,
  USAGE_LABEL,
  type PlanEntitlement,
  type UsageMetric,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { effectivePlan, PlansService, type CatalogPlan } from './plans.service';

/** The four limits the server refuses to exceed. The per-product conversation counts are shown, not enforced. */
export type EnforcedMetric = 'members' | 'channels' | 'contacts' | 'messages';
const ENFORCED_NOUN: Record<EnforcedMetric, string> = {
  members: 'team members',
  channels: 'connected channels',
  contacts: 'customer contacts',
  messages: 'messages this month',
};

type SubLike = {
  status: string;
  source: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  planKey: string;
  planSnapshot: unknown;
} | null;

/**
 * The one place that answers "what is this workspace entitled to, and how much has it used". Billing screens and the
 * enforcement points (team, channels, contacts, messages) all read from here, so a limit shown is the limit applied.
 * A workspace without a live subscription gets the free plan. Plans come from the database; a subscriber is held to the
 * snapshot taken when they subscribed, so editing a plan never silently changes someone who already pays for it.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PlansService,
  ) {}

  /** A subscription counts only while it is not expired, and a fixed gateway term stops at its end date. */
  isLive<T extends SubLike>(sub: T, now = new Date()): sub is NonNullable<T> {
    if (!sub || sub.status === 'EXPIRED') return false;
    if (sub.source === 'GATEWAY' && sub.currentPeriodEnd && sub.currentPeriodEnd <= now)
      return false;
    return true;
  }

  async planFor(ws: string): Promise<{ plan: CatalogPlan; sub: NonNullable<SubLike> | null }> {
    const row = await this.prisma.client.subscription.findUnique({ where: { workspaceId: ws } });
    const sub = this.isLive(row) ? row : null;
    if (!sub) return { plan: await this.catalog.free(), sub: null };
    const plan =
      effectivePlan(await this.catalog.get(sub.planKey), sub.planSnapshot, sub.planKey) ??
      (await this.catalog.free());
    return { plan, sub };
  }

  /** Start and end of the current usage window: the billing period, else the calendar month. */
  period(sub: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null } | null) {
    const now = new Date();
    const inPeriod = !!(
      sub?.currentPeriodStart &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd > now
    );
    return {
      start: inPeriod
        ? sub!.currentPeriodStart!
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: inPeriod
        ? sub!.currentPeriodEnd!
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  private count(ws: string, metric: UsageMetric, start: Date) {
    const db = this.prisma.client;
    const conv = (provider: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER') =>
      db.conversation.count({
        where: { workspaceId: ws, createdAt: { gte: start }, channel: { provider } },
      });
    switch (metric) {
      case 'members':
        return db.workspaceMembership.count({ where: { workspaceId: ws, status: 'ACTIVE' } });
      case 'channels':
        return db.channel.count({ where: { workspaceId: ws, status: 'CONNECTED' } });
      case 'contacts':
        return db.customer.count({ where: { workspaceId: ws } });
      case 'messages':
        return db.message.count({
          where: { workspaceId: ws, kind: 'OUTBOUND', createdAt: { gte: start } },
        });
      case 'whatsapp':
        return conv('WHATSAPP');
      case 'instagram':
        return conv('INSTAGRAM');
      case 'messenger':
        return conv('MESSENGER');
    }
  }

  async usageNumbers(
    ws: string,
    sub: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null } | null,
  ) {
    const { start, end } = this.period(sub);
    const metrics: UsageMetric[] = [
      'members',
      'channels',
      'contacts',
      'messages',
      'whatsapp',
      'instagram',
      'messenger',
    ];
    const counts = await Promise.all(metrics.map((m) => this.count(ws, m, start)));
    return {
      start,
      end,
      values: Object.fromEntries(metrics.map((m, i) => [m, counts[i]])) as Record<
        UsageMetric,
        number
      >,
    };
  }

  /**
   * Refuses (HTTP 402) when adding `adding` more would pass the plan's limit. `extra` counts things already committed but
   * not yet in the table, such as pending invitations. A null limit means unlimited.
   */
  async assertCanAdd(
    ws: string,
    metric: EnforcedMetric,
    opts: { adding?: number; extra?: number } = {},
  ) {
    const { plan, sub } = await this.planFor(ws);
    const limit = plan.limits[metric];
    if (limit === null || limit === undefined) return;
    const used = (await this.count(ws, metric, this.period(sub).start)) + (opts.extra ?? 0);
    if (used + (opts.adding ?? 1) <= limit) return;
    throw new HttpException(
      {
        statusCode: 402,
        error: 'Plan limit reached',
        code: 'PLAN_LIMIT',
        metric,
        limit,
        used,
        plan: plan.key,
        message: `Your ${plan.name} plan includes ${limit.toLocaleString('en')} ${ENFORCED_NOUN[metric]} and you have ${used.toLocaleString('en')}. Upgrade your plan to add more.`,
      },
      402,
    );
  }

  async has(ws: string, e: PlanEntitlement) {
    return (await this.planFor(ws)).plan.entitlements.includes(e);
  }

  async assertEntitled(ws: string, e: PlanEntitlement) {
    const { plan } = await this.planFor(ws);
    if (plan.entitlements.includes(e)) return;
    throw new HttpException(
      {
        statusCode: 402,
        error: 'Not included in your plan',
        code: 'PLAN_FEATURE',
        entitlement: e,
        plan: plan.key,
        message: `${ENTITLEMENT_LABEL[e]} isn’t included in your ${plan.name} plan. Upgrade your plan to use it.`,
      },
      402,
    );
  }
}

export { USAGE_LABEL };
