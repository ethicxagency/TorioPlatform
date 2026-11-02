import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  comparisonRange,
  formatMoney,
  granularityFor,
  listBuckets,
  parseIso,
  daysBetween,
  percentChange,
  rangeBounds,
  todayIn,
  type AnalyticsQuery,
  type DateRange,
  type Granularity,
} from '@torio/contracts';
import { roleHasPermission, type WorkspaceRole } from '@torio/types';
import { PrismaService } from '../../database/prisma.service';
import { PlansService } from '../billing/plans.service';

const toIsoToday = (tz: string) => {
  const t = todayIn(tz);
  return `${String(t.y).padStart(4, '0')}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
};

type Money = { currency: string; amountMinor: number };
type Channel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER';

/** A conversation waiting longer than this is called out as overdue. */
const WAITING_LONG_MIN = 120;
/** "High-priority" lead: an open deal scored at least this high (lead-score.ts) with no activity for LEAD_IDLE_HOURS. */
const HOT_LEAD_SCORE = 70;
const LEAD_IDLE_HOURS = 24;

/** Orders (alias `o`) attributed to a channel through the conversation they were created from. */
const orderChannelSql = (ch?: Channel) =>
  ch
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM conversations c JOIN channels h ON h.id = c."channelId" WHERE c.id = o."conversationId" AND h.provider::text = ${ch})`
    : Prisma.empty;
interface Totals {
  revenue: Money[];
  orders: number;
  cancelled: number;
  newCustomers: number;
  customers: number;
}

/**
 * Dashboard analytics. One date contract for every widget: inclusive calendar dates in the workspace's reporting
 * time zone, converted here to half-open UTC bounds. Every query is scoped by workspaceId and runs against the real
 * tables; nothing is estimated or cached across workspaces.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  private async totals(ws: string, r: DateRange, tz: string, ch?: Channel): Promise<Totals> {
    const db = this.prisma.client;
    const { start, endExclusive } = rangeBounds(r, tz);
    const orderCh = ch ? { conversation: { channel: { provider: ch } } } : {};
    const custCh = ch ? { source: ch } : {};
    const [revenue, orders, cancelled, newCustomers, customers] = await Promise.all([
      db.$queryRaw<{ currency: string; total: bigint }[]>`
        SELECT o.currency, SUM(p."amountMinor")::bigint AS total
        FROM order_payments p JOIN orders o ON o.id = p."orderId"
        WHERE p."workspaceId" = ${ws}::uuid AND p."paidAt" >= ${start} AND p."paidAt" < ${endExclusive}
          AND o.status <> 'CANCELLED' ${orderChannelSql(ch)}
        GROUP BY o.currency ORDER BY 2 DESC`,
      db.order.count({
        where: { workspaceId: ws, createdAt: { gte: start, lt: endExclusive }, ...orderCh },
      }),
      db.order.count({
        where: {
          workspaceId: ws,
          status: 'CANCELLED',
          createdAt: { gte: start, lt: endExclusive },
          ...orderCh,
        },
      }),
      db.customer.count({
        where: { workspaceId: ws, createdAt: { gte: start, lt: endExclusive }, ...custCh },
      }),
      db.customer.count({ where: { workspaceId: ws, createdAt: { lt: endExclusive }, ...custCh } }),
    ]);
    return {
      revenue: revenue.map((x) => ({ currency: x.currency, amountMinor: Number(x.total) })),
      orders,
      cancelled,
      newCustomers,
      customers,
    };
  }

  /** Per-bucket counts, bucketed by local calendar day/week/month in the reporting zone. */
  private async bucketed(
    table: 'orders' | 'customers' | 'leads',
    ws: string,
    r: DateRange,
    tz: string,
    g: Granularity,
    ch?: Channel,
  ) {
    const { start, endExclusive } = rangeBounds(r, tz);
    const t = Prisma.raw(`"${table}" o`);
    const chSql =
      table === 'orders'
        ? orderChannelSql(ch)
        : ch
          ? Prisma.sql`AND o.source::text = ${ch}`
          : Prisma.empty;
    const rows = await this.prisma.client.$queryRaw<{ b: string; n: number }[]>`
      SELECT to_char(date_trunc(${g}, (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS b, COUNT(*)::int AS n
      FROM ${t} WHERE o."workspaceId" = ${ws}::uuid AND o."createdAt" >= ${start} AND o."createdAt" < ${endExclusive} ${chSql}
      GROUP BY 1`;
    return new Map(rows.map((x) => [x.b, x.n]));
  }

  /**
   * Conversation activity per bucket. `active` counts distinct conversations with a customer or agent message in the
   * bucket; `new` uses the conversation's start; `resolved` its resolution time.
   */
  private async conversationBuckets(
    ws: string,
    r: DateRange,
    tz: string,
    g: Granularity,
    ch?: Channel,
  ) {
    const { start, endExclusive } = rangeBounds(r, tz);
    const db = this.prisma.client;
    const chSql = ch ? Prisma.sql`AND h.provider::text = ${ch}` : Prisma.empty;
    const bucket = (col: Prisma.Sql) =>
      Prisma.sql`to_char(date_trunc(${g}, (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
    const [active, created, resolved, totals] = await Promise.all([
      db.$queryRaw<{ b: string; n: number }[]>`
        SELECT ${bucket(Prisma.sql`m."createdAt"`)} AS b, COUNT(DISTINCT m."conversationId")::int AS n
        FROM messages m JOIN conversations c ON c.id = m."conversationId" JOIN channels h ON h.id = c."channelId"
        WHERE m."workspaceId" = ${ws}::uuid AND m.kind IN ('INBOUND', 'OUTBOUND')
          AND m."createdAt" >= ${start} AND m."createdAt" < ${endExclusive} ${chSql}
        GROUP BY 1`,
      db.$queryRaw<{ b: string; n: number }[]>`
        SELECT ${bucket(Prisma.sql`c."createdAt"`)} AS b, COUNT(*)::int AS n
        FROM conversations c JOIN channels h ON h.id = c."channelId"
        WHERE c."workspaceId" = ${ws}::uuid AND c."createdAt" >= ${start} AND c."createdAt" < ${endExclusive} ${chSql}
        GROUP BY 1`,
      db.$queryRaw<{ b: string; n: number }[]>`
        SELECT ${bucket(Prisma.sql`c."resolvedAt"`)} AS b, COUNT(*)::int AS n
        FROM conversations c JOIN channels h ON h.id = c."channelId"
        WHERE c."workspaceId" = ${ws}::uuid AND c.status = 'RESOLVED'
          AND c."resolvedAt" >= ${start} AND c."resolvedAt" < ${endExclusive} ${chSql}
        GROUP BY 1`,
      // Range totals are counted once (a conversation active on two days is one conversation, not two).
      db.$queryRaw<{ active: number }[]>`
        SELECT COUNT(DISTINCT m."conversationId")::int AS active
        FROM messages m JOIN conversations c ON c.id = m."conversationId" JOIN channels h ON h.id = c."channelId"
        WHERE m."workspaceId" = ${ws}::uuid AND m.kind IN ('INBOUND', 'OUTBOUND')
          AND m."createdAt" >= ${start} AND m."createdAt" < ${endExclusive} ${chSql}`,
    ]);
    const map = (rows: { b: string; n: number }[]) => new Map(rows.map((x) => [x.b, x.n]));
    return {
      active: map(active),
      created: map(created),
      resolved: map(resolved),
      total: totals[0]?.active ?? 0,
    };
  }

  /** Every metric split by channel (unfiltered), keyed by provider plus `unattributed`. */
  private async byChannel(ws: string, r: DateRange, tz: string, currency: string) {
    const { start, endExclusive } = rangeBounds(r, tz);
    const db = this.prisma.client;
    type Row = { k: string | null; n: number | bigint };
    const toMap = (rows: Row[]) => {
      const out: Record<string, number> = {};
      for (const x of rows)
        out[x.k ?? 'unattributed'] = (out[x.k ?? 'unattributed'] ?? 0) + Number(x.n);
      return out;
    };
    const channelOf = Prisma.sql`(SELECT h.provider::text FROM conversations c JOIN channels h ON h.id = c."channelId" WHERE c.id = o."conversationId")`;
    const source = (t: 'leads' | 'customers') =>
      db.$queryRaw<Row[]>`
        SELECT CASE WHEN o.source::text IN ('WHATSAPP', 'INSTAGRAM', 'MESSENGER') THEN o.source::text END AS k, COUNT(*)::int AS n
        FROM ${Prisma.raw(`"${t}" o`)}
        WHERE o."workspaceId" = ${ws}::uuid AND o."createdAt" >= ${start} AND o."createdAt" < ${endExclusive}
        GROUP BY 1`;
    const [revenue, orders, conversations, leads, newCustomers] = await Promise.all([
      currency
        ? db.$queryRaw<Row[]>`
            SELECT ${channelOf} AS k, SUM(p."amountMinor")::bigint AS n
            FROM order_payments p JOIN orders o ON o.id = p."orderId"
            WHERE p."workspaceId" = ${ws}::uuid AND p."paidAt" >= ${start} AND p."paidAt" < ${endExclusive}
              AND o.status <> 'CANCELLED' AND o.currency = ${currency}
            GROUP BY 1`
        : Promise.resolve([] as Row[]),
      db.$queryRaw<Row[]>`
        SELECT ${channelOf} AS k, COUNT(*)::int AS n FROM orders o
        WHERE o."workspaceId" = ${ws}::uuid AND o."createdAt" >= ${start} AND o."createdAt" < ${endExclusive}
        GROUP BY 1`,
      db.$queryRaw<Row[]>`
        SELECT h.provider::text AS k, COUNT(*)::int AS n
        FROM conversations c JOIN channels h ON h.id = c."channelId"
        WHERE c."workspaceId" = ${ws}::uuid AND c."createdAt" >= ${start} AND c."createdAt" < ${endExclusive}
        GROUP BY 1`,
      source('leads'),
      source('customers'),
    ]);
    return {
      revenue: toMap(revenue),
      orders: toMap(orders),
      conversations: toMap(conversations),
      leads: toMap(leads),
      newCustomers: toMap(newCustomers),
    };
  }

  /** Current work that needs a person. Not range-filtered: these describe the inbox and pipeline right now. */
  private async attention(ws: string, ch?: Channel, now = new Date()) {
    const db = this.prisma.client;
    const convCh = ch ? { channel: { provider: ch } } : {};
    const waitingWhere = {
      workspaceId: ws,
      status: 'OPEN' as const,
      waitingSince: { not: null },
      ...convCh,
    };
    const long = new Date(now.getTime() - WAITING_LONG_MIN * 60_000);
    const idle = new Date(now.getTime() - LEAD_IDLE_HOURS * 3_600_000);
    const [waiting, waitingRows, longCount, oldest, staleLeads, pendingOrders] = await Promise.all([
      db.conversation.count({ where: waitingWhere }),
      db.conversation.findMany({ where: waitingWhere, select: { waitingSince: true } }),
      db.conversation.count({ where: { ...waitingWhere, waitingSince: { lt: long } } }),
      db.conversation.findFirst({
        where: { ...waitingWhere, waitingSince: { lt: long } },
        orderBy: { waitingSince: 'asc' },
        select: {
          id: true,
          waitingSince: true,
          customer: { select: { name: true } },
          channel: { select: { provider: true } },
        },
      }),
      db.lead.count({
        where: {
          workspaceId: ws,
          stage: { in: ['CONTACTED', 'QUALIFIED', 'PROPOSAL'] },
          score: { gte: HOT_LEAD_SCORE },
          lastActivityAt: { lt: idle },
          ...(ch && { source: ch }),
        },
      }),
      db.order.count({
        where: {
          workspaceId: ws,
          status: 'PENDING',
          ...(ch && { conversation: { channel: { provider: ch } } }),
        },
      }),
    ]);
    const avg = waitingRows.length
      ? Math.round(
          waitingRows.reduce((a, r) => a + (now.getTime() - r.waitingSince!.getTime()), 0) /
            waitingRows.length /
            60_000,
        )
      : null;
    return {
      waitingLong: {
        count: longCount,
        thresholdMinutes: WAITING_LONG_MIN,
        oldest: oldest
          ? {
              conversationId: oldest.id,
              customerName: oldest.customer.name,
              provider: oldest.channel.provider,
              waitingSince: oldest.waitingSince!.toISOString(),
            }
          : null,
      },
      waiting: { count: waiting, averageWaitMinutes: avg },
      staleLeads: { count: staleLeads, idleHours: LEAD_IDLE_HOURS },
      pendingOrders: { count: pendingOrders },
    };
  }
  private async revenueBuckets(
    ws: string,
    r: DateRange,
    tz: string,
    g: Granularity,
    currency: string,
    ch?: Channel,
  ) {
    const { start, endExclusive } = rangeBounds(r, tz);
    const rows = await this.prisma.client.$queryRaw<{ b: string; total: bigint }[]>`
      SELECT to_char(date_trunc(${g}, (p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS b,
             SUM(p."amountMinor")::bigint AS total
      FROM order_payments p JOIN orders o ON o.id = p."orderId"
      WHERE p."workspaceId" = ${ws}::uuid AND p."paidAt" >= ${start} AND p."paidAt" < ${endExclusive}
        AND o.status <> 'CANCELLED' AND o.currency = ${currency} ${orderChannelSql(ch)}
      GROUP BY 1`;
    return new Map(rows.map((x) => [x.b, Number(x.total)]));
  }

  async analytics(ws: string, role: WorkspaceRole, q: AnalyticsQuery) {
    const db = this.prisma.client;
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: ws },
      select: { createdAt: true, reportingTimeZone: true },
    });
    const tz = workspace.reportingTimeZone;
    const range: DateRange = { from: q.from, to: q.to };
    // "Today" is the workspace's reporting day, so the same request is valid or not for everyone alike.
    if (q.to > toIsoToday(tz))
      throw new BadRequestException('The end date can’t be in the future.');
    const days = daysBetween(parseIso(q.from)!, parseIso(q.to)!);
    const g = q.granularity ?? granularityFor(days);
    const cmpRange = comparisonRange(range, q.compare);
    const { start, endExclusive } = rangeBounds(range, tz);
    const ch = q.channel;

    const [cur, prev, subscription, firstOrder, firstCustomer] = await Promise.all([
      this.totals(ws, range, tz, ch),
      cmpRange ? this.totals(ws, cmpRange, tz, ch) : Promise.resolve(null),
      roleHasPermission(role, 'billing:read')
        ? db.subscription.findUnique({ where: { workspaceId: ws } })
        : Promise.resolve(undefined),
      db.order.findFirst({
        where: { workspaceId: ws },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      db.customer.findFirst({
        where: { workspaceId: ws },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const primary = cur.revenue[0]?.currency ?? '';
    const buckets = listBuckets(range, g);
    const convCh = ch ? { channel: { provider: ch } } : {};
    const [orderMap, customerMap, revenueMap, baseCustomers, leadMap, conv, attention, msgState] =
      await Promise.all([
        this.bucketed('orders', ws, range, tz, g, ch),
        this.bucketed('customers', ws, range, tz, g, ch),
        primary
          ? this.revenueBuckets(ws, range, tz, g, primary, ch)
          : Promise.resolve(new Map<string, number>()),
        db.customer.count({
          where: { workspaceId: ws, createdAt: { lt: start }, ...(ch && { source: ch }) },
        }),
        this.bucketed('leads', ws, range, tz, g, ch),
        this.conversationBuckets(ws, range, tz, g, ch),
        this.attention(ws, ch),
        Promise.all([
          db.conversation.count({
            where: { workspaceId: ws, createdAt: { gte: start, lt: endExclusive }, ...convCh },
          }),
          db.conversation.count({
            where: {
              workspaceId: ws,
              status: 'RESOLVED',
              resolvedAt: { gte: start, lt: endExclusive },
              ...convCh,
            },
          }),
          db.conversation.count({
            where: {
              workspaceId: ws,
              status: { not: 'RESOLVED' },
              unreadCount: { gt: 0 },
              ...convCh,
            },
          }),
          db.lead.count({
            where: {
              workspaceId: ws,
              createdAt: { gte: start, lt: endExclusive },
              ...(ch && { source: ch }),
            },
          }),
        ]),
      ]);
    const [newConvs, resolvedConvs, unread, leadsTotal] = msgState;
    // The split uses the unfiltered primary currency so a channel filter can't change which currency is shown.
    const unfilteredPrimary = ch
      ? ((await this.totals(ws, range, tz)).revenue[0]?.currency ?? '')
      : primary;
    const byChannel = await this.byChannel(ws, range, tz, unfilteredPrimary);
    let running = baseCustomers;
    const newCustomers = buckets.map((b) => customerMap.get(b) ?? 0);
    const totalCustomers = newCustomers.map((n) => (running += n));

    const dataSince =
      [workspace.createdAt, firstOrder?.createdAt, firstCustomer?.createdAt]
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    let comparison: ReturnType<DashboardService['compare']> | null = null;
    if (cmpRange && prev && dataSince)
      comparison = this.compare(
        q.compare as 'previous_period' | 'previous_year',
        cmpRange,
        tz,
        cur,
        prev,
        primary,
        dataSince,
      );

    return {
      range,
      timeZone: tz,
      granularity: g,
      revenue: { byCurrency: cur.revenue, primaryCurrency: primary },
      orders: { total: cur.orders, cancelled: cur.cancelled },
      customers: { total: cur.customers, new: cur.newCustomers },
      subscription: await this.subscriptionView(subscription),
      messaging: {
        total: conv.total,
        new: newConvs,
        resolved: resolvedConvs,
        waiting: attention.waiting.count,
        unread,
      },
      leads: { total: leadsTotal },
      byChannel,
      attention,
      series: {
        buckets,
        conversations: buckets.map((b) => conv.active.get(b) ?? 0),
        newConversations: buckets.map((b) => conv.created.get(b) ?? 0),
        resolvedConversations: buckets.map((b) => conv.resolved.get(b) ?? 0),
        leads: buckets.map((b) => leadMap.get(b) ?? 0),
        revenue: buckets.map((b) => revenueMap.get(b) ?? 0),
        orders: buckets.map((b) => orderMap.get(b) ?? 0),
        newCustomers,
        totalCustomers,
      },
      comparison,
      activity: await this.activity(ws, start, endExclusive),
      dataSince: dataSince?.toISOString() ?? null,
    };
  }

  private compare(
    mode: 'previous_period' | 'previous_year',
    range: DateRange,
    tz: string,
    cur: Totals,
    prev: Totals,
    primary: string,
    dataSince: Date,
  ) {
    const { start, endExclusive } = rangeBounds(range, tz);
    const coverage =
      endExclusive <= dataSince
        ? ('none' as const)
        : start < dataSince
          ? ('partial' as const)
          : ('full' as const);
    const rev = (t: Totals) => t.revenue.find((m) => m.currency === primary)?.amountMinor ?? 0;
    // With no data at all in the comparison window there is nothing meaningful to compare against.
    const pct = (a: number, b: number) => (coverage === 'none' ? null : percentChange(a, b));
    return {
      mode,
      range,
      coverage,
      previous: {
        revenue: prev.revenue,
        orders: prev.orders,
        newCustomers: prev.newCustomers,
        customers: prev.customers,
      },
      changes: {
        revenue: pct(rev(cur), rev(prev)),
        orders: pct(cur.orders, prev.orders),
        newCustomers: pct(cur.newCustomers, prev.newCustomers),
        customers: pct(cur.customers, prev.customers),
      },
    };
  }

  private async subscriptionView(
    sub: Awaited<ReturnType<PrismaService['client']['subscription']['findUnique']>> | undefined,
  ) {
    if (sub === undefined) return null;
    const free = await this.plans.free();
    if (!sub)
      return {
        onFreePlan: true,
        planKey: free.key,
        planName: free.name,
        status: 'NONE',
        cancelAtPeriodEnd: false,
      };
    const plan = await this.plans.get(sub.planKey);
    return {
      onFreePlan: false,
      planKey: sub.planKey,
      planName: plan?.name ?? sub.planKey,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  /** The most recent real events inside the selected range. */
  private async activity(ws: string, start: Date, end: Date) {
    const db = this.prisma.client;
    const within = { gte: start, lt: end };
    const [orders, payments, customers, leads] = await Promise.all([
      db.order.findMany({
        where: { workspaceId: ws, createdAt: within },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, number: true, currency: true, totalMinor: true, createdAt: true },
      }),
      db.orderPayment.findMany({
        where: { workspaceId: ws, paidAt: within },
        orderBy: { paidAt: 'desc' },
        take: 8,
        select: {
          id: true,
          amountMinor: true,
          paidAt: true,
          order: { select: { number: true, currency: true } },
        },
      }),
      db.customer.findMany({
        where: { workspaceId: ws, createdAt: within },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, name: true, createdAt: true },
      }),
      db.lead.findMany({
        where: { workspaceId: ws, createdAt: within },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, name: true, createdAt: true },
      }),
    ]);
    return [
      ...orders.map((o) => ({
        id: `o-${o.id}`,
        type: 'order' as const,
        title: `Order #${o.number} created · ${formatMoney(o.totalMinor, o.currency)}`,
        at: o.createdAt,
      })),
      ...payments.map((p) => ({
        id: `p-${p.id}`,
        type: 'payment' as const,
        title: `Payment of ${formatMoney(p.amountMinor, p.order.currency)} recorded on order #${p.order.number}`,
        at: p.paidAt,
      })),
      ...customers.map((c) => ({
        id: `c-${c.id}`,
        type: 'customer' as const,
        title: `New customer: ${c.name}`,
        at: c.createdAt,
      })),
      ...leads.map((l) => ({
        id: `l-${l.id}`,
        type: 'lead' as const,
        title: `New lead: ${l.name}`,
        at: l.createdAt,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 10)
      .map((e) => ({ ...e, at: e.at.toISOString() }));
  }
}
