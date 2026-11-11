import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@torio/database';
import { mapInvoiceStatus, mapProviderStatus } from '@torio/contracts';
import { billingDetailsOf, WORKSPACE_DETAIL_SELECT } from './billing-details';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PlansService, snapshotOf } from './plans.service';
import type { ProviderEvent } from './provider/billing-provider';

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const at = (sec: unknown) => (typeof sec === 'number' ? new Date(sec * 1000) : null);
const rec = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const idOf = (v: unknown) => (typeof v === 'string' ? v : str(rec(v).id));

/**
 * Applies verified provider events. Safe to receive the same event any number of times or out of order:
 * the event id is unique (idempotency), subscription/invoice writes carry the provider event time and never
 * move state backwards, and a workspace is only ever resolved through our own BillingAccount for the customer id.
 * Unknown customers, prices or event types are recorded as ignored, never guessed at.
 */
@Injectable()
export class BillingWebhookService {
  private readonly log = new Logger(BillingWebhookService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly plans: PlansService,
  ) {}

  async process(e: ProviderEvent): Promise<{ duplicate: boolean; outcome: string }> {
    const db = this.prisma.client;
    try {
      return await db.$transaction(async (tx) => {
        // Claim the event id first: a concurrent or repeated delivery fails here and does nothing.
        const claim = await tx.billingEvent.create({
          data: {
            providerEventId: e.id,
            type: e.type,
            occurredAt: new Date(e.created * 1000),
            outcome: 'processing',
          },
        });
        const { workspaceId, outcome } = await this.apply(tx, e);
        await tx.billingEvent.update({ where: { id: claim.id }, data: { workspaceId, outcome } });
        return { duplicate: false, outcome };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return { duplicate: true, outcome: 'duplicate' };
      throw err;
    }
  }

  private async workspaceByCustomer(tx: Prisma.TransactionClient, customer: string | null) {
    if (!customer) return null;
    const a = await tx.billingAccount.findUnique({ where: { providerCustomerId: customer } });
    return a?.workspaceId ?? null;
  }

  private async apply(
    tx: Prisma.TransactionClient,
    e: ProviderEvent,
  ): Promise<{ workspaceId: string | null; outcome: string }> {
    const o = e.object;
    const when = new Date(e.created * 1000);
    switch (e.type) {
      case 'checkout.session.completed': {
        const ref = str(o.client_reference_id);
        const customer = idOf(o.customer);
        if (!ref || !customer)
          return { workspaceId: null, outcome: 'ignored: no workspace reference' };
        const acct = await tx.billingAccount.findUnique({ where: { workspaceId: ref } });
        if (!acct) return { workspaceId: null, outcome: 'ignored: unknown workspace' };
        if (acct.providerCustomerId && acct.providerCustomerId !== customer)
          return { workspaceId: ref, outcome: 'ignored: customer does not match this workspace' };
        if (!acct.providerCustomerId)
          await tx.billingAccount.update({
            where: { workspaceId: ref },
            data: { providerCustomerId: customer, provider: 'stripe' },
          });
        return { workspaceId: ref, outcome: 'processed' };
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.subscription(tx, o, when, e.type === 'customer.subscription.deleted');
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.updated':
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        return this.invoice(tx, o, when, e.type);
      case 'charge.refunded':
        return this.refund(tx, o);
      case 'payment_method.attached':
        return this.pmAttached(tx, o);
      case 'payment_method.detached':
        return this.pmDetached(tx, o);
      case 'customer.updated':
        return this.customerUpdated(tx, o);
      default:
        return { workspaceId: null, outcome: `ignored: ${e.type} is not handled` };
    }
  }

  private async subscription(tx: Prisma.TransactionClient, o: Obj, when: Date, deleted: boolean) {
    const ws = await this.workspaceByCustomer(tx, idOf(o.customer));
    if (!ws) return { workspaceId: null, outcome: 'ignored: unknown customer' };
    const providerSubscriptionId = str(o.id);
    const item = arr(rec(o.items).data)[0] ?? {};
    const priceId = str(rec(item.price).id);
    const mapped = priceId
      ? await this.plans.fromPriceId(priceId, this.config.BILLING_PRICE_IDS)
      : null;
    const status = deleted ? 'CANCELED' : mapProviderStatus(str(o.status) ?? '');
    if (!providerSubscriptionId || !mapped)
      return { workspaceId: ws, outcome: 'ignored: price is not one of our plans' };
    if (!status) return { workspaceId: ws, outcome: `ignored: transient status ${str(o.status)}` };
    const cur = await tx.subscription.findUnique({ where: { workspaceId: ws } });
    if (cur) {
      if (when < cur.lastEventAt)
        return { workspaceId: ws, outcome: 'ignored: older than the stored state' };
      if (
        cur.providerSubscriptionId !== providerSubscriptionId &&
        !['CANCELED', 'EXPIRED'].includes(cur.status)
      )
        return {
          workspaceId: ws,
          outcome: 'ignored: another subscription is active for this workspace',
        };
    }
    const changedPlan =
      !cur ||
      cur.planKey !== mapped.plan.key ||
      cur.interval !== mapped.interval ||
      !cur.planSnapshot;
    const price = rec(item.price);
    const data = {
      planKey: mapped.plan.key,
      interval: mapped.interval,
      status,
      providerSubscriptionId,
      source: 'PROVIDER' as const,
      priceMinor: num(price.unit_amount) ?? (changedPlan ? null : (cur?.priceMinor ?? null)),
      currency: str(price.currency)?.toUpperCase().slice(0, 3) ?? cur?.currency ?? null,
      // Entitlements are frozen when the plan starts or changes; later edits to the plan don't touch them.
      ...(changedPlan && { planSnapshot: snapshotOf(mapped.plan) as Prisma.InputJsonValue }),
      currentPeriodStart: at(o.current_period_start) ?? at(item.current_period_start),
      currentPeriodEnd: at(o.current_period_end) ?? at(item.current_period_end),
      trialEnd: at(o.trial_end),
      cancelAtPeriodEnd: o.cancel_at_period_end === true,
      canceledAt: at(o.canceled_at),
      startedAt: at(o.start_date) ?? cur?.startedAt ?? when,
      lastEventAt: when,
    };
    await tx.subscription.upsert({
      where: { workspaceId: ws },
      create: { workspaceId: ws, ...data },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        workspaceId: ws,
        action: 'billing.subscription_updated',
        entityType: 'billing',
        entityId: ws,
        metadata: {
          description: `Subscription is now ${mapped.plan.key} (${mapped.interval.toLowerCase()}), ${status.toLowerCase().replace('_', ' ')}`,
        },
      },
    });
    return { workspaceId: ws, outcome: 'processed' };
  }

  private async invoice(tx: Prisma.TransactionClient, o: Obj, when: Date, type: string) {
    const ws = await this.workspaceByCustomer(tx, idOf(o.customer));
    if (!ws) return { workspaceId: null, outcome: 'ignored: unknown customer' };
    const providerInvoiceId = str(o.id);
    if (!providerInvoiceId) return { workspaceId: ws, outcome: 'ignored: no invoice id' };
    const cur = await tx.invoice.findUnique({ where: { providerInvoiceId } });
    if (cur && cur.workspaceId !== ws)
      return { workspaceId: ws, outcome: 'ignored: invoice belongs to another workspace' };
    if (cur && when < cur.lastEventAt)
      return { workspaceId: ws, outcome: 'ignored: older than the stored state' };
    let status = mapInvoiceStatus(
      str(o.status) ?? 'draft',
      o.attempted === true || num(o.attempt_count)! > 0,
    );
    if (type === 'invoice.payment_failed') status = 'FAILED';
    if (cur?.status === 'REFUNDED' && status === 'PAID') status = 'REFUNDED';
    const lines = arr(rec(o.lines).data);
    const firstPrice = str(rec(lines[0]?.price).id);
    const planKey =
      (firstPrice &&
        (await this.plans.fromPriceId(firstPrice, this.config.BILLING_PRICE_IDS))?.plan.key) ||
      cur?.planKey ||
      null;
    const period = rec(lines[0]?.period);
    // The billing details come from this store's General Settings, captured once when the invoice is first recorded.
    const wsRow = await tx.workspace.findUnique({
      where: { id: ws },
      select: WORKSPACE_DETAIL_SELECT,
    });
    const defaultPm = await tx.paymentMethodRef.findFirst({
      where: { workspaceId: ws, isDefault: true },
    });
    const data = {
      number: str(o.number),
      status,
      currency: (str(o.currency) ?? 'usd').toUpperCase().slice(0, 3),
      subtotalMinor: num(o.subtotal) ?? 0,
      taxMinor: num(o.tax) ?? 0,
      totalMinor: num(o.total) ?? 0,
      amountPaidMinor: num(o.amount_paid) ?? 0,
      periodStart: at(period.start) ?? at(o.period_start) ?? cur?.periodStart ?? null,
      periodEnd: at(period.end) ?? at(o.period_end) ?? cur?.periodEnd ?? null,
      planKey,
      hostedUrl: str(o.hosted_invoice_url),
      // Immutable: an invoice that already has a snapshot keeps it, whatever General Settings say now.
      customerSnapshot: (cur?.customerSnapshot ??
        (wsRow ? billingDetailsOf(wsRow) : Prisma.JsonNull)) as Prisma.InputJsonValue,
      paymentSummary:
        status === 'PAID' && defaultPm
          ? `Card ending ${defaultPm.last4}`
          : (cur?.paymentSummary ?? null),
      issuedAt: at(o.created) ?? cur?.issuedAt ?? when,
      lastEventAt: when,
    };
    const inv = await tx.invoice.upsert({
      where: { providerInvoiceId },
      create: { workspaceId: ws, providerInvoiceId, ...data },
      update: data,
    });
    if (lines.length) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: inv.id } });
      await tx.invoiceLineItem.createMany({
        data: lines.map((l, position) => ({
          invoiceId: inv.id,
          position,
          description: str(l.description) ?? 'Subscription',
          quantity: num(l.quantity) ?? 1,
          amountMinor: num(l.amount) ?? 0,
        })),
      });
    }
    return { workspaceId: ws, outcome: 'processed' };
  }

  private async refund(tx: Prisma.TransactionClient, o: Obj) {
    const ws = await this.workspaceByCustomer(tx, idOf(o.customer));
    const invoiceId = idOf(o.invoice);
    if (!ws || !invoiceId)
      return { workspaceId: ws, outcome: 'ignored: not linked to one of our invoices' };
    const full = (num(o.amount_refunded) ?? 0) >= (num(o.amount) ?? Infinity);
    const r = await tx.invoice.updateMany({
      where: { providerInvoiceId: invoiceId, workspaceId: ws },
      data: full ? { status: 'REFUNDED' } : {},
    });
    return { workspaceId: ws, outcome: r.count ? 'processed' : 'ignored: invoice not found' };
  }

  private async pmAttached(tx: Prisma.TransactionClient, o: Obj) {
    const ws = await this.workspaceByCustomer(tx, idOf(o.customer));
    const card = rec(o.card);
    const id = str(o.id);
    if (!ws || !id || str(o.type) !== 'card')
      return { workspaceId: ws, outcome: 'ignored: not a card for a known customer' };
    const exists = await tx.paymentMethodRef.count({ where: { workspaceId: ws } });
    await tx.paymentMethodRef.upsert({
      where: { providerPaymentMethodId: id },
      create: {
        workspaceId: ws,
        providerPaymentMethodId: id,
        brand: str(card.brand) ?? 'card',
        last4: (str(card.last4) ?? '0000').slice(-4),
        expMonth: num(card.exp_month) ?? 1,
        expYear: num(card.exp_year) ?? 2099,
        isDefault: exists === 0,
      },
      update: {
        brand: str(card.brand) ?? 'card',
        last4: (str(card.last4) ?? '0000').slice(-4),
        expMonth: num(card.exp_month) ?? 1,
        expYear: num(card.exp_year) ?? 2099,
      },
    });
    return { workspaceId: ws, outcome: 'processed' };
  }

  private async pmDetached(tx: Prisma.TransactionClient, o: Obj) {
    const id = str(o.id);
    if (!id) return { workspaceId: null, outcome: 'ignored: no id' };
    const row = await tx.paymentMethodRef.findUnique({ where: { providerPaymentMethodId: id } });
    if (!row) return { workspaceId: null, outcome: 'ignored: unknown payment method' };
    await tx.paymentMethodRef.delete({ where: { id: row.id } });
    return { workspaceId: row.workspaceId, outcome: 'processed' };
  }

  private async customerUpdated(tx: Prisma.TransactionClient, o: Obj) {
    const ws = await this.workspaceByCustomer(tx, str(o.id));
    const def = idOf(rec(o.invoice_settings).default_payment_method);
    if (!ws) return { workspaceId: null, outcome: 'ignored: unknown customer' };
    if (def) {
      const row = await tx.paymentMethodRef.findFirst({
        where: { workspaceId: ws, providerPaymentMethodId: def },
      });
      if (row) {
        await tx.paymentMethodRef.updateMany({
          where: { workspaceId: ws },
          data: { isDefault: false },
        });
        await tx.paymentMethodRef.update({ where: { id: row.id }, data: { isDefault: true } });
      }
    }
    return { workspaceId: ws, outcome: 'processed' };
  }
}
