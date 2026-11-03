import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import { leadInputSchema } from '@torio/contracts';
import type {
  LeadBulkInput,
  LeadFilter,
  LeadInputParsed,
  LeadQuery,
  UpdateLeadInput,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AutomationEngine } from '../automation/automation.engine';
import { AuthorizationService } from '../authorization/authorization.service';
import { toCsv } from './csv';
import { computeLeadScore } from './lead-score';
import { digitsOnly, leadInclude, toLeadDto } from './leads.mappers';

const STAGE_LABEL = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  WON: 'Won',
  LOST: 'Lost',
} as const;
const EXPORT_LIMIT = 5000;
const DAY = 86_400_000;

/** Every query is scoped by workspaceId (authorized by WorkspaceAccessGuard). */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly automation: AutomationEngine,
  ) {}

  private buildWhere(workspaceId: string, f: LeadFilter): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = { workspaceId };
    if (f.q) {
      const c = { contains: f.q, mode: 'insensitive' as const };
      const digits = digitsOnly(f.q);
      where.OR = [
        { name: c },
        { email: c },
        { company: c },
        { phone: c },
        ...(digits.length >= 3 ? [{ phoneKey: { contains: digits } }] : []),
      ];
    }
    if (f.stages?.length) where.stage = { in: f.stages };
    if (f.sources?.length) where.source = { in: f.sources };
    if (f.owner === 'unassigned') where.ownerId = null;
    else if (f.owner) where.ownerId = f.owner;
    if (f.tag) where.tags = { has: f.tag };
    if (f.customerId) where.customerId = f.customerId;
    if (f.createdFrom || f.createdTo)
      where.createdAt = {
        ...(f.createdFrom && { gte: new Date(f.createdFrom) }),
        ...(f.createdTo && { lte: new Date(f.createdTo) }),
      };
    if (f.minScore !== undefined || f.maxScore !== undefined)
      where.score = {
        ...(f.minScore !== undefined && { gte: f.minScore }),
        ...(f.maxScore !== undefined && { lte: f.maxScore }),
      };
    return where;
  }

  /** Most recent Inbox conversation per linked customer (workspace-scoped). */
  private async conversationMap(workspaceId: string, customerIds: (string | null)[]) {
    const ids = [...new Set(customerIds.filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const convs = await this.prisma.client.conversation.findMany({
      where: { workspaceId, customerId: { in: ids } },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, customerId: true },
    });
    for (const c of convs) if (!map.has(c.customerId)) map.set(c.customerId, c.id);
    return map;
  }

  async list(workspaceId: string, q: LeadQuery) {
    const db = this.prisma.client;
    const where = this.buildWhere(workspaceId, q);
    const dir = q.dir;
    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      q.sort === 'dealValue'
        ? [{ dealValue: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }]
        : [{ [q.sort]: dir }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        orderBy,
        include: leadInclude,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const convs = await this.conversationMap(
      workspaceId,
      rows.map((r) => r.customerId),
    );
    return {
      data: rows.map((r) => toLeadDto(r, r.customerId ? (convs.get(r.customerId) ?? null) : null)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async summary(workspaceId: string) {
    const db = this.prisma.client;
    const now = Date.now();
    const [byStage, unassigned, last30, prev30] = await Promise.all([
      db.lead.groupBy({ by: ['stage'], where: { workspaceId }, _count: { _all: true } }),
      db.lead.count({ where: { workspaceId, ownerId: null } }),
      db.lead.count({ where: { workspaceId, createdAt: { gte: new Date(now - 30 * DAY) } } }),
      db.lead.count({
        where: {
          workspaceId,
          createdAt: { gte: new Date(now - 60 * DAY), lt: new Date(now - 30 * DAY) },
        },
      }),
    ]);
    const n = (s: string) => byStage.find((g) => g.stage === s)?._count._all ?? 0;
    const won = n('WON');
    const lost = n('LOST');
    return {
      total: byStage.reduce((a, g) => a + g._count._all, 0),
      new: n('NEW'),
      qualified: n('QUALIFIED'),
      won,
      lost,
      unassigned,
      conversionRate: won + lost > 0 ? won / (won + lost) : null,
      createdLast30Days: last30,
      createdPrevious30Days: prev30,
    };
  }

  async get(workspaceId: string, id: string) {
    const row = await this.prisma.client.lead.findFirst({
      where: { id, workspaceId },
      include: leadInclude,
    });
    if (!row) throw new NotFoundException('Lead not found');
    const convs = await this.conversationMap(workspaceId, [row.customerId]);
    return toLeadDto(row, row.customerId ? (convs.get(row.customerId) ?? null) : null);
  }

  async activities(workspaceId: string, id: string) {
    await this.assertExists(workspaceId, id);
    const rows = await this.prisma.client.leadActivity.findMany({
      where: { leadId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true } } },
    });
    return {
      data: rows.map((a) => ({
        id: a.id,
        type: a.type,
        body: a.body,
        actor: a.actor,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async create(workspaceId: string, actorId: string, input: LeadInputParsed) {
    const db = this.prisma.client;
    await this.assertOwner(workspaceId, input.ownerId);
    await this.assertCustomer(workspaceId, input.customerId);
    const email = input.email?.toLowerCase();
    const phoneKey = input.phone ? digitsOnly(input.phone) : undefined;
    await this.assertNoDuplicate(workspaceId, email, phoneKey);
    try {
      const lead = await db.$transaction(async (tx) => {
        const l = await tx.lead.create({
          data: {
            workspaceId,
            name: input.name,
            email,
            phone: input.phone,
            phoneKey,
            company: input.company,
            jobTitle: input.jobTitle,
            source: input.source,
            stage: input.stage,
            ownerId: input.ownerId ?? null,
            tags: [...new Set(input.tags)],
            dealValue: input.dealValue ?? null,
            notes: input.notes,
            customerId: input.customerId ?? null,
            score: computeLeadScore({ ...input, email, stage: input.stage }),
          },
          include: leadInclude,
        });
        await tx.leadActivity.create({
          data: {
            workspaceId,
            leadId: l.id,
            actorId,
            type: 'CREATED',
            body: `Lead created (${input.source.toLowerCase()})`,
          },
        });
        return l;
      });
      await this.automation.emitEvent('lead.created', workspaceId, 'lead', lead.id, 'created');
      return this.get(workspaceId, lead.id);
    } catch (e) {
      throw this.translate(e);
    }
  }

  async update(workspaceId: string, id: string, actorId: string, input: UpdateLeadInput) {
    const db = this.prisma.client;
    const cur = await this.assertExists(workspaceId, id);
    const actor = await db.user.findUniqueOrThrow({
      where: { id: actorId },
      select: { name: true },
    });
    if (input.ownerId !== undefined) await this.assertOwner(workspaceId, input.ownerId);

    const email =
      input.email === undefined ? undefined : input.email ? input.email.toLowerCase() : null;
    const phone = input.phone === undefined ? undefined : input.phone || null;
    const phoneKey = phone === undefined ? undefined : phone ? digitsOnly(phone) : null;
    if ((email && email !== cur.email) || (phoneKey && phoneKey !== cur.phoneKey)) {
      await this.assertNoDuplicate(
        workspaceId,
        email && email !== cur.email ? email : undefined,
        phoneKey && phoneKey !== cur.phoneKey ? phoneKey : undefined,
        id,
      );
    }
    const next = {
      email: email === undefined ? cur.email : email,
      phone: phone === undefined ? cur.phone : phone,
      company: input.company === undefined ? cur.company : input.company || null,
      jobTitle: input.jobTitle === undefined ? cur.jobTitle : input.jobTitle || null,
      dealValue: input.dealValue === undefined ? cur.dealValue : input.dealValue,
      stage: input.stage ?? cur.stage,
      customerId: cur.customerId,
    };
    const events: { type: 'STAGE_CHANGED' | 'OWNER_CHANGED'; body: string }[] = [];
    if (input.stage && input.stage !== cur.stage)
      events.push({
        type: 'STAGE_CHANGED',
        body: `${actor.name} moved this lead from ${STAGE_LABEL[cur.stage]} to ${STAGE_LABEL[input.stage]}`,
      });
    if (input.ownerId !== undefined && input.ownerId !== cur.ownerId) {
      const owner = input.ownerId
        ? await db.user.findUnique({ where: { id: input.ownerId }, select: { name: true } })
        : null;
      events.push({
        type: 'OWNER_CHANGED',
        body: owner
          ? `${actor.name} assigned this lead to ${owner.name}`
          : `${actor.name} unassigned this lead`,
      });
    }
    try {
      await db.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(email !== undefined && { email }),
            ...(phone !== undefined && { phone, phoneKey }),
            company: next.company,
            jobTitle: next.jobTitle,
            dealValue: next.dealValue,
            ...(input.source && { source: input.source }),
            ...(input.stage && { stage: input.stage }),
            ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
            ...(input.tags && { tags: [...new Set(input.tags)] }),
            ...(input.notes !== undefined && { notes: input.notes }),
            score: computeLeadScore(next),
            lastActivityAt: new Date(),
          },
        });
        if (events.length)
          await tx.leadActivity.createMany({
            data: events.map((e) => ({ workspaceId, leadId: id, actorId, ...e })),
          });
      });
    } catch (e) {
      throw this.translate(e);
    }
    if (input.stage && input.stage !== cur.stage)
      await this.automation.emitEvent(
        'lead.stage_changed',
        workspaceId,
        'lead',
        id,
        `${cur.stage}>${input.stage}@${Date.now()}`,
        { previousStage: cur.stage },
      );
    return this.get(workspaceId, id);
  }

  async addNote(workspaceId: string, id: string, actorId: string, body: string) {
    await this.assertExists(workspaceId, id);
    await this.prisma.client.$transaction([
      this.prisma.client.leadActivity.create({
        data: { workspaceId, leadId: id, actorId, type: 'NOTE', body },
      }),
      this.prisma.client.lead.update({ where: { id }, data: { lastActivityAt: new Date() } }),
    ]);
    return this.activities(workspaceId, id);
  }

  async remove(workspaceId: string, id: string) {
    const res = await this.prisma.client.lead.deleteMany({ where: { id, workspaceId } });
    if (res.count === 0) throw new NotFoundException('Lead not found');
  }

  async bulk(workspaceId: string, actorId: string, input: LeadBulkInput) {
    const db = this.prisma.client;
    if (input.action === 'DELETE') {
      await this.authz.assertPermission(actorId, workspaceId, 'leads:delete');
      const res = await db.lead.deleteMany({ where: { id: { in: input.ids }, workspaceId } });
      return { updated: res.count };
    }
    if (input.action === 'ASSIGN') {
      await this.assertOwner(workspaceId, input.ownerId);
      const res = await db.lead.updateMany({
        where: { id: { in: input.ids }, workspaceId },
        data: { ownerId: input.ownerId ?? null, lastActivityAt: new Date() },
      });
      return { updated: res.count };
    }
    const leads = await db.lead.findMany({ where: { id: { in: input.ids }, workspaceId } });
    for (const l of leads) {
      const stage = input.action === 'SET_STAGE' ? input.stage! : l.stage;
      const tags =
        input.action === 'ADD_TAGS'
          ? [...new Set([...l.tags, ...input.tags!])].slice(0, 20)
          : l.tags;
      await db.lead.update({
        where: { id: l.id },
        data: { stage, tags, score: computeLeadScore({ ...l, stage }), lastActivityAt: new Date() },
      });
      if (stage !== l.stage)
        await db.leadActivity.create({
          data: {
            workspaceId,
            leadId: l.id,
            actorId,
            type: 'STAGE_CHANGED',
            body: `Moved from ${STAGE_LABEL[l.stage]} to ${STAGE_LABEL[stage]} (bulk)`,
          },
        });
      if (stage !== l.stage)
        await this.automation.emitEvent(
          'lead.stage_changed',
          workspaceId,
          'lead',
          l.id,
          `${l.stage}>${stage}@${Date.now()}`,
          { previousStage: l.stage },
        );
    }
    return { updated: leads.length };
  }

  async exportCsv(workspaceId: string, f: LeadFilter, ids?: string) {
    const where = this.buildWhere(workspaceId, f);
    const idList = ids
      ?.split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, EXPORT_LIMIT);
    if (idList?.length) where.id = { in: idList };
    const rows = await this.prisma.client.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
      include: leadInclude,
    });
    return toCsv(
      [
        'Name',
        'Email',
        'Phone',
        'Company',
        'Job title',
        'Stage',
        'Source',
        'Owner',
        'Score',
        'Deal value',
        'Tags',
        'Created',
        'Last activity',
      ],
      rows.map((l) => [
        l.name,
        l.email,
        l.phone,
        l.company,
        l.jobTitle,
        STAGE_LABEL[l.stage],
        l.source,
        l.owner?.name,
        l.score,
        l.dealValue,
        l.tags.join('; '),
        l.createdAt.toISOString(),
        l.lastActivityAt.toISOString(),
      ]),
    );
  }

  /** Validates every row with the same schema as manual creation; duplicates are skipped, never merged. */
  async importRows(workspaceId: string, actorId: string, rows: Record<string, unknown>[]) {
    const result = { created: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    for (const [i, raw] of rows.entries()) {
      const row = i + 1;
      const str = (k: string) => (raw[k] == null ? undefined : String(raw[k]).trim());
      const deal = str('dealValue');
      const parsed = leadInputSchema.safeParse({
        name: str('name'),
        email: str('email'),
        phone: str('phone'),
        company: str('company'),
        jobTitle: str('jobTitle'),
        source: (str('source') || 'IMPORT').toUpperCase(),
        stage: (str('stage') || 'NEW').toUpperCase(),
        tags: (str('tags') ?? '')
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean),
        dealValue: deal ? Number(deal.replace(/[^\d.]/g, '')) || undefined : undefined,
        notes: str('notes') ?? '',
      });
      if (!parsed.success) {
        result.errors.push({
          row,
          message: parsed.error.issues
            .map((x) => `${x.path.join('.') || 'row'}: ${x.message}`)
            .join('; '),
        });
        continue;
      }
      try {
        await this.create(workspaceId, actorId, parsed.data);
        result.created++;
      } catch (e) {
        if (e instanceof ConflictException) {
          result.skipped++;
          result.errors.push({ row, message: `Skipped — ${e.message}` });
        } else throw e;
      }
    }
    return result;
  }

  // --- helpers ---
  private async assertExists(workspaceId: string, id: string) {
    const l = await this.prisma.client.lead.findFirst({ where: { id, workspaceId } });
    if (!l) throw new NotFoundException('Lead not found');
    return l;
  }
  private async assertOwner(workspaceId: string, ownerId?: string | null) {
    if (!ownerId) return;
    const m = await this.prisma.client.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
    });
    if (!m) throw new BadRequestException('Owner is not a member of this workspace');
  }
  private async assertCustomer(workspaceId: string, customerId?: string | null) {
    if (!customerId) return;
    const c = await this.prisma.client.customer.findFirst({
      where: { id: customerId, workspaceId },
    });
    if (!c) throw new BadRequestException('Customer not found in this workspace');
  }
  private async assertNoDuplicate(
    workspaceId: string,
    email?: string | null,
    phoneKey?: string | null,
    exceptId?: string,
  ) {
    const or: Prisma.LeadWhereInput[] = [];
    if (email) or.push({ email });
    if (phoneKey) or.push({ phoneKey });
    if (!or.length) return;
    const dup = await this.prisma.client.lead.findFirst({
      where: { workspaceId, OR: or, ...(exceptId && { id: { not: exceptId } }) },
      select: { email: true, phoneKey: true },
    });
    if (dup)
      throw new ConflictException(
        dup.email && dup.email === email
          ? 'A lead with this email already exists'
          : 'A lead with this phone number already exists',
      );
  }
  private translate(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return new ConflictException('A lead with this email or phone already exists');
    return e;
  }
}
