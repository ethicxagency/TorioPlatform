import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  changeKind,
  overages,
  subscriptionActions,
  USAGE_LABEL,
  USAGE_METRICS,
  usageLevel,
  usagePercent,
  type BillingInterval,
  type InvoiceQuery,
  type UsageMetric,
} from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { renderInvoicePdf } from './invoice-pdf';
import {
  billingDetailsOf,
  missingBillingDetails,
  WORKSPACE_DETAIL_SELECT,
} from './billing-details';
import { priceMinor } from './plans';
import { effectivePlan, PlansService, type CatalogPlan } from './plans.service';
import { PlatformSettingsService } from '../platform/platform-settings.service';
import { BILLING_PROVIDER, type BillingProvider } from './provider/billing-provider';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const NOT_TRACKED = ['AI conversations', 'AI credits consumed', 'Storage'];

type SubRow = NonNullable<Awaited<ReturnType<BillingService['subRow']>>>;

/** Every query is scoped by workspaceId. Subscription, invoice and payment-method state is only written by webhooks. */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly catalog: PlansService,
    private readonly platform: PlatformSettingsService,
  ) {}

  private async seller() {
    const b = await this.platform.branding();
    return { name: b.legalName || b.productName, note: b.invoiceNote };
  }
  /** The plan a workspace is entitled to: the subscribed plan as snapshotted, else the free default. */
  private async planFor(
    sub: { planKey: string; planSnapshot: unknown } | null,
  ): Promise<CatalogPlan> {
    if (!sub) return this.catalog.free();
    return (
      effectivePlan(await this.catalog.get(sub.planKey), sub.planSnapshot, sub.planKey) ??
      (await this.catalog.free())
    );
  }
  private async planNames() {
    return new Map((await this.catalog.all()).map((p) => [p.key, p.name]));
  }
  /** What the customer may do. A manually granted plan has no provider subscription, so only support can change it. */
  private actionsFor(
    sub: (NonNullable<Parameters<typeof subscriptionActions>[0]> & { source?: string }) | null,
  ) {
    const a = subscriptionActions(sub);
    if (sub && sub.source === 'MANUAL')
      return {
        ...a,
        canChange: false,
        canCancel: false,
        canResume: false,
        canRetryPayment: false,
        canCheckout: false,
      };
    return a;
  }
  private hasPrices(p: CatalogPlan) {
    return (
      !!this.catalog.priceIdFor(p, 'MONTH', this.config.BILLING_PRICE_IDS) &&
      !!this.catalog.priceIdFor(p, 'YEAR', this.config.BILLING_PRICE_IDS)
    );
  }

  private subRow(ws: string) {
    return this.prisma.client.subscription.findUnique({ where: { workspaceId: ws } });
  }

  private planDto(p: CatalogPlan) {
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
      purchasable:
        this.provider.isConfigured() && p.rank > 0 && p.status === 'ACTIVE' && this.hasPrices(p),
      limits: Object.fromEntries(
        USAGE_METRICS.map((m) => [m, p.limits[m] === null ? -1 : p.limits[m]]),
      ) as Record<string, number>,
      features: p.features,
    };
  }

  async plans() {
    return { data: (await this.catalog.active()).map((p) => this.planDto(p)) };
  }

  private subDto(s: SubRow) {
    return {
      planKey: s.planKey,
      interval: s.interval,
      status: s.status,
      currentPeriodStart: iso(s.currentPeriodStart),
      currentPeriodEnd: iso(s.currentPeriodEnd),
      trialEnd: iso(s.trialEnd),
      startedAt: iso(s.startedAt),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      canceledAt: iso(s.canceledAt),
    };
  }

  // ---------- overview & usage ----------

  async overview(ws: string) {
    const sub = await this.subRow(ws);
    const live = sub && sub.status !== 'EXPIRED' ? sub : null;
    const plan = await this.planFor(live);
    const actions = this.actionsFor(live);
    const failedInvoice = await this.prisma.client.invoice.count({
      where: { workspaceId: ws, status: 'FAILED' },
    });
    const usage = await this.usageNumbers(ws, sub);
    let top: { metric: string; used: number; limit: number; percent: number } | null = null;
    for (const m of USAGE_METRICS) {
      const limit = plan.limits[m];
      if (limit === null) continue;
      const percent = usagePercent(usage.values[m], limit);
      if (!top || percent > top.percent) top = { metric: m, used: usage.values[m], limit, percent };
    }
    const renews =
      live && !live.cancelAtPeriodEnd && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(live.status)
        ? live.currentPeriodEnd
        : null;
    return {
      providerConfigured: this.provider.isConfigured(),
      provider: this.provider.name,
      onFreePlan: !live,
      plan: this.planDto(plan),
      subscription: live ? this.subDto(live) : null,
      actions,
      nextPayment:
        live && renews
          ? {
              date: renews.toISOString(),
              amountMinor: priceMinor(plan, live.interval),
              currency: plan.currency,
              placeholderPricing: plan.placeholderPricing,
            }
          : null,
      hasFailedPayment: live?.status === 'PAST_DUE' || failedInvoice > 0,
      usage: top,
      aiCredits: { metered: false as const },
    };
  }

  private async usageNumbers(
    ws: string,
    sub: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null } | null,
  ) {
    const db = this.prisma.client;
    const now = new Date();
    const start =
      sub?.currentPeriodStart && sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? sub.currentPeriodStart
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end =
      sub?.currentPeriodStart && sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? sub.currentPeriodEnd
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const conv = (provider: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER') =>
      db.conversation.count({
        where: { workspaceId: ws, createdAt: { gte: start }, channel: { provider } },
      });
    const [members, channels, contacts, messages, whatsapp, instagram, messenger] =
      await Promise.all([
        db.workspaceMembership.count({ where: { workspaceId: ws, status: 'ACTIVE' } }),
        db.channel.count({ where: { workspaceId: ws, status: 'CONNECTED' } }),
        db.customer.count({ where: { workspaceId: ws } }),
        db.message.count({
          where: { workspaceId: ws, kind: 'OUTBOUND', createdAt: { gte: start } },
        }),
        conv('WHATSAPP'),
        conv('INSTAGRAM'),
        conv('MESSENGER'),
      ]);
    return {
      start,
      end,
      values: { members, channels, contacts, messages, whatsapp, instagram, messenger } as Record<
        UsageMetric,
        number
      >,
    };
  }

  async usage(ws: string) {
    const sub = await this.subRow(ws);
    const live = sub && sub.status !== 'EXPIRED' ? sub : null;
    const plan = await this.planFor(live);
    const u = await this.usageNumbers(ws, live);
    return {
      planKey: plan.key,
      periodStart: u.start.toISOString(),
      periodEnd: u.end.toISOString(),
      data: USAGE_METRICS.map((m) => {
        const limit = plan.limits[m];
        const used = u.values[m];
        return {
          metric: m,
          label: USAGE_LABEL[m],
          used,
          limit: limit ?? -1,
          remaining: limit === null ? -1 : Math.max(0, limit - used),
          percent: usagePercent(used, limit),
          level: usageLevel(used, limit),
        };
      }),
      notTracked: NOT_TRACKED,
    };
  }

  // ---------- billing profile ----------

  private emptyProfile() {
    return billingDetailsOf({
      name: '',
      contactEmail: null,
      phone: null,
      country: null,
      addressLine: null,
      city: null,
      state: null,
      postalCode: null,
    });
  }

  private async workspaceDetails(ws: string) {
    const w = await this.prisma.client.workspace.findUniqueOrThrow({
      where: { id: ws },
      select: WORKSPACE_DETAIL_SELECT,
    });
    return billingDetailsOf(w);
  }

  /**
   * The billing details new invoices will use: this store's General Settings, read-only here. `missing` lists what an
   * invoice cannot be issued without, so the page can point at Settings → General.
   */
  async profile(ws: string) {
    const details = await this.workspaceDetails(ws);
    const missing = missingBillingDetails(details);
    return {
      details,
      missing,
      complete: missing.length === 0,
      source: 'general-settings' as const,
    };
  }

  /** Refuses to start a purchase that would produce an invoice without the required details. */
  private async requireBillingDetails(ws: string) {
    const missing = missingBillingDetails(await this.workspaceDetails(ws));
    if (missing.length)
      throw new BadRequestException({
        message: `Complete your business information in Settings → General before purchasing: ${missing.map((m) => m.label).join(', ')}.`,
        code: 'BILLING_DETAILS_INCOMPLETE',
        missing,
      });
  }

  private audit(
    tx: Prisma.TransactionClient,
    ws: string,
    actorId: string,
    action: string,
    description: string,
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action,
        entityType: 'billing',
        entityId: ws,
        metadata: { description },
      },
    });
  }

  private async customerId(ws: string, actor: { email: string | null; name: string | null }) {
    const acct = await this.prisma.client.billingAccount.findUnique({ where: { workspaceId: ws } });
    if (acct?.providerCustomerId) return acct.providerCustomerId;
    const d = await this.workspaceDetails(ws);
    const id = await this.provider.ensureCustomer({
      workspaceId: ws,
      email: d.billingEmail ?? actor.email,
      name: d.companyName ?? actor.name,
    });
    await this.prisma.client.billingAccount.upsert({
      where: { workspaceId: ws },
      create: { workspaceId: ws, provider: this.provider.name, providerCustomerId: id },
      update: { provider: this.provider.name, providerCustomerId: id },
    });
    return id;
  }
  private async actorInfo(userId: string) {
    const u = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    return { email: u?.email ?? null, name: u?.name ?? null };
  }
  private returnUrls(path = '') {
    const base = `${this.config.WEB_URL.replace(/\/$/, '')}/billing`;
    return {
      successUrl: `${base}?result=success${path}`,
      cancelUrl: `${base}?result=cancelled${path}`,
    };
  }

  // ---------- payment methods ----------

  async paymentMethods(ws: string) {
    const rows = await this.prisma.client.paymentMethodRef.findMany({
      where: { workspaceId: ws },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        brand: r.brand,
        last4: r.last4,
        expMonth: r.expMonth,
        expYear: r.expYear,
        isDefault: r.isDefault,
      })),
    };
  }

  /** Card details are entered on the provider's hosted page; Torio never sees them. */
  async paymentMethodSession(ws: string, userId: string) {
    const customerId = await this.customerId(ws, await this.actorInfo(userId));
    return this.provider.createPaymentMethodSession({
      customerId,
      workspaceId: ws,
      ...this.returnUrls('&pm=1'),
    });
  }

  private async pm(ws: string, id: string) {
    const r = await this.prisma.client.paymentMethodRef.findFirst({
      where: { id, workspaceId: ws },
    });
    if (!r) throw new NotFoundException('Payment method not found');
    return r;
  }

  async setDefaultPaymentMethod(ws: string, actorId: string, id: string) {
    const r = await this.pm(ws, id);
    const acct = await this.prisma.client.billingAccount.findUnique({ where: { workspaceId: ws } });
    if (!acct?.providerCustomerId) throw new ConflictException('No billing customer exists yet');
    await this.provider.setDefaultPaymentMethod({
      customerId: acct.providerCustomerId,
      paymentMethodId: r.providerPaymentMethodId,
    });
    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentMethodRef.updateMany({
        where: { workspaceId: ws },
        data: { isDefault: false },
      });
      await tx.paymentMethodRef.update({ where: { id }, data: { isDefault: true } });
      await this.audit(
        tx,
        ws,
        actorId,
        'billing.default_payment_method',
        `Default payment method set to ${r.brand} ending ${r.last4}`,
      );
    });
    return this.paymentMethods(ws);
  }

  async removePaymentMethod(ws: string, actorId: string, id: string) {
    const r = await this.pm(ws, id);
    const sub = await this.subRow(ws);
    const count = await this.prisma.client.paymentMethodRef.count({ where: { workspaceId: ws } });
    if (
      r.isDefault &&
      count === 1 &&
      sub &&
      ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status) &&
      !sub.cancelAtPeriodEnd
    )
      throw new ConflictException(
        'Add another payment method before removing the only one on an active subscription',
      );
    await this.provider.detachPaymentMethod({ paymentMethodId: r.providerPaymentMethodId });
    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentMethodRef.delete({ where: { id } });
      await this.audit(
        tx,
        ws,
        actorId,
        'billing.payment_method_removed',
        `Payment method ${r.brand} ending ${r.last4} removed`,
      );
    });
    return this.paymentMethods(ws);
  }

  // ---------- invoices ----------

  private invoiceDescription(i: { planKey: string | null }, names: Map<string, string>) {
    const plan = i.planKey ? (names.get(i.planKey) ?? i.planKey) : null;
    return plan ? `${plan} subscription` : 'Subscription invoice';
  }
  private invDto(i: Prisma.InvoiceGetPayload<object>, names: Map<string, string>) {
    return {
      id: i.id,
      number: i.number,
      status: i.status,
      currency: i.currency,
      totalMinor: i.totalMinor,
      periodStart: iso(i.periodStart),
      periodEnd: iso(i.periodEnd),
      planKey: i.planKey,
      description: this.invoiceDescription(i, names),
      issuedAt: i.issuedAt.toISOString(),
      hostedUrl: i.hostedUrl,
      canRetry: i.status === 'FAILED' && this.provider.isConfigured(),
    };
  }

  async invoices(ws: string, q: InvoiceQuery) {
    const issuedAt: Prisma.DateTimeFilter = {};
    if (q.from) issuedAt.gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) issuedAt.lte = new Date(`${q.to}T23:59:59.999Z`);
    const where: Prisma.InvoiceWhereInput = {
      workspaceId: ws,
      ...(q.status && { status: q.status }),
      ...((q.from || q.to) && { issuedAt }),
      ...(q.q && {
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { planKey: { contains: q.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, rows, byStatus] = await Promise.all([
      this.prisma.client.invoice.count({ where }),
      this.prisma.client.invoice.findMany({
        where,
        orderBy:
          q.sort === 'date_asc'
            ? [{ issuedAt: 'asc' }, { id: 'asc' }]
            : q.sort === 'amount_desc'
              ? [{ totalMinor: 'desc' }, { issuedAt: 'desc' }, { id: 'desc' }]
              : q.sort === 'amount_asc'
                ? [{ totalMinor: 'asc' }, { issuedAt: 'desc' }, { id: 'desc' }]
                : [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      // Whole-history summary for this workspace only (the list filters do not narrow it).
      this.prisma.client.invoice.groupBy({
        by: ['status', 'currency'],
        where: { workspaceId: ws },
        _count: { _all: true },
        _sum: { totalMinor: true, amountPaidMinor: true },
      }),
    ]);
    const names = await this.planNames();
    const outstanding = new Map<string, number>();
    for (const g of byStatus)
      if (g.status === 'PENDING' || g.status === 'FAILED')
        outstanding.set(
          g.currency,
          (outstanding.get(g.currency) ?? 0) +
            Math.max(0, (g._sum.totalMinor ?? 0) - (g._sum.amountPaidMinor ?? 0)),
        );
    return {
      data: rows.map((r) => this.invDto(r, names)),
      summary: {
        total: byStatus.reduce((a, g) => a + g._count._all, 0),
        paid: byStatus.filter((g) => g.status === 'PAID').reduce((a, g) => a + g._count._all, 0),
        outstanding: [...outstanding].map(([currency, amountMinor]) => ({ currency, amountMinor })),
      },
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  private async invoiceRow(ws: string, id: string) {
    const i = await this.prisma.client.invoice.findFirst({
      where: { id, workspaceId: ws },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!i) throw new NotFoundException('Invoice not found');
    return i;
  }

  async invoice(ws: string, id: string) {
    const i = await this.invoiceRow(ws, id);
    const snap = (i.customerSnapshot ?? {}) as Record<string, string | null>;
    const profile = { ...this.emptyProfile(), ...snap };
    return {
      ...this.invDto(i, await this.planNames()),
      subtotalMinor: i.subtotalMinor,
      taxMinor: i.taxMinor,
      amountPaidMinor: i.amountPaidMinor,
      paymentSummary: i.paymentSummary,
      lines: i.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        amountMinor: l.amountMinor,
      })),
      customer: profile,
      seller: await this.seller(),
    };
  }

  async invoicePdf(ws: string, id: string) {
    const i = await this.invoiceRow(ws, id);
    const number = i.number ?? `INV-${i.id.slice(0, 8).toUpperCase()}`;
    return {
      filename: `${number}.pdf`,
      body: renderInvoicePdf({
        number,
        issuedAt: i.issuedAt,
        status: i.status,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
        planName: i.planKey ? ((await this.catalog.get(i.planKey))?.name ?? i.planKey) : null,
        currency: i.currency,
        subtotalMinor: i.subtotalMinor,
        taxMinor: i.taxMinor,
        totalMinor: i.totalMinor,
        paymentSummary: i.paymentSummary,
        customer: (i.customerSnapshot ?? null) as Record<string, string | null> | null,
        lines: i.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          amountMinor: l.amountMinor,
        })),
        seller: await this.seller(),
      }),
    };
  }

  async retryInvoice(ws: string, actorId: string, id: string) {
    const i = await this.invoiceRow(ws, id);
    if (i.status !== 'FAILED') throw new ConflictException('Only failed invoices can be retried');
    await this.provider.retryInvoice({ invoiceId: i.providerInvoiceId });
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action: 'billing.retry_payment',
        entityType: 'billing',
        entityId: ws,
        metadata: { description: `Payment retried for invoice ${i.number ?? i.id.slice(0, 8)}` },
      },
    });
    return {
      accepted: true as const,
      message:
        'Payment retry submitted. The invoice updates when the provider confirms the result.',
    };
  }

  // ---------- subscription changes ----------

  private async target(planKey: string, interval: BillingInterval) {
    const plan = await this.catalog.get(planKey);
    if (!plan || plan.status !== 'ACTIVE')
      throw new BadRequestException('Unknown or unavailable plan');
    return { plan, interval };
  }

  async preview(ws: string, input: { planKey: string; interval: BillingInterval }) {
    const { plan, interval } = await this.target(input.planKey, input.interval);
    const sub = await this.subRow(ws);
    const live = sub && sub.status !== 'EXPIRED' ? sub : null;
    const curPlan = await this.planFor(live);
    const cur = {
      key: curPlan.key,
      rank: curPlan.rank,
      interval: live?.interval ?? ('MONTH' as BillingInterval),
    };
    const kind = changeKind(cur, { key: plan.key, rank: plan.rank, interval });
    const usage = await this.usageNumbers(ws, live);
    const over = overages(usage.values, plan);
    const actions = this.actionsFor(live);
    const gained = plan.features.filter((f) => !curPlan.features.includes(f));
    const lost = curPlan.features.filter((f) => !plan.features.includes(f));
    let blocked: string | null = null;
    if (live?.source === 'MANUAL')
      blocked = 'This plan was assigned by Torio support. Contact support to change it.';
    else if (kind === 'same') blocked = 'This is already your plan.';
    else if (!live && plan.rank === 0) blocked = 'You are already on the Free plan.';
    else if (live && !actions.canChange && plan.rank > 0)
      blocked = live.cancelAtPeriodEnd
        ? 'Resume your subscription before changing plan.'
        : live.status === 'PAST_DUE'
          ? 'Fix the failed payment before changing plan.'
          : 'Your subscription can’t be changed right now.';
    else if (!live && !actions.canCheckout) blocked = 'Checkout isn’t available right now.';
    else if (plan.rank > 0 && !this.planDto(plan).purchasable)
      blocked = this.provider.isConfigured()
        ? 'This plan has no provider price configured yet.'
        : 'Payments aren’t connected, so plans can’t be purchased yet.';
    let effective: string;
    if (!live)
      effective =
        'You’ll continue to the provider’s secure checkout. The plan starts once payment is confirmed.';
    else if (plan.rank === 0)
      effective = `Your paid plan is cancelled at the end of the current period${live.currentPeriodEnd ? ` (${live.currentPeriodEnd.toISOString().slice(0, 10)})` : ''}; you then move to Free.`;
    else if (kind === 'upgrade')
      effective =
        'Takes effect immediately. The provider calculates any prorated charge and shows it on your next invoice.';
    else if (kind === 'downgrade')
      effective =
        'The provider applies the change immediately and calculates any credit for unused time on your next invoice.';
    else
      effective =
        'The billing interval changes immediately. The provider calculates any proration.';
    return {
      kind,
      planKey: plan.key,
      interval,
      priceMinor: priceMinor(plan, interval),
      currency: plan.currency,
      placeholderPricing: plan.placeholderPricing,
      effective,
      gained,
      lost: kind === 'upgrade' ? [] : lost,
      overages: over.map((o) => ({
        metric: o.metric,
        label: USAGE_LABEL[o.metric],
        used: o.used,
        limit: o.limit,
      })),
      blockedReason: blocked,
    };
  }

  async checkout(
    ws: string,
    userId: string,
    input: { planKey: string; interval: BillingInterval },
  ) {
    const { plan, interval } = await this.target(input.planKey, input.interval);
    const sub = await this.subRow(ws);
    if (!this.actionsFor(sub && sub.status !== 'EXPIRED' ? sub : null).canCheckout)
      throw new ConflictException(
        'This workspace already has a subscription. Change the plan instead.',
      );
    const priceId = this.catalog.priceIdFor(plan, interval, this.config.BILLING_PRICE_IDS);
    if (plan.rank === 0 || !priceId)
      throw new BadRequestException(
        'This plan can’t be purchased: no provider price is configured for it.',
      );
    await this.requireBillingDetails(ws);
    const customerId = await this.customerId(ws, await this.actorInfo(userId));
    return this.provider.createCheckoutSession({
      customerId,
      workspaceId: ws,
      priceId,
      ...this.returnUrls(),
    });
  }

  async change(
    ws: string,
    actorId: string,
    input: { planKey: string; interval: BillingInterval; acknowledgeOverage: boolean },
  ) {
    const p = await this.preview(ws, input);
    if (p.blockedReason) throw new ConflictException(p.blockedReason);
    const sub = await this.subRow(ws);
    if (!sub)
      throw new ConflictException('There is no subscription to change. Start with checkout.');
    if (p.overages.length && !input.acknowledgeOverage)
      throw new ConflictException(
        'Your current usage exceeds this plan’s limits. Confirm you understand before downgrading.',
      );
    const plan = (await this.catalog.get(input.planKey))!;
    if (plan.rank === 0)
      return this.cancel(ws, actorId, { atPeriodEnd: true, reason: 'Downgrade to Free' });
    const priceId = this.catalog.priceIdFor(plan, input.interval, this.config.BILLING_PRICE_IDS);
    if (!priceId) throw new BadRequestException('This plan has no provider price configured.');
    await this.requireBillingDetails(ws);
    await this.provider.changeSubscription({ subscriptionId: sub.providerSubscriptionId, priceId });
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action: 'billing.plan_change_requested',
        entityType: 'billing',
        entityId: ws,
        metadata: {
          description: `Plan change requested: ${sub.planKey} → ${plan.key} (${input.interval.toLowerCase()})`,
        },
      },
    });
    return {
      accepted: true as const,
      message: 'Plan change submitted. It shows here once the provider confirms it.',
    };
  }

  async cancel(ws: string, actorId: string, input: { atPeriodEnd: boolean; reason?: string }) {
    const sub = await this.subRow(ws);
    if (!sub || !this.actionsFor(sub).canCancel)
      throw new ConflictException('There is no active subscription to cancel.');
    await this.provider.cancelSubscription({
      subscriptionId: sub.providerSubscriptionId,
      atPeriodEnd: input.atPeriodEnd,
      reason: input.reason,
    });
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action: 'billing.cancel_requested',
        entityType: 'billing',
        entityId: ws,
        metadata: {
          description: `Cancellation requested (${input.atPeriodEnd ? 'at period end' : 'immediately'})${input.reason ? `: ${input.reason}` : ''}`,
        },
      },
    });
    return {
      accepted: true as const,
      message: input.atPeriodEnd
        ? 'Cancellation scheduled for the end of the billing period. It shows here once the provider confirms it.'
        : 'Cancellation submitted. It shows here once the provider confirms it.',
    };
  }

  async resume(ws: string, actorId: string) {
    const sub = await this.subRow(ws);
    if (!sub || !this.actionsFor(sub).canResume)
      throw new ConflictException('There is no scheduled cancellation to undo.');
    await this.provider.resumeSubscription({ subscriptionId: sub.providerSubscriptionId });
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action: 'billing.resume_requested',
        entityType: 'billing',
        entityId: ws,
        metadata: { description: 'Reactivation requested' },
      },
    });
    return {
      accepted: true as const,
      message: 'Reactivation submitted. It shows here once the provider confirms it.',
    };
  }
}
