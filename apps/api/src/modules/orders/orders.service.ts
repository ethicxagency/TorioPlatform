import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  computeTotals,
  editBlockReason,
  formatMoney,
  fulfillmentBlockReason,
  ORDER_STATUS_LABEL,
  outstandingMinor,
  paymentBlockReason,
  paymentStatusOf,
  statusBlockReason,
} from '@torio/contracts';
import type {
  CreateOrderInput,
  OrderBulkInput,
  OrderFilter,
  OrderQuery,
  OrderStatus,
  RecordPaymentInput,
  SetFulfillmentInput,
  UpdateOrderInput,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AutomationEngine } from '../automation/automation.engine';
import { toCsv } from '../leads/csv';

const EXPORT_LIMIT = 5000;
const FIRST_NUMBER = 1000;
const MINUTE = 60_000;

const listInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  items: { select: { name: true, quantity: true }, orderBy: { position: 'asc' } },
  conversation: { select: { id: true, channel: { select: { provider: true } } } },
} satisfies Prisma.OrderInclude;
type ListRow = Prisma.OrderGetPayload<{ include: typeof listInclude }>;

const detailInclude = {
  ...listInclude,
  items: { orderBy: { position: 'asc' } },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: { recordedBy: { select: { id: true, name: true } } },
  },
  notes: {
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } } },
  },
  events: {
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true } } },
  },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * Every query is scoped by workspaceId. Totals are computed here from the submitted lines and frozen on the order;
 * clients never send a total. There is no payment provider: payments are manual records, and no refund exists.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEngine,
  ) {}

  private listDto(o: ListRow) {
    const names = o.items.map((i) => i.name);
    const summary =
      names.length <= 2
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    return {
      id: o.id,
      number: o.number,
      customer: o.customer,
      itemCount: o.items.reduce((a, i) => a + i.quantity, 0),
      itemSummary: summary,
      currency: o.currency,
      totalMinor: o.totalMinor,
      paidMinor: o.paidMinor,
      outstandingMinor: o.status === 'CANCELLED' ? 0 : outstandingMinor(o),
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      channel: (o.conversation?.channel.provider ?? 'MANUAL') as
        'MANUAL' | 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER',
      conversationId: o.conversationId,
      isSample: o.isSample,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private buildWhere(ws: string, f: OrderFilter): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [{ workspaceId: ws }];
    if (f.q) {
      const c = { contains: f.q, mode: 'insensitive' as const };
      const num = /^#?(\d{1,9})$/.exec(f.q.trim());
      and.push({
        OR: [
          ...(num ? [{ number: Number(num[1]) }] : []),
          { customer: { name: c } },
          { customer: { email: c } },
          { customer: { phone: c } },
        ],
      });
    }
    if (f.status?.length) and.push({ status: { in: f.status } });
    if (f.paymentStatus?.length) and.push({ paymentStatus: { in: f.paymentStatus } });
    if (f.fulfillmentStatus?.length) and.push({ fulfillmentStatus: { in: f.fulfillmentStatus } });
    if (f.channel === 'MANUAL') and.push({ conversationId: null });
    else if (f.channel) and.push({ conversation: { channel: { provider: f.channel } } });
    if (f.paymentMethod) and.push({ payments: { some: { method: f.paymentMethod } } });
    if (f.customerId) and.push({ customerId: f.customerId });
    if (f.createdFrom) and.push({ createdAt: { gte: new Date(f.createdFrom) } });
    if (f.createdTo) and.push({ createdAt: { lte: new Date(f.createdTo) } });
    if (f.minTotal !== undefined) and.push({ totalMinor: { gte: f.minTotal } });
    if (f.maxTotal !== undefined) and.push({ totalMinor: { lte: f.maxTotal } });
    return { AND: and };
  }

  async list(ws: string, q: OrderQuery) {
    const where = this.buildWhere(ws, q);
    const field = q.sort === 'total' ? 'totalMinor' : 'createdAt';
    const [total, rows] = await Promise.all([
      this.prisma.client.order.count({ where }),
      this.prisma.client.order.findMany({
        where,
        include: listInclude,
        orderBy: [{ [field]: q.dir }, { id: q.dir }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => this.listDto(r)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async summary(ws: string, range: { createdFrom?: string; createdTo?: string }) {
    const db = this.prisma.client;
    const from = range.createdFrom ? new Date(range.createdFrom) : undefined;
    const to = range.createdTo ? new Date(range.createdTo) : new Date();
    const inRange = (f?: Date, t?: Date): Prisma.OrderWhereInput => ({
      workspaceId: ws,
      ...((f || t) && { createdAt: { ...(f && { gte: f }), ...(t && { lte: t }) } }),
    });
    const base = inRange(from, range.createdFrom || range.createdTo ? to : undefined);
    const live: Prisma.OrderWhereInput = { AND: [base, { status: { not: 'CANCELLED' } }] };
    const prevFrom = from ? new Date(from.getTime() - (to.getTime() - from.getTime())) : undefined;
    const [totalOrders, previous, revenue, unpaid, processing, completed, cancelled] =
      await Promise.all([
        db.order.count({ where: base }),
        from && prevFrom ? db.order.count({ where: inRange(prevFrom, from) }) : Promise.resolve(0),
        db.order.groupBy({ by: ['currency'], where: live, _sum: { paidMinor: true } }),
        db.order.groupBy({
          by: ['currency'],
          where: { AND: [live, { paymentStatus: { not: 'PAID' } }] },
          _count: { _all: true },
          _sum: { totalMinor: true, paidMinor: true },
        }),
        db.order.count({ where: { AND: [base, { status: { in: ['CONFIRMED', 'PROCESSING'] } }] } }),
        db.order.count({ where: { AND: [base, { status: 'COMPLETED' }] } }),
        db.order.count({ where: { AND: [base, { status: 'CANCELLED' }] } }),
      ]);
    return {
      totalOrders,
      hasPrevious: !!from,
      previousTotalOrders: previous,
      revenue: revenue
        .map((r) => ({ currency: r.currency, amountMinor: r._sum.paidMinor ?? 0 }))
        .filter((r) => r.amountMinor > 0),
      pendingPayments: {
        count: unpaid.reduce((a, r) => a + r._count._all, 0),
        outstanding: unpaid.map((r) => ({
          currency: r.currency,
          amountMinor: Math.max(0, (r._sum.totalMinor ?? 0) - (r._sum.paidMinor ?? 0)),
        })),
      },
      processing,
      completed,
      cancelled,
    };
  }

  async get(ws: string, id: string) {
    const o = await this.prisma.client.order.findFirst({
      where: { id, workspaceId: ws },
      include: detailInclude,
    });
    if (!o) throw new NotFoundException('Order not found');
    const convs = await this.prisma.client.conversation.findMany({
      where: { workspaceId: ws, customerId: o.customerId },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: {
        id: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        channel: { select: { provider: true } },
      },
    });
    return {
      ...this.listDto(o),
      subtotalMinor: o.subtotalMinor,
      discountMinor: o.discountMinor,
      shippingMinor: o.shippingMinor,
      taxMinor: o.taxMinor,
      items: o.items.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        lineTotalMinor: i.lineTotalMinor,
      })),
      payments: o.payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
        method: p.method,
        reference: p.reference,
        note: p.note,
        paidAt: p.paidAt.toISOString(),
        recordedBy: p.recordedBy,
      })),
      notes: o.notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      events: o.events.map((e) => ({
        id: e.id,
        type: e.type,
        description: e.description,
        actor: e.actor,
        createdAt: e.createdAt.toISOString(),
      })),
      shippingAddress: o.shippingAddress,
      shippingMethod: o.shippingMethod,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      shippedAt: iso(o.shippedAt),
      cancelledAt: iso(o.cancelledAt),
      completedAt: iso(o.completedAt),
      createdBy: o.createdBy,
      conversation: o.conversation
        ? { id: o.conversation.id, provider: o.conversation.channel.provider }
        : null,
      customerConversations: convs.map((c) => ({
        id: c.id,
        provider: c.channel.provider,
        lastMessageAt: c.lastMessageAt.toISOString(),
        preview: c.lastMessagePreview,
      })),
    };
  }

  private async mustFind(ws: string, id: string) {
    const o = await this.prisma.client.order.findFirst({ where: { id, workspaceId: ws } });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  private event(
    tx: Prisma.TransactionClient,
    ws: string,
    orderId: string,
    actorId: string | null,
    type: string,
    description: string,
  ) {
    return tx.orderEvent.create({
      data: { workspaceId: ws, orderId, actorId, type, description },
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    ws: string,
    actorId: string,
    action: string,
    orderId: string,
    description: string,
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action,
        entityType: 'order',
        entityId: orderId,
        metadata: { description },
      },
    });
  }

  async create(ws: string, actorId: string, input: CreateOrderInput) {
    const db = this.prisma.client;
    const existing = await db.order.findUnique({
      where: { workspaceId_requestId: { workspaceId: ws, requestId: input.requestId } },
      select: { id: true },
    });
    if (existing) return this.get(ws, existing.id);

    const customer = await db.customer.findFirst({
      where: { id: input.customerId, workspaceId: ws },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('Customer not found in this workspace');
    if (input.conversationId) {
      const conv = await db.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: ws, customerId: input.customerId },
        select: { id: true },
      });
      if (!conv)
        throw new BadRequestException('That conversation doesn’t belong to the selected customer');
    }
    const calc = computeTotals(
      input.items,
      input.discountMinor,
      input.shippingMinor,
      input.taxMinor,
    );
    if (!calc.ok) throw new BadRequestException(calc.error);
    const { totals } = calc;

    try {
      const id = await db.$transaction(async (tx) => {
        const w = await tx.workspace.update({
          where: { id: ws },
          data: { orderSeq: { increment: 1 } },
          select: { orderSeq: true },
        });
        const number = FIRST_NUMBER + w.orderSeq;
        const order = await tx.order.create({
          data: {
            workspaceId: ws,
            number,
            customerId: input.customerId,
            conversationId: input.conversationId ?? null,
            currency: input.currency,
            subtotalMinor: totals.subtotalMinor,
            discountMinor: input.discountMinor,
            shippingMinor: input.shippingMinor,
            taxMinor: input.taxMinor,
            totalMinor: totals.totalMinor,
            shippingAddress: input.shippingAddress ?? null,
            shippingMethod: input.shippingMethod ?? null,
            requestId: input.requestId,
            createdById: actorId,
            items: {
              create: input.items.map((it, position) => ({
                workspaceId: ws,
                position,
                name: it.name,
                sku: it.sku ?? null,
                quantity: it.quantity,
                unitPriceMinor: it.unitPriceMinor,
                lineTotalMinor: totals.lineTotals[position]!,
              })),
            },
          },
        });
        await this.event(
          tx,
          ws,
          order.id,
          actorId,
          'created',
          `Order created · ${formatMoney(totals.totalMinor, input.currency)}`,
        );
        if (input.note) {
          await tx.orderNote.create({
            data: { workspaceId: ws, orderId: order.id, authorId: actorId, body: input.note },
          });
          await this.event(tx, ws, order.id, actorId, 'note', 'Internal note added');
        }
        await this.audit(tx, ws, actorId, 'order.create', order.id, `Order #${number} created`);
        return order.id;
      });
      await this.automation.emitEvent('order.created', ws, 'order', id, 'created');
      return await this.get(ws, id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await db.order.findUnique({
          where: { workspaceId_requestId: { workspaceId: ws, requestId: input.requestId } },
          select: { id: true },
        });
        if (again) return this.get(ws, again.id);
      }
      throw e;
    }
  }

  async update(ws: string, actorId: string, id: string, input: UpdateOrderInput) {
    const cur = await this.prisma.client.order.findFirst({
      where: { id, workspaceId: ws },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!cur) throw new NotFoundException('Order not found');
    if (cur.status === 'CANCELLED' || cur.status === 'COMPLETED')
      throw new ConflictException(
        `A ${ORDER_STATUS_LABEL[cur.status].toLowerCase()} order can’t be edited`,
      );
    const pricing =
      input.items !== undefined ||
      input.discountMinor !== undefined ||
      input.shippingMinor !== undefined ||
      input.taxMinor !== undefined;
    let totals: { subtotal: number; total: number; lines: number[] } | undefined;
    const items = input.items ?? cur.items;
    const discount = input.discountMinor ?? cur.discountMinor;
    const shipping = input.shippingMinor ?? cur.shippingMinor;
    const tax = input.taxMinor ?? cur.taxMinor;
    if (pricing) {
      const reason = editBlockReason(cur);
      if (reason) throw new ConflictException(reason);
      const calc = computeTotals(items, discount, shipping, tax);
      if (!calc.ok) throw new BadRequestException(calc.error);
      totals = {
        subtotal: calc.totals.subtotalMinor,
        total: calc.totals.totalMinor,
        lines: calc.totals.lineTotals,
      };
    }
    await this.prisma.client.$transaction(async (tx) => {
      const guard = await tx.order.updateMany({
        where: { id, workspaceId: ws, status: cur.status, paidMinor: cur.paidMinor },
        data: {
          ...(totals && {
            subtotalMinor: totals.subtotal,
            totalMinor: totals.total,
            discountMinor: discount,
            shippingMinor: shipping,
            taxMinor: tax,
          }),
          ...(input.shippingAddress !== undefined && {
            shippingAddress: input.shippingAddress || null,
          }),
          ...(input.shippingMethod !== undefined && {
            shippingMethod: input.shippingMethod || null,
          }),
        },
      });
      if (guard.count === 0)
        throw new ConflictException(
          'The order changed while you were editing. Reload and try again.',
        );
      if (totals && input.items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: input.items.map((it, position) => ({
            orderId: id,
            workspaceId: ws,
            position,
            name: it.name,
            sku: it.sku ?? null,
            quantity: it.quantity,
            unitPriceMinor: it.unitPriceMinor,
            lineTotalMinor: totals!.lines[position]!,
          })),
        });
      }
      if (pricing)
        await this.event(
          tx,
          ws,
          id,
          actorId,
          'updated',
          `Items and pricing updated · total ${formatMoney(totals!.total, cur.currency)}`,
        );
      if (input.shippingAddress !== undefined || input.shippingMethod !== undefined)
        await this.event(tx, ws, id, actorId, 'updated', 'Shipping details updated');
      await this.audit(tx, ws, actorId, 'order.update', id, `Order #${cur.number} updated`);
    });
    return this.get(ws, id);
  }

  /** Validates the transition against the shared rules, then applies it with an optimistic guard on the old status. */
  private async applyStatus(
    ws: string,
    actorId: string,
    cur: Prisma.OrderGetPayload<object>,
    target: OrderStatus,
  ) {
    const reason = statusBlockReason(cur, target);
    if (reason) throw new ConflictException(reason);
    await this.prisma.client.$transaction(async (tx) => {
      const guard = await tx.order.updateMany({
        where: { id: cur.id, workspaceId: ws, status: cur.status },
        data: {
          status: target,
          ...(target === 'CANCELLED' && { cancelledAt: new Date() }),
          ...(target === 'COMPLETED' && { completedAt: new Date() }),
        },
      });
      if (guard.count === 0)
        throw new ConflictException('The order changed meanwhile. Reload and try again.');
      const note =
        target === 'CANCELLED' && cur.paidMinor > 0
          ? ` · ${formatMoney(cur.paidMinor, cur.currency)} was recorded as paid. Torio doesn’t process refunds; handle it outside Torio.`
          : '';
      await this.event(
        tx,
        ws,
        cur.id,
        actorId,
        'status',
        `Status changed from ${ORDER_STATUS_LABEL[cur.status]} to ${ORDER_STATUS_LABEL[target]}${note}`,
      );
      await this.audit(
        tx,
        ws,
        actorId,
        target === 'CANCELLED' ? 'order.cancel' : 'order.status',
        cur.id,
        `Order #${cur.number} ${ORDER_STATUS_LABEL[cur.status]} → ${ORDER_STATUS_LABEL[target]}`,
      );
    });
    await this.automation.emitEvent('order.status_changed', ws, 'order', cur.id, target);
  }

  async setStatus(ws: string, actorId: string, id: string, target: OrderStatus) {
    await this.applyStatus(ws, actorId, await this.mustFind(ws, id), target);
    return this.get(ws, id);
  }

  async bulk(ws: string, actorId: string, input: OrderBulkInput) {
    const ids = [...new Set(input.ids)];
    const rows = await this.prisma.client.order.findMany({
      where: { workspaceId: ws, id: { in: ids } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const failed: { id: string; number: number; reason: string }[] = [];
    let updated = 0;
    for (const id of ids) {
      const o = byId.get(id);
      if (!o) {
        failed.push({ id, number: 0, reason: 'Order not found' });
        continue;
      }
      try {
        await this.applyStatus(ws, actorId, o, input.status);
        updated++;
      } catch (e) {
        failed.push({
          id,
          number: o.number,
          reason: e instanceof Error ? e.message : 'Could not update',
        });
      }
    }
    return { updated, failed };
  }

  async recordPayment(ws: string, actorId: string, id: string, input: RecordPaymentInput) {
    const db = this.prisma.client;
    const dup = await db.orderPayment.findUnique({
      where: { workspaceId_requestId: { workspaceId: ws, requestId: input.requestId } },
      select: { orderId: true },
    });
    if (dup) {
      if (dup.orderId !== id) throw new ConflictException('This request key was already used');
      return this.get(ws, id);
    }
    const cur = await this.mustFind(ws, id);
    const blocked = paymentBlockReason(cur);
    if (blocked) throw new ConflictException(blocked);
    const outstanding = outstandingMinor(cur);
    if (input.amountMinor > outstanding)
      throw new BadRequestException(
        `The amount can’t be more than the outstanding balance (${formatMoney(outstanding, cur.currency)})`,
      );
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    if (paidAt.getTime() > Date.now() + 5 * MINUTE)
      throw new BadRequestException('The payment date can’t be in the future');
    const paid = cur.paidMinor + input.amountMinor;
    try {
      await db.$transaction(async (tx) => {
        const guard = await tx.order.updateMany({
          where: { id, workspaceId: ws, paidMinor: cur.paidMinor, status: { not: 'CANCELLED' } },
          data: { paidMinor: paid, paymentStatus: paymentStatusOf(cur.totalMinor, paid) },
        });
        if (guard.count === 0)
          throw new ConflictException('The order changed meanwhile. Reload and try again.');
        await tx.orderPayment.create({
          data: {
            workspaceId: ws,
            orderId: id,
            amountMinor: input.amountMinor,
            method: input.method,
            reference: input.reference ?? null,
            note: input.note ?? null,
            paidAt,
            recordedById: actorId,
            requestId: input.requestId,
          },
        });
        const label = formatMoney(input.amountMinor, cur.currency);
        await this.event(tx, ws, id, actorId, 'payment', `Payment of ${label} recorded manually`);
        await this.audit(
          tx,
          ws,
          actorId,
          'order.payment',
          id,
          `Recorded ${label} (${input.method.toLowerCase().replace('_', ' ')}) on order #${cur.number}`,
        );
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return this.get(ws, id);
      throw e;
    }
    await this.automation.emitEvent('order.payment_recorded', ws, 'order', id, input.requestId);
    return this.get(ws, id);
  }

  async setFulfillment(ws: string, actorId: string, id: string, input: SetFulfillmentInput) {
    const cur = await this.mustFind(ws, id);
    const reason = fulfillmentBlockReason(cur, input.status);
    if (reason) throw new ConflictException(reason);
    await this.prisma.client.$transaction(async (tx) => {
      const guard = await tx.order.updateMany({
        where: {
          id,
          workspaceId: ws,
          fulfillmentStatus: cur.fulfillmentStatus,
          status: cur.status,
        },
        data: {
          fulfillmentStatus: input.status,
          ...(input.shippingMethod && { shippingMethod: input.shippingMethod }),
          ...(input.carrier && { carrier: input.carrier }),
          ...(input.trackingNumber && { trackingNumber: input.trackingNumber }),
          ...(input.trackingUrl && { trackingUrl: input.trackingUrl }),
          ...(input.status === 'FULFILLED' && { shippedAt: new Date() }),
        },
      });
      if (guard.count === 0)
        throw new ConflictException('The order changed meanwhile. Reload and try again.');
      await this.event(
        tx,
        ws,
        id,
        actorId,
        'fulfillment',
        input.status === 'FULFILLED' ? 'Marked as fulfilled' : 'Fulfillment started',
      );
      await this.audit(
        tx,
        ws,
        actorId,
        'order.fulfillment',
        id,
        `Order #${cur.number} fulfillment: ${input.status.toLowerCase()}`,
      );
    });
    return this.get(ws, id);
  }

  async addNote(ws: string, actorId: string, id: string, body: string) {
    await this.mustFind(ws, id);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.orderNote.create({
        data: { workspaceId: ws, orderId: id, authorId: actorId, body },
      });
      await this.event(tx, ws, id, actorId, 'note', 'Internal note added');
    });
    return this.get(ws, id);
  }

  async updateNote(ws: string, userId: string, id: string, noteId: string, body: string) {
    const n = await this.prisma.client.orderNote.findFirst({
      where: { id: noteId, orderId: id, workspaceId: ws },
    });
    if (!n) throw new NotFoundException('Note not found');
    if (n.authorId !== userId) throw new ForbiddenException('You can only edit your own notes');
    await this.prisma.client.orderNote.update({ where: { id: noteId }, data: { body } });
    return this.get(ws, id);
  }

  async removeNote(ws: string, userId: string, id: string, noteId: string, canModerate: boolean) {
    const n = await this.prisma.client.orderNote.findFirst({
      where: { id: noteId, orderId: id, workspaceId: ws },
    });
    if (!n) throw new NotFoundException('Note not found');
    if (n.authorId !== userId && !canModerate)
      throw new ForbiddenException('You can only delete your own notes');
    await this.prisma.client.orderNote.delete({ where: { id: noteId } });
    return this.get(ws, id);
  }

  async exportCsv(ws: string, f: OrderFilter, ids?: string) {
    const idList = ids
      ?.split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, EXPORT_LIMIT);
    const where = this.buildWhere(ws, f);
    const rows = await this.prisma.client.order.findMany({
      where: idList?.length ? { AND: [where, { id: { in: idList } }] } : where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
      include: listInclude,
    });
    const major = (n: number) => (n / 100).toFixed(2);
    return toCsv(
      [
        'Order',
        'Created',
        'Customer',
        'Email',
        'Phone',
        'Items',
        'Currency',
        'Subtotal',
        'Discount',
        'Shipping',
        'Tax',
        'Total',
        'Paid',
        'Outstanding',
        'Status',
        'Payment',
        'Fulfillment',
        'Channel',
      ],
      rows.map((o) => {
        const d = this.listDto(o);
        return [
          `#${o.number}`,
          o.createdAt.toISOString(),
          o.customer.name,
          o.customer.email,
          o.customer.phone,
          d.itemSummary,
          o.currency,
          major(o.subtotalMinor),
          major(o.discountMinor),
          major(o.shippingMinor),
          major(o.taxMinor),
          major(o.totalMinor),
          major(o.paidMinor),
          major(d.outstandingMinor),
          o.status,
          o.paymentStatus,
          o.fulfillmentStatus,
          d.channel,
        ];
      }),
    );
  }
}
