import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BillingInterval } from '@torio/contracts';
import { Prisma } from '@torio/database';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import { isLive, loadStored } from '../../admin/integrations/state';
import { MailService } from '../../auth/mail.service';
import { TorioTrackingService } from '../../tracking/torio-tracking.service';
import { ChannelCryptoService } from '../../whatsapp/channel-crypto.service';
import {
  billingDetailsOf,
  missingBillingDetails,
  WORKSPACE_DETAIL_SELECT,
} from '../billing-details';
import { PlansService, snapshotOf } from '../plans.service';
import {
  createSession,
  judge,
  queryByTran,
  validate,
  verifyIpnSignature,
  type Fetch,
  type SslConfig,
} from './sslcommerz.client';

const FINAL = new Set(['PAID', 'REFUNDED']);
const money = (minor: number, cur: string) =>
  `${cur === 'BDT' ? '৳' : `${cur} `}${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const priceOf = (p: { monthlyMinor: number; yearlyMinor: number }, i: BillingInterval) =>
  i === 'YEAR' ? p.yearlyMinor : p.monthlyMinor;
export const addTerm = (from: Date, i: BillingInterval) => {
  const d = new Date(from);
  if (i === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};

export type CallbackKind = 'success' | 'fail' | 'cancel';

/**
 * Paying for a Torio plan through SSLCommerz. A payment attempt fixes the workspace, plan, term, amount and currency on Torio's side
 * first; the browser returning from the gateway proves nothing. A plan is only started after the gateway's own server-side validation
 * confirms the same transaction id, store, amount and currency, and that happens at most once per attempt (`appliedAt`), however many
 * times a callback, an IPN or a reconciliation arrives. The term is paid once and does not renew by itself.
 */
@Injectable()
export class SslcommerzService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SslcommerzService.name);
  /** Replaceable in tests. */
  fetch: Fetch = (...a) => fetch(...a);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly plans: PlansService,
    private readonly mail: MailService,
    private readonly tracking: TorioTrackingService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private timer: NodeJS.Timeout | null = null;
  onModuleInit() {
    // Paid terms end by themselves; this also marks them expired when nobody is looking at billing.
    this.timer = setInterval(() => {
      void this.expireDue().catch(() => undefined);
      void this.remindDue().catch(() => undefined);
    }, 15 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- configuration ----------

  /** The gateway settings, only while Super Admin has it verified and switched on. */
  async liveConfig(): Promise<SslConfig | null> {
    const s = await loadStored(this.prisma, 'sslcommerz');
    if (!isLive('sslcommerz', s) || !this.crypto.configured || !s.secrets.storePassword)
      return null;
    try {
      return {
        storeId: String(s.values.storeId),
        password: this.crypto.decrypt(s.secrets.storePassword),
        environment: s.values.environment === 'live' ? 'live' : 'sandbox',
        currencies: String(s.values.currencies ?? 'BDT')
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  async availability(): Promise<{ available: boolean; environment: 'sandbox' | 'live' | null }> {
    const c = await this.liveConfig();
    return { available: !!c, environment: c?.environment ?? null };
  }

  private urls() {
    const b = (this.config.API_URL ?? this.config.WEB_URL).replace(/\/$/, '');
    return {
      success: `${b}/api/v1/payments/sslcommerz/success`,
      fail: `${b}/api/v1/payments/sslcommerz/fail`,
      cancel: `${b}/api/v1/payments/sslcommerz/cancel`,
      ipn: `${b}/api/v1/payments/sslcommerz/ipn`,
    };
  }
  private back(result: string, tranId?: string) {
    const q = new URLSearchParams({ result, ...(tranId ? { tran: tranId } : {}) });
    return `${this.config.WEB_URL.replace(/\/$/, '')}/billing/subscription?${q}`;
  }

  // ---------- checkout ----------

  /** Whether this plan can be paid for through the gateway, and why not. Prices placeholders only run in the sandbox. */
  async quote(planKey: string, interval: BillingInterval, cfg: SslConfig) {
    const plan = await this.plans.get(planKey);
    if (!plan || plan.status !== 'ACTIVE' || plan.rank === 0)
      throw new BadRequestException('That plan can’t be purchased');
    const amountMinor = priceOf(plan, interval);
    if (amountMinor <= 0) throw new BadRequestException('That plan has no price for this term');
    if (!cfg.currencies.includes(plan.currency.toUpperCase()))
      throw new BadRequestException(`SSLCommerz isn’t set up for ${plan.currency} payments`);
    if (plan.placeholderPricing && cfg.environment === 'live')
      throw new BadRequestException(
        'This plan’s price is still a placeholder, so it can’t be charged in live mode.',
      );
    return { plan, amountMinor };
  }

  /** Synchronous version of the plan rules in `quote`, for listing which plans can be paid for. */
  canPay(
    p: {
      rank: number;
      status: string;
      currency: string;
      monthlyMinor: number;
      yearlyMinor: number;
      placeholderPricing: boolean;
    },
    cfg: SslConfig,
  ): boolean {
    return (
      p.rank > 0 &&
      p.status === 'ACTIVE' &&
      (p.monthlyMinor > 0 || p.yearlyMinor > 0) &&
      cfg.currencies.includes(p.currency.toUpperCase()) &&
      !(p.placeholderPricing && cfg.environment === 'live')
    );
  }

  async checkout(
    ws: string,
    userId: string,
    input: { planKey: string; interval: BillingInterval },
  ) {
    const cfg = await this.liveConfig();
    if (!cfg)
      throw new ServiceUnavailableException('SSLCommerz payments are not available right now.');
    const db = this.prisma.client;
    const sub = await db.subscription.findUnique({ where: { workspaceId: ws } });
    if (sub && sub.status !== 'EXPIRED' && sub.source !== 'GATEWAY')
      throw new ConflictException(
        'This workspace already has a subscription managed elsewhere, so it can’t be paid here.',
      );
    const { plan, amountMinor } = await this.quote(input.planKey, input.interval, cfg);
    const w = await db.workspace.findUnique({ where: { id: ws }, select: WORKSPACE_DETAIL_SELECT });
    if (!w) throw new NotFoundException('Workspace not found');
    const details = billingDetailsOf(w);
    const missing = missingBillingDetails(details);
    if (missing.length)
      throw new BadRequestException({
        message: `Complete your business information in Settings → General before purchasing: ${missing.map((m) => m.label).join(', ')}.`,
        code: 'BILLING_DETAILS_INCOMPLETE',
        missing,
      });
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const tranId = `TORIO-${randomBytes(9).toString('hex').toUpperCase()}`;
    const row = await db.paymentGatewayTransaction.create({
      data: {
        gateway: 'sslcommerz',
        tranId,
        workspaceId: ws,
        userId,
        planKey: plan.key,
        interval: input.interval,
        amountMinor,
        currency: plan.currency.toUpperCase(),
        environment: cfg.environment,
      },
    });
    const s = await createSession(this.fetch, cfg, {
      tranId,
      amount: (amountMinor / 100).toFixed(2),
      currency: plan.currency.toUpperCase(),
      product: `${plan.name} plan (${input.interval === 'YEAR' ? 'yearly' : 'monthly'})`,
      customer: {
        name: details.companyName ?? user?.name ?? 'Customer',
        email: details.billingEmail ?? user?.email ?? '',
        phone: details.phone ?? '01700000000',
        address: details.addressLine ?? details.city ?? 'N/A',
        city: details.city ?? details.state ?? 'N/A',
        country: details.country ?? 'Bangladesh',
        postcode: details.postalCode ?? undefined,
      },
      urls: this.urls(),
    });
    if (!s.ok) {
      await db.paymentGatewayTransaction.update({
        where: { id: row.id },
        data: { status: 'FAILED', reason: s.reason },
      });
      throw new BadRequestException(
        s.unreachable ? s.reason : `The payment could not be started: ${s.reason}`,
      );
    }
    await db.paymentGatewayTransaction.update({
      where: { id: row.id },
      data: { sessionKey: s.sessionKey || null, status: 'PENDING' },
    });
    return { url: s.url, tranId };
  }

  // ---------- confirmation ----------

  /**
   * Decides what a transaction is, by asking the gateway, never by what the caller says. Safe to call any number of times, from a
   * callback, an IPN or a reconciliation: the first valid one starts the plan and the rest find it already applied.
   */
  async confirm(tranId: string, valIdHint?: string | null): Promise<string> {
    const db = this.prisma.client;
    const tx = await db.paymentGatewayTransaction.findUnique({ where: { tranId } });
    if (!tx) return 'UNKNOWN';
    if (FINAL.has(tx.status)) return tx.status;
    const cfg = await this.liveConfig();
    if (!cfg) return tx.status; // gateway switched off: nothing can be confirmed, nothing is changed
    let valId = valIdHint ?? tx.valId ?? null;
    if (!valId) {
      const q = await queryByTran(this.fetch, cfg, tranId);
      if (!q || !q.valId || !['VALID', 'VALIDATED'].includes(q.status)) return tx.status;
      valId = q.valId;
    }
    const v = await validate(this.fetch, cfg, valId);
    if (!v) return tx.status; // gateway unreachable: stays as it was, retried by the next callback or reconciliation
    const verdict = judge(
      v,
      { tranId, amountMinor: tx.amountMinor, currency: tx.currency },
      cfg.storeId,
    );
    if (!verdict.ok) {
      if (verdict.kind === 'invalid') return tx.status;
      await db.paymentGatewayTransaction.updateMany({
        where: { id: tx.id, appliedAt: null },
        data: {
          status: verdict.kind === 'risk' ? 'REVIEW' : 'REJECTED',
          reason: verdict.reason,
          valId,
        },
      });
      return verdict.kind === 'risk' ? 'REVIEW' : 'REJECTED';
    }
    return this.apply(tx.id, valId, v.bankTranId, v.method, v.raw);
  }

  /** Starts the plan and records the invoice, exactly once per transaction, in one database transaction. */
  private async apply(
    id: string,
    valId: string,
    bank: string | null,
    method: string | null,
    raw: Record<string, string>,
  ): Promise<string> {
    const db = this.prisma.client;
    const now = new Date();
    type Done = {
      status: string;
      mail?: {
        to: string | null;
        vars: Record<string, string>;
        workspaceId: string;
        userId: string | null;
      };
      purchase?: {
        email: string | null;
        value: number;
        currency: string;
        tranId: string;
        userId: string | null;
      };
    };
    const done: Done = await db.$transaction(async (tx): Promise<Done> => {
      const t = await tx.paymentGatewayTransaction.findUniqueOrThrow({ where: { id } });
      if (t.appliedAt || t.status === 'PAID') return { status: 'PAID' };
      const plan = await this.plans.get(t.planKey);
      if (!plan) {
        await tx.paymentGatewayTransaction.update({
          where: { id },
          data: { status: 'REVIEW', reason: 'The plan no longer exists', valId },
        });
        return { status: 'REVIEW' };
      }
      const cur = await tx.subscription.findUnique({ where: { workspaceId: t.workspaceId } });
      const blocking = cur && cur.status !== 'EXPIRED' && cur.source !== 'GATEWAY';
      if (blocking) {
        await tx.paymentGatewayTransaction.update({
          where: { id },
          data: {
            status: 'REVIEW',
            reason:
              'Paid, but the workspace has another active subscription. Support needs to resolve it.',
            valId,
          },
        });
        return { status: 'REVIEW' };
      }
      // Paying again for the same plan before it ends continues from its end; anything else starts a term now.
      const extend =
        cur &&
        cur.source === 'GATEWAY' &&
        cur.status === 'ACTIVE' &&
        cur.planKey === t.planKey &&
        cur.currentPeriodEnd &&
        cur.currentPeriodEnd > now;
      const start = extend ? cur.currentPeriodEnd! : now;
      const end = addTerm(start, t.interval);
      const subData = {
        planKey: t.planKey,
        interval: t.interval,
        status: 'ACTIVE' as const,
        source: 'GATEWAY' as const,
        providerSubscriptionId: `sslcommerz:${t.tranId}`,
        priceMinor: t.amountMinor,
        currency: t.currency,
        planSnapshot: snapshotOf(plan) as Prisma.InputJsonValue,
        currentPeriodStart: extend ? cur.currentPeriodStart : now,
        currentPeriodEnd: end,
        // A term paid once ends by itself: it is shown as "access until", and Torio never charges again on its own.
        cancelAtPeriodEnd: true,
        startedAt:
          cur?.source === 'GATEWAY' && cur.status === 'ACTIVE' ? (cur.startedAt ?? now) : now,
        lastEventAt: now,
      };
      await tx.subscription.upsert({
        where: { workspaceId: t.workspaceId },
        create: { workspaceId: t.workspaceId, ...subData },
        update: subData,
      });
      const w = await tx.workspace.findUnique({
        where: { id: t.workspaceId },
        select: WORKSPACE_DETAIL_SELECT,
      });
      const inv = await tx.invoice.create({
        data: {
          workspaceId: t.workspaceId,
          providerInvoiceId: `sslcommerz:${t.tranId}`,
          number: `SSL-${now.toISOString().slice(0, 7).replace('-', '')}-${t.tranId.slice(-6)}`,
          status: 'PAID',
          currency: t.currency,
          subtotalMinor: t.amountMinor,
          taxMinor: 0,
          totalMinor: t.amountMinor,
          amountPaidMinor: t.amountMinor,
          periodStart: start,
          periodEnd: end,
          planKey: t.planKey,
          customerSnapshot: (w ? billingDetailsOf(w) : Prisma.JsonNull) as Prisma.InputJsonValue,
          paymentSummary: method ? `${method} (SSLCommerz)` : 'SSLCommerz',
          issuedAt: now,
          lastEventAt: now,
          lines: {
            create: [
              {
                position: 0,
                description: `${plan.name} plan, ${t.interval === 'YEAR' ? 'yearly' : 'monthly'} term`,
                quantity: 1,
                amountMinor: t.amountMinor,
              },
            ],
          },
        },
      });
      await tx.paymentGatewayTransaction.update({
        where: { id },
        data: {
          status: 'PAID',
          reason: null,
          valId,
          bankTranId: bank,
          paymentMethod: method,
          gatewayResult: raw as Prisma.InputJsonValue,
          validatedAt: now,
          appliedAt: now,
          invoiceId: inv.id,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: t.workspaceId,
          actorId: t.userId,
          action: 'billing.payment_received',
          entityType: 'billing',
          entityId: t.workspaceId,
          metadata: {
            description: `Paid ${money(t.amountMinor, t.currency)} for ${plan.name} (${t.interval === 'YEAR' ? 'yearly' : 'monthly'}) through SSLCommerz`,
            tranId: t.tranId,
          },
        },
      });
      const payer = t.userId
        ? await tx.user.findUnique({ where: { id: t.userId }, select: { name: true, email: true } })
        : null;
      return {
        status: 'PAID',
        mail: {
          to: w?.contactEmail ?? payer?.email ?? null,
          workspaceId: t.workspaceId,
          userId: t.userId,
          vars: {
            name: payer?.name ?? '',
            plan: plan.name,
            term: t.interval === 'YEAR' ? 'yearly' : 'monthly',
            amount: money(t.amountMinor, t.currency),
            workspace: w?.name ?? '',
            until: end.toISOString().slice(0, 10),
            reference: t.tranId,
            link: `${this.config.WEB_URL.replace(/\/$/, '')}/billing`,
          },
        },
        purchase: {
          email: payer?.email ?? w?.contactEmail ?? null,
          value: t.amountMinor / 100,
          currency: t.currency,
          tranId: t.tranId,
          userId: t.userId,
        },
      };
    });
    // Side effects of a confirmed payment. A failure in either can never undo the payment.
    if (done.mail?.to)
      void this.mail
        .sendTemplate('payment_confirmation', done.mail.to, done.mail.vars, {
          workspaceId: done.mail.workspaceId,
          userId: done.mail.userId ?? undefined,
        })
        .catch(() => undefined);
    if (done.purchase)
      void this.tracking
        .track({
          eventName: 'Purchase',
          eventId: `purchase-${done.purchase.tranId}`,
          eventTime: new Date(),
          actionSource: 'website',
          user: { email: done.purchase.email, externalId: done.purchase.userId },
          custom: {
            value: done.purchase.value,
            currency: done.purchase.currency,
            orderId: done.purchase.tranId,
          },
        })
        .catch(() => undefined);
    return done.status;
  }

  // ---------- callbacks ----------

  /** The browser coming back from the gateway. Returns where to send it; what the payment actually is comes from `confirm`. */
  async callback(kind: CallbackKind, body: Record<string, string>): Promise<string> {
    const tranId = String(body.tran_id ?? '');
    if (!/^TORIO-[0-9A-F]{18}$/.test(tranId)) return this.back('failed');
    const tx = await this.prisma.client.paymentGatewayTransaction.findUnique({ where: { tranId } });
    if (!tx) return this.back('failed');
    if (kind === 'success') {
      const status = await this.confirm(tranId, body.val_id ?? null);
      return this.back(
        status === 'PAID'
          ? 'success'
          : status === 'REJECTED' || status === 'REVIEW'
            ? 'review'
            : status === 'FAILED'
              ? 'failed'
              : 'processing',
        tranId,
      );
    }
    // A failure or cancellation never touches a payment that is already confirmed, and the callback alone is not trusted for it.
    await this.prisma.client.paymentGatewayTransaction.updateMany({
      where: { id: tx.id, status: { in: ['INITIATED', 'PENDING'] }, appliedAt: null },
      data: {
        status: kind === 'cancel' ? 'CANCELLED' : 'FAILED',
        reason:
          kind === 'cancel'
            ? 'Cancelled at the payment page'
            : String(body.error ?? 'The payment did not complete').slice(0, 200),
      },
    });
    return this.back(kind === 'cancel' ? 'cancelled' : 'failed', tranId);
  }

  /** Server-to-server notification. Signature first, then the same server-side validation as every other path. */
  async ipn(body: Record<string, string>): Promise<'ok'> {
    const cfg = await this.liveConfig();
    if (!cfg) throw new ServiceUnavailableException('SSLCommerz is not enabled');
    if (!verifyIpnSignature(body, cfg.password))
      throw new BadRequestException('Invalid notification signature');
    const tranId = String(body.tran_id ?? '');
    if (!/^TORIO-[0-9A-F]{18}$/.test(tranId)) return 'ok';
    const st = String(body.status ?? '').toUpperCase();
    if (st === 'VALID' || st === 'VALIDATED') await this.confirm(tranId, body.val_id ?? null);
    else if (st === 'FAILED' || st === 'CANCELLED')
      await this.prisma.client.paymentGatewayTransaction.updateMany({
        where: { tranId, status: { in: ['INITIATED', 'PENDING'] }, appliedAt: null },
        data: {
          status: st === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          reason: String(
            body.error ?? 'The gateway reported the payment as ' + st.toLowerCase(),
          ).slice(0, 200),
        },
      });
    return 'ok';
  }

  // ---------- reading ----------

  private dto(t: Prisma.PaymentGatewayTransactionGetPayload<object>, workspaceName: string | null) {
    return {
      id: t.id,
      tranId: t.tranId,
      workspaceId: t.workspaceId,
      workspaceName,
      planKey: t.planKey,
      interval: t.interval,
      amountMinor: t.amountMinor,
      currency: t.currency,
      environment: t.environment,
      status: t.status as never,
      reason: t.reason,
      paymentMethod: t.paymentMethod,
      gatewayRef: t.bankTranId,
      createdAt: t.createdAt.toISOString(),
      paidAt: t.validatedAt?.toISOString() ?? null,
    };
  }

  async list(ws: string | null, q: { page: number; pageSize: number; status?: string }) {
    const db = this.prisma.client;
    const where = {
      gateway: 'sslcommerz',
      ...(ws ? { workspaceId: ws } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      db.paymentGatewayTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.paymentGatewayTransaction.count({ where }),
    ]);
    const names = ws
      ? new Map<string, string>()
      : new Map(
          (
            await db.workspace.findMany({
              where: { id: { in: [...new Set(rows.map((r) => r.workspaceId))] } },
              select: { id: true, name: true },
            })
          ).map((w) => [w.id, w.name]),
        );
    return {
      data: rows.map((r) => this.dto(r as never, names.get(r.workspaceId) ?? null)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  /** One transaction of a workspace; a payment still waiting is checked with the gateway first, so the return page shows the truth. */
  async status(ws: string, tranId: string) {
    const db = this.prisma.client;
    let t = await db.paymentGatewayTransaction.findFirst({ where: { tranId, workspaceId: ws } });
    if (!t) throw new NotFoundException('Payment not found');
    if (['INITIATED', 'PENDING'].includes(t.status)) {
      await this.confirm(tranId).catch(() => undefined);
      t =
        (await db.paymentGatewayTransaction.findFirst({ where: { tranId, workspaceId: ws } })) ?? t;
    }
    return this.dto(t as never, null);
  }

  /** Super Admin: ask the gateway about a transaction again (for example after a lost callback). Any workspace. */
  async reconcile(tranId: string) {
    const exists = await this.prisma.client.paymentGatewayTransaction.findUnique({
      where: { tranId },
    });
    if (!exists) throw new NotFoundException('Payment not found');
    await this.confirm(tranId);
    const t = await this.prisma.client.paymentGatewayTransaction.findUniqueOrThrow({
      where: { tranId },
    });
    return this.dto(t as never, null);
  }

  /** Ends gateway terms whose paid period has passed. Idempotent; run on a timer and before reads that depend on the plan. */
  async expireDue(): Promise<number> {
    const r = await this.prisma.client.subscription.updateMany({
      where: { source: 'GATEWAY', status: 'ACTIVE', currentPeriodEnd: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return r.count;
  }

  /**
   * Emails the people who pay when a paid term is about to end, once at seven days and once at one day (an entry in the audit log
   * per term and stage keeps it to one each). A term does not renew by itself, so this is how the owner finds out in time.
   */
  async remindDue(): Promise<number> {
    const db = this.prisma.client;
    const now = new Date();
    const subs = await db.subscription.findMany({
      where: {
        source: 'GATEWAY',
        status: 'ACTIVE',
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
      },
    });
    let sent = 0;
    for (const s of subs) {
      const end = s.currentPeriodEnd!;
      const left = end.getTime() - now.getTime();
      const stage = left <= 86_400_000 ? '1d' : '7d';
      const key = `${stage}:${end.toISOString()}`;
      const done = await db.auditLog.count({
        where: {
          workspaceId: s.workspaceId,
          action: 'billing.renewal_reminder',
          metadata: { path: ['key'], equals: key },
        },
      });
      if (done) continue;
      const [w, owners, plan] = await Promise.all([
        db.workspace.findUnique({
          where: { id: s.workspaceId },
          select: { name: true, contactEmail: true },
        }),
        db.workspaceMembership.findMany({
          where: { workspaceId: s.workspaceId, role: 'OWNER', status: 'ACTIVE' },
          select: { user: { select: { email: true } } },
        }),
        this.plans.get(s.planKey),
      ]);
      const to = [
        ...new Set(
          [w?.contactEmail, ...owners.map((o) => o.user.email)].filter((e): e is string => !!e),
        ),
      ];
      if (to.length === 0) continue;
      // Recorded before sending, so a slow or failing email can never cause a second reminder for the same stage.
      await db.auditLog.create({
        data: {
          workspaceId: s.workspaceId,
          action: 'billing.renewal_reminder',
          entityType: 'billing',
          entityId: s.workspaceId,
          metadata: {
            description: `Renewal reminder (${stage === '1d' ? 'one day' : 'seven days'}) sent`,
            key,
          },
        },
      });
      const days = Math.max(1, Math.ceil(left / 86_400_000));
      for (const addr of to)
        if (
          await this.mail
            .sendTemplate(
              'renewal_reminder',
              addr,
              {
                workspace: w?.name ?? '',
                plan: plan?.name ?? s.planKey,
                until: end.toISOString().slice(0, 10),
                days: `${days} day${days === 1 ? '' : 's'}`,
                when: `in ${days} day${days === 1 ? '' : 's'}`,
                link: `${this.config.WEB_URL.replace(/\/$/, '')}/billing/subscription?tab=plans`,
              },
              { workspaceId: s.workspaceId },
            )
            .catch(() => false)
        )
          sent++;
    }
    return sent;
  }
}
