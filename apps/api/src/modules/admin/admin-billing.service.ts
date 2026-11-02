import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  USAGE_METRICS,
  type AdminCreatePlanInput,
  type AdminUpdatePlanInput,
  type BillingInterval,
} from '@torio/contracts';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { BILLING_PROVIDER, type BillingProvider } from '../billing/provider/billing-provider';
import {
  PlansService,
  snapshotOf,
  toCatalogPlan,
  type CatalogPlan,
} from '../billing/plans.service';
import { AdminAudit } from './admin-audit.service';
import type { AdminContext } from './admin-auth';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const meta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

type SubRow = Prisma.SubscriptionGetPayload<{
  include: {
    workspace: {
      select: {
        id: true;
        name: true;
        memberships: { include: { user: { select: { name: true; email: true } } } };
      };
    };
  };
}>;
const subInclude = {
  workspace: {
    select: {
      id: true,
      name: true,
      memberships: {
        where: { role: 'OWNER' as const },
        take: 1,
        include: { user: { select: { name: true, email: true } } },
      },
    },
  },
} satisfies Prisma.SubscriptionInclude;

/** Subscription and plan administration. Provider-backed changes are only *requested* here; state follows the webhook. */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAudit,
    private readonly plans: PlansService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------- subscriptions ----------

  private dto(s: SubRow, names: Map<string, string>) {
    const owner = s.workspace.memberships[0]?.user ?? null;
    return {
      id: s.id,
      providerSubscriptionId: s.providerSubscriptionId,
      source: s.source,
      customer: owner,
      workspace: { id: s.workspace.id, name: s.workspace.name },
      planKey: s.planKey,
      planName: names.get(s.planKey) ?? s.planKey,
      interval: s.interval,
      amountMinor: s.source === 'MANUAL' || s.priceMinor === null ? -1 : s.priceMinor,
      currency: s.currency,
      status: s.status,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      startedAt: iso(s.startedAt),
      renewsAt: iso(s.currentPeriodEnd),
      grantReason: s.grantReason,
    };
  }

  async subscriptions(q: { status?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.SubscriptionWhereInput = {
      ...(q.status && { status: q.status as never }),
      ...(q.q && {
        OR: [
          { workspace: { name: { contains: q.q, mode: 'insensitive' } } },
          {
            workspace: {
              memberships: {
                some: { role: 'OWNER', user: { email: { contains: q.q, mode: 'insensitive' } } },
              },
            },
          },
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.subscription.count({ where }),
      this.prisma.client.subscription.findMany({
        where,
        include: subInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const names = new Map((await this.plans.all()).map((p) => [p.key, p.name]));
    return { data: rows.map((r) => this.dto(r, names)), meta: meta(q.page, q.pageSize, total) };
  }

  async subscription(id: string) {
    const s = await this.prisma.client.subscription.findUnique({
      where: { id },
      include: subInclude,
    });
    if (!s) throw new NotFoundException('Subscription not found');
    const names = new Map((await this.plans.all()).map((p) => [p.key, p.name]));
    const [invoices, events] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where: { workspaceId: s.workspaceId },
        orderBy: { issuedAt: 'desc' },
        take: 20,
      }),
      this.prisma.client.billingEvent.findMany({
        where: { workspaceId: s.workspaceId },
        orderBy: { processedAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      ...this.dto(s, names),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        totalMinor: i.totalMinor,
        currency: i.currency,
        issuedAt: i.issuedAt.toISOString(),
      })),
      payments: events.map((e) => ({
        type: e.type,
        outcome: e.outcome,
        at: e.processedAt.toISOString(),
      })),
    };
  }

  /**
   * Provider subscriptions: asks the provider and returns `pending`. Nothing local changes and nothing is claimed
   * until the signed webhook arrives. Manual grants have no provider, so they end locally and say so.
   */
  async cancel(
    admin: AdminContext,
    id: string,
    input: { reason: string; atPeriodEnd: boolean },
    ip?: string,
  ) {
    const s = await this.prisma.client.subscription.findUnique({
      where: { id },
      include: { workspace: { select: { name: true } } },
    });
    if (!s) throw new NotFoundException('Subscription not found');
    if (['CANCELED', 'EXPIRED'].includes(s.status))
      throw new ConflictException('This subscription has already ended.');
    const base = {
      admin,
      targetType: 'subscription',
      targetId: id,
      targetLabel: s.workspace.name,
      reason: input.reason,
      ip,
    };
    if (s.source === 'MANUAL') {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            currentPeriodEnd: new Date(),
            cancelAtPeriodEnd: false,
            lastEventAt: new Date(),
          },
        });
        await this.audit.log(
          { ...base, action: 'subscription.cancel_manual', metadata: { plan: s.planKey } },
          tx,
        );
      });
      return {
        accepted: true as const,
        pending: false,
        message: 'The manually assigned plan was ended.',
      };
    }
    await this.provider.cancelSubscription({
      subscriptionId: s.providerSubscriptionId,
      atPeriodEnd: input.atPeriodEnd,
      reason: input.reason,
    });
    await this.audit.log({
      ...base,
      action: 'subscription.cancel_requested',
      metadata: { atPeriodEnd: input.atPeriodEnd, plan: s.planKey },
    });
    return {
      accepted: true as const,
      pending: true,
      message:
        'Cancellation requested from the payment provider. It shows here once the provider confirms it.',
    };
  }

  async resume(admin: AdminContext, id: string, reason: string, ip?: string) {
    const s = await this.prisma.client.subscription.findUnique({
      where: { id },
      include: { workspace: { select: { name: true } } },
    });
    if (!s) throw new NotFoundException('Subscription not found');
    if (
      s.source !== 'PROVIDER' ||
      !s.cancelAtPeriodEnd ||
      !['ACTIVE', 'TRIALING'].includes(s.status)
    )
      throw new ConflictException(
        'Only a provider subscription with a scheduled cancellation can be reactivated. To restore access otherwise, assign a plan.',
      );
    await this.provider.resumeSubscription({ subscriptionId: s.providerSubscriptionId });
    await this.audit.log({
      admin,
      action: 'subscription.resume_requested',
      targetType: 'subscription',
      targetId: id,
      targetLabel: s.workspace.name,
      reason,
      ip,
    });
    return {
      accepted: true as const,
      pending: true,
      message:
        'Reactivation requested from the payment provider. It shows here once the provider confirms it.',
    };
  }

  /**
   * Assigns a plan to a workspace. A paid provider subscription is changed through the provider (pending). Otherwise a
   * complimentary MANUAL plan is recorded: no payments, no provider subscription, and excluded from MRR.
   */
  async assignPlan(
    admin: AdminContext,
    workspaceId: string,
    input: { planKey: string; interval: BillingInterval; reason: string; endsAt?: string },
    ip?: string,
  ) {
    const ws = await this.prisma.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    const plan = await this.plans.get(input.planKey);
    if (!plan || plan.status === 'ARCHIVED')
      throw new BadRequestException('Unknown or archived plan');
    const cur = await this.prisma.client.subscription.findUnique({ where: { workspaceId } });
    const base = {
      admin,
      targetType: 'workspace',
      targetId: workspaceId,
      targetLabel: ws.name,
      reason: input.reason,
      ip,
    };
    const live = cur && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(cur.status);
    if (live && cur.source === 'PROVIDER') {
      const priceId = this.plans.priceIdFor(plan, input.interval, this.config.BILLING_PRICE_IDS);
      if (!priceId)
        throw new BadRequestException(
          'This plan has no provider price configured, so a paid subscription can’t be moved to it.',
        );
      await this.provider.changeSubscription({
        subscriptionId: cur.providerSubscriptionId,
        priceId,
      });
      await this.audit.log({
        ...base,
        action: 'subscription.plan_change_requested',
        metadata: { from: cur.planKey, to: plan.key, interval: input.interval },
      });
      return {
        accepted: true as const,
        pending: true,
        message:
          'Plan change requested from the payment provider. It shows here once the provider confirms it.',
      };
    }
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt.getTime() <= Date.now())
      throw new BadRequestException('The end date must be in the future.');
    const data = {
      planKey: plan.key,
      interval: input.interval,
      status: 'ACTIVE' as const,
      source: 'MANUAL' as const,
      priceMinor: null,
      currency: null,
      planSnapshot: snapshotOf(plan) as Prisma.InputJsonValue,
      grantedById: null,
      grantReason: input.reason,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: endsAt,
      trialEnd: null,
      startedAt: new Date(),
      lastEventAt: new Date(),
    };
    await this.prisma.client.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { workspaceId },
        create: { workspaceId, providerSubscriptionId: `manual_${randomUUID()}`, ...data },
        update: { ...data, providerSubscriptionId: `manual_${randomUUID()}` },
      });
      await this.audit.log(
        {
          ...base,
          action: 'subscription.assign_manual',
          metadata: { from: cur?.planKey ?? null, to: plan.key, endsAt: iso(endsAt) },
        },
        tx,
      );
    });
    return {
      accepted: true as const,
      pending: false,
      message: `${plan.name} was assigned manually${endsAt ? ` until ${endsAt.toISOString().slice(0, 10)}` : ''}. No payment is involved.`,
    };
  }

  // ---------- plans ----------

  private async planDto(p: CatalogPlan, subscribers: number) {
    return {
      key: p.key,
      name: p.name,
      description: p.description,
      rank: p.rank,
      recommended: p.recommended,
      currency: p.currency,
      monthlyMinor: p.monthlyMinor,
      yearlyMinor: p.yearlyMinor,
      placeholderPricing: p.placeholderPricing,
      limits: Object.fromEntries(USAGE_METRICS.map((m) => [m, p.limits[m] ?? -1])) as Record<
        string,
        number
      >,
      aiCredits: p.aiCredits ?? -1,
      features: p.features,
      priceIdMonth: p.priceIdMonth,
      priceIdYear: p.priceIdYear,
      status: p.status,
      subscribers,
    };
  }

  async listPlans() {
    const [all, counts] = await Promise.all([
      this.plans.all(),
      this.prisma.client.subscription.groupBy({
        by: ['planKey'],
        where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
        _count: { _all: true },
      }),
    ]);
    return {
      data: await Promise.all(
        all.map((p) => this.planDto(p, counts.find((c) => c.planKey === p.key)?._count._all ?? 0)),
      ),
    };
  }

  private async one(key: string) {
    const p = await this.plans.get(key);
    if (!p) throw new NotFoundException('Plan not found');
    const n = await this.prisma.client.subscription.count({
      where: { planKey: key, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });
    return this.planDto(p, n);
  }

  async createPlan(admin: AdminContext, input: AdminCreatePlanInput, ip?: string) {
    if (await this.plans.get(input.key))
      throw new ConflictException('A plan with this key already exists.');
    const { limits, ...rest } = input;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.planDefinition.create({
        data: { ...rest, limits: limits as Prisma.InputJsonValue, status: 'DISABLED' },
      });
      await this.audit.log(
        {
          admin,
          action: 'plan.create',
          targetType: 'plan',
          targetId: input.key,
          targetLabel: input.name,
          metadata: { status: 'DISABLED' },
          ip,
        },
        tx,
      );
    });
    return this.one(input.key);
  }

  /** Edits the catalog definition. Existing subscriptions keep their own snapshot, so nothing changes for them. */
  async updatePlan(admin: AdminContext, key: string, input: AdminUpdatePlanInput, ip?: string) {
    const cur = await this.plans.get(key);
    if (!cur) throw new NotFoundException('Plan not found');
    if (cur.status === 'ARCHIVED')
      throw new ConflictException('Archived plans can’t be edited. Create a new plan instead.');
    const { limits, ...rest } = input;
    const changed = Object.keys(input).filter(
      (k) =>
        JSON.stringify((cur as unknown as Record<string, unknown>)[k]) !==
        JSON.stringify((input as Record<string, unknown>)[k]),
    );
    await this.prisma.client.$transaction(async (tx) => {
      await tx.planDefinition.update({
        where: { key },
        data: { ...rest, ...(limits && { limits: limits as Prisma.InputJsonValue }) },
      });
      if (changed.length)
        await this.audit.log(
          {
            admin,
            action: 'plan.update',
            targetType: 'plan',
            targetId: key,
            targetLabel: cur.name,
            metadata: { changed, appliesTo: 'new subscriptions and plan changes only' },
            ip,
          },
          tx,
        );
    });
    return this.one(key);
  }

  async setPlanStatus(
    admin: AdminContext,
    key: string,
    status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED',
    reason: string,
    ip?: string,
  ) {
    const cur = await this.plans.get(key);
    if (!cur) throw new NotFoundException('Plan not found');
    if (cur.status === status)
      throw new ConflictException(`The plan is already ${status.toLowerCase()}.`);
    if (cur.status === 'ARCHIVED')
      throw new ConflictException('Archived plans can’t be restored. Create a new plan instead.');
    if (status === 'ARCHIVED') {
      const live = await this.prisma.client.subscription.count({
        where: { planKey: key, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      });
      if (live > 0)
        throw new ConflictException(
          `${live} active subscription${live === 1 ? ' is' : 's are'} on this plan. Move them first, or disable the plan so nobody new can pick it.`,
        );
    }
    if (key === 'free' && status !== 'ACTIVE')
      throw new ConflictException(
        'The Free plan is the default for workspaces without a subscription and can’t be turned off.',
      );
    await this.prisma.client.$transaction(async (tx) => {
      await tx.planDefinition.update({ where: { key }, data: { status } });
      await this.audit.log(
        {
          admin,
          action: `plan.${status === 'ACTIVE' ? 'enable' : status === 'DISABLED' ? 'disable' : 'archive'}`,
          targetType: 'plan',
          targetId: key,
          targetLabel: cur.name,
          reason,
          ip,
        },
        tx,
      );
    });
    return this.one(key);
  }
}

export { toCatalogPlan };
