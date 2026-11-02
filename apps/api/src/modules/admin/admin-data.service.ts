import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { computeMrr, type MrrInput } from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PlansService } from '../billing/plans.service';
import { PlatformSettingsService } from '../platform/platform-settings.service';
import { AdminAudit } from './admin-audit.service';
import type { AdminContext } from './admin-auth';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const meta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
const DAY = 86_400_000;

/**
 * Platform administration reads. It exposes accounts, workspaces and billing records, but deliberately never
 * conversations, messages, customer contact lists, password hashes, tokens or payment credentials.
 */
@Injectable()
export class AdminDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAudit,
    private readonly plans: PlansService,
    private readonly settings: PlatformSettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async planNames() {
    return new Map((await this.plans.all()).map((p) => [p.key, p.name]));
  }

  // ---------- dashboard ----------

  async dashboard() {
    const db = this.prisma.client;
    const since = new Date(Date.now() - 30 * DAY);
    const sixMonths = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1),
    );
    const [
      total,
      fresh,
      disabled,
      wsActive,
      wsSuspended,
      subCounts,
      subs,
      revenueRows,
      recentCustomers,
      recentSubs,
      failed,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: since } } }),
      db.user.count({ where: { status: 'DISABLED' } }),
      db.workspace.count({ where: { status: 'ACTIVE' } }),
      db.workspace.count({ where: { status: 'SUSPENDED' } }),
      db.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      db.subscription.findMany({
        where: { status: 'ACTIVE', source: 'PROVIDER' },
        select: { status: true, source: true, interval: true, priceMinor: true, currency: true },
      }),
      db.$queryRaw<{ m: string; currency: string; total: bigint }[]>`
          SELECT to_char(date_trunc('month', "issuedAt"), 'YYYY-MM') AS m, currency, SUM("totalMinor")::bigint AS total
          FROM invoices WHERE status = 'PAID' AND "issuedAt" >= ${sixMonths}
          GROUP BY 1, 2 ORDER BY 1`,
      db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      db.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { workspace: { select: { name: true } } },
      }),
      db.invoice.findMany({
        where: { status: 'FAILED' },
        orderBy: { issuedAt: 'desc' },
        take: 5,
        include: { workspace: { select: { name: true } } },
      }),
    ]);
    const n = (s: string) => subCounts.find((x) => x.status === s)?._count._all ?? 0;
    const mrr = computeMrr(subs as MrrInput[]);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    const currencies = [...new Set(revenueRows.map((r) => r.currency))];
    return {
      customers: { total, newLast30Days: fresh, suspended: disabled },
      workspaces: { active: wsActive, suspended: wsSuspended },
      subscriptions: { active: n('ACTIVE'), trialing: n('TRIALING'), pastDue: n('PAST_DUE') },
      mrr: { byCurrency: mrr.byCurrency, unpricedSubscriptions: mrr.unpriced },
      revenue: currencies.map((currency) => ({
        currency,
        months: months.map((month) => ({
          month,
          amountMinor: Number(
            revenueRows.find((r) => r.m === month && r.currency === currency)?.total ?? 0,
          ),
        })),
      })),
      recentCustomers: recentCustomers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      recentSubscriptions: recentSubs.map((s) => ({
        id: s.id,
        workspace: s.workspace.name,
        planKey: s.planKey,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
      failedPayments: failed.map((i) => ({
        id: i.id,
        workspace: i.workspace.name,
        number: i.number,
        totalMinor: i.totalMinor,
        currency: i.currency,
        issuedAt: i.issuedAt.toISOString(),
      })),
    };
  }

  // ---------- customers (= customer accounts) ----------

  private async planInfo(workspaceIds: string[]) {
    const subs = await this.prisma.client.subscription.findMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    return new Map(subs.map((s) => [s.workspaceId, s]));
  }

  private async customerRows(users: { id: string }[]) {
    const owned = await this.prisma.client.workspaceMembership.findMany({
      where: { userId: { in: users.map((u) => u.id) }, role: 'OWNER' },
      select: { userId: true, workspaceId: true },
    });
    const counts = await this.prisma.client.workspaceMembership.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) } },
      _count: { _all: true },
    });
    const subs = await this.planInfo(owned.map((o) => o.workspaceId));
    const names = await this.planNames();
    const free = await this.plans.free();
    return (id: string) => {
      const mine = owned
        .filter((o) => o.userId === id)
        .map((o) => subs.get(o.workspaceId))
        .filter(Boolean);
      const best = mine.find((s) => s!.status === 'ACTIVE') ?? mine[0] ?? null;
      return {
        workspaceCount: counts.find((c) => c.userId === id)?._count._all ?? 0,
        planKey: best?.planKey ?? free.key,
        planName: names.get(best?.planKey ?? free.key) ?? free.name,
        subscriptionStatus: best?.status ?? 'NONE',
      };
    };
  }

  async customers(q: {
    q?: string;
    status?: 'ACTIVE' | 'DISABLED';
    subscription?: string;
    page: number;
    pageSize: number;
  }) {
    const and: Prisma.UserWhereInput[] = [];
    if (q.q)
      and.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    if (q.status) and.push({ status: q.status });
    if (q.subscription === 'NONE')
      and.push({
        memberships: { none: { role: 'OWNER', workspace: { subscription: { isNot: null } } } },
      });
    else if (q.subscription)
      and.push({
        memberships: {
          some: { role: 'OWNER', workspace: { subscription: { status: q.subscription as never } } },
        },
      });
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const [total, users] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, name: true, email: true, createdAt: true, status: true },
      }),
    ]);
    const info = await this.customerRows(users);
    return {
      data: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), ...info(u.id) })),
      meta: meta(q.page, q.pageSize, total),
    };
  }

  async customer(id: string) {
    const u = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        status: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        suspendedReason: true,
        memberships: {
          select: { role: true, workspace: { select: { id: true, name: true, status: true } } },
        },
      },
    });
    if (!u) throw new NotFoundException('Customer not found');
    const info = (await this.customerRows([u]))(u.id);
    const subs = await this.planInfo(u.memberships.map((m) => m.workspace.id));
    const ownedIds = u.memberships.filter((m) => m.role === 'OWNER').map((m) => m.workspace.id);
    const [invoices, activity] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where: { workspaceId: { in: ownedIds } },
        orderBy: { issuedAt: 'desc' },
        take: 10,
        include: { workspace: { select: { name: true } } },
      }),
      this.prisma.client.auditLog.findMany({
        where: { actorId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { action: true, createdAt: true },
      }),
    ]);
    const free = await this.plans.free();
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      status: u.status,
      ...info,
      emailVerified: u.emailVerifiedAt !== null,
      suspendedAt: iso(u.suspendedAt),
      suspendedReason: u.suspendedReason,
      workspaces: u.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: m.role,
        status: m.workspace.status,
        planKey: subs.get(m.workspace.id)?.planKey ?? free.key,
        subscriptionStatus: subs.get(m.workspace.id)?.status ?? 'NONE',
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        totalMinor: i.totalMinor,
        currency: i.currency,
        issuedAt: i.issuedAt.toISOString(),
        workspace: i.workspace.name,
      })),
      activity: activity.map((a) => ({ action: a.action, at: a.createdAt.toISOString() })),
    };
  }

  async setCustomerStatus(
    admin: AdminContext,
    id: string,
    suspend: boolean,
    reason: string | undefined,
    ip?: string,
  ) {
    const u = await this.prisma.client.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    });
    if (!u) throw new NotFoundException('Customer not found');
    if (suspend === (u.status === 'DISABLED'))
      throw new ConflictException(
        suspend ? 'This customer is already suspended.' : 'This customer isn’t suspended.',
      );
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: suspend
          ? { status: 'DISABLED', suspendedAt: new Date(), suspendedReason: reason ?? null }
          : { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
      });
      // Suspension takes effect now: every refresh token is revoked; workspace requests re-check the status on each call.
      if (suspend)
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.log(
        {
          admin,
          action: suspend ? 'customer.suspend' : 'customer.reactivate',
          targetType: 'customer',
          targetId: id,
          targetLabel: u.email,
          reason,
          ip,
        },
        tx,
      );
    });
    return this.customer(id);
  }

  // ---------- workspaces ----------

  async workspaces(q: {
    q?: string;
    status?: 'ACTIVE' | 'SUSPENDED';
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.WorkspaceWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { slug: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.workspace.count({ where }),
      this.prisma.client.workspace.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          subscription: true,
          memberships: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          _count: {
            select: {
              channels: { where: { status: 'CONNECTED' } },
              memberships: { where: { status: 'ACTIVE' } },
            },
          },
        },
      }),
    ]);
    const names = await this.planNames();
    const free = await this.plans.free();
    return {
      data: rows.map((w) => this.workspaceItem(w, names, free.key)),
      meta: meta(q.page, q.pageSize, total),
    };
  }

  private workspaceItem(
    w: Prisma.WorkspaceGetPayload<{
      include: {
        subscription: true;
        memberships: { include: { user: { select: { id: true; name: true; email: true } } } };
        _count: { select: { channels: true; memberships: true } };
      };
    }>,
    names: Map<string, string>,
    freeKey: string,
  ) {
    const key = w.subscription?.planKey ?? freeKey;
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      owner: w.memberships[0]?.user ?? null,
      members: w._count.memberships,
      channels: w._count.channels,
      planKey: key,
      planName: names.get(key) ?? key,
      subscriptionStatus: w.subscription?.status ?? 'NONE',
      createdAt: w.createdAt.toISOString(),
      status: w.status,
    };
  }

  async workspace(id: string) {
    const w = await this.prisma.client.workspace.findUnique({
      where: { id },
      include: {
        subscription: true,
        memberships: {
          where: { role: 'OWNER' },
          take: 1,
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: {
          select: {
            channels: { where: { status: 'CONNECTED' } },
            memberships: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    if (!w) throw new NotFoundException('Workspace not found');
    const names = await this.planNames();
    const free = await this.plans.free();
    return {
      ...this.workspaceItem(w, names, free.key),
      suspendedAt: iso(w.suspendedAt),
      suspendedReason: w.suspendedReason,
      subscription: w.subscription && {
        id: w.subscription.id,
        interval: w.subscription.interval,
        source: w.subscription.source,
        renewsAt: iso(w.subscription.currentPeriodEnd),
        cancelAtPeriodEnd: w.subscription.cancelAtPeriodEnd,
      },
    };
  }

  async setWorkspaceStatus(
    admin: AdminContext,
    id: string,
    suspend: boolean,
    reason: string | undefined,
    ip?: string,
  ) {
    const w = await this.prisma.client.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!w) throw new NotFoundException('Workspace not found');
    if (suspend === (w.status === 'SUSPENDED'))
      throw new ConflictException(
        suspend ? 'This workspace is already suspended.' : 'This workspace isn’t suspended.',
      );
    await this.prisma.client.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id },
        data: suspend
          ? { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason ?? null }
          : { status: 'ACTIVE', suspendedAt: null, suspendedReason: null },
      });
      await this.audit.log(
        {
          admin,
          action: suspend ? 'workspace.suspend' : 'workspace.reactivate',
          targetType: 'workspace',
          targetId: id,
          targetLabel: w.name,
          reason,
          ip,
        },
        tx,
      );
    });
    return this.workspace(id);
  }

  // ---------- activity ----------

  async activity(q: { source: 'admin' | 'payments'; q?: string; page: number; pageSize: number }) {
    if (q.source === 'payments') {
      const where: Prisma.BillingEventWhereInput = q.q
        ? {
            OR: [
              { type: { contains: q.q, mode: 'insensitive' } },
              { outcome: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {};
      const [total, rows] = await Promise.all([
        this.prisma.client.billingEvent.count({ where }),
        this.prisma.client.billingEvent.findMany({
          where,
          orderBy: [{ processedAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          include: { workspace: { select: { name: true } } },
        }),
      ]);
      return {
        data: rows.map((e) => ({
          id: e.id,
          at: e.processedAt.toISOString(),
          actor: 'Payment provider',
          action: e.type,
          target: e.workspace?.name ?? null,
          reason: null,
          metadata: { outcome: e.outcome, occurredAt: e.occurredAt.toISOString() } as Record<
            string,
            unknown
          >,
        })),
        meta: meta(q.page, q.pageSize, total),
      };
    }
    const where: Prisma.AdminAuditLogWhereInput = q.q
      ? {
          OR: [
            { action: { contains: q.q, mode: 'insensitive' } },
            { adminEmail: { contains: q.q, mode: 'insensitive' } },
            { targetLabel: { contains: q.q, mode: 'insensitive' } },
            { reason: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.client.adminAuditLog.count({ where }),
      this.prisma.client.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        actor: e.adminEmail,
        action: e.action,
        target: e.targetLabel ?? (e.targetId ? `${e.targetType ?? ''} ${e.targetId}`.trim() : null),
        reason: e.reason,
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      })),
      meta: meta(q.page, q.pageSize, total),
    };
  }

  // ---------- settings ----------

  async getSettings() {
    const [branding, registrationOpen, last, plans] = await Promise.all([
      this.settings.branding(),
      this.settings.registrationOpen(),
      this.prisma.client.billingEvent.findFirst({
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
      }),
      this.plans.all(),
    ]);
    return {
      branding,
      registrationOpen,
      // Presence only. Keys and secrets are never read back out of the environment.
      paymentProvider: {
        provider: this.config.STRIPE_SECRET_KEY ? 'stripe' : null,
        configured: !!this.config.STRIPE_SECRET_KEY && !!this.config.STRIPE_WEBHOOK_SECRET,
        webhookSecretSet: !!this.config.STRIPE_WEBHOOK_SECRET,
        priceIdsConfigured: plans.filter(
          (p) =>
            p.rank > 0 &&
            this.plans.priceIdFor(p, 'MONTH', this.config.BILLING_PRICE_IDS) &&
            this.plans.priceIdFor(p, 'YEAR', this.config.BILLING_PRICE_IDS),
        ).length,
        lastWebhookAt: iso(last?.processedAt),
      },
      emailProvider: {
        configured: false,
        note: 'No email service is integrated, so Torio sends no emails (invitations are shared as links).',
      },
    };
  }

  async updateSettings(
    admin: AdminContext,
    input: {
      productName?: string;
      legalName?: string;
      supportEmail?: string;
      invoiceNote?: string;
      registrationOpen?: boolean;
      reason?: string;
    },
    ip?: string,
  ) {
    const before = await this.getSettings();
    const branding = {
      productName: input.productName ?? before.branding.productName,
      legalName: input.legalName ?? before.branding.legalName,
      supportEmail: input.supportEmail ?? before.branding.supportEmail,
      invoiceNote: input.invoiceNote ?? before.branding.invoiceNote,
    };
    const changed = (Object.keys(branding) as (keyof typeof branding)[]).filter(
      (k) => branding[k] !== before.branding[k],
    );
    if (input.registrationOpen !== undefined && input.registrationOpen !== before.registrationOpen)
      changed.push('registrationOpen' as never);
    await this.settings.setBranding(branding);
    if (input.registrationOpen !== undefined)
      await this.settings.setRegistrationOpen(input.registrationOpen);
    if (changed.length)
      await this.audit.log({
        admin,
        action: 'settings.update',
        targetType: 'settings',
        reason: input.reason,
        metadata: {
          changed,
          ...(input.registrationOpen !== undefined && { registrationOpen: input.registrationOpen }),
        },
        ip,
      });
    return this.getSettings();
  }
}
