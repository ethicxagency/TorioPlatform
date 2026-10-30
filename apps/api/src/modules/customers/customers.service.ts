import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import { customerInputSchema } from '@torio/contracts';
import type {
  CustomerBulkInput,
  CustomerFilter,
  CustomerInputParsed,
  CustomerQuery,
  UpdateCustomerInput,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AutomationEngine } from '../automation/automation.engine';
import { toCsv } from '../leads/csv';
import { customerInclude, digitsOnly, toCustomerListItem } from './customers.mappers';

const DAY = 86_400_000;
const EXPORT_LIMIT = 5000;

/** All queries are scoped by workspaceId (authorized upstream by WorkspaceAccessGuard). */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationEngine,
  ) {}

  private buildWhere(workspaceId: string, f: CustomerFilter): Prisma.CustomerWhereInput {
    const and: Prisma.CustomerWhereInput[] = [{ workspaceId }];
    if (f.q) {
      const c = { contains: f.q, mode: 'insensitive' as const };
      const digits = digitsOnly(f.q);
      and.push({
        OR: [
          { name: c },
          { email: c },
          { company: c },
          { phone: c },
          { handle: c },
          ...(digits.length >= 3 ? [{ phoneKey: { contains: digits } }] : []),
        ],
      });
    }
    if (f.status) and.push({ status: f.status });
    if (f.sources?.length) and.push({ source: { in: f.sources } });
    if (f.owner === 'unassigned') and.push({ ownerId: null });
    else if (f.owner) and.push({ ownerId: f.owner });
    if (f.tag) and.push({ tags: { has: f.tag } });
    if (f.createdFrom || f.createdTo)
      and.push({
        createdAt: {
          ...(f.createdFrom && { gte: new Date(f.createdFrom) }),
          ...(f.createdTo && { lte: new Date(f.createdTo) }),
        },
      });
    const now = Date.now();
    // Predefined segments with explicit rules. Order-based segments (repeat, high-value) need the Orders module.
    if (f.segment === 'new') and.push({ createdAt: { gte: new Date(now - 30 * DAY) } });
    if (f.segment === 'recent')
      and.push({ conversations: { some: { lastMessageAt: { gte: new Date(now - 7 * DAY) } } } });
    if (f.segment === 'inactive')
      and.push({
        OR: [
          { status: 'INACTIVE' },
          { conversations: { none: { lastMessageAt: { gte: new Date(now - 90 * DAY) } } } },
        ],
      });
    if (f.segment === 'tagged') and.push({ NOT: { tags: { isEmpty: true } } });
    return { AND: and };
  }

  /** Newest conversation id + timestamp per customer, one query for the whole page. */
  private async convInfo(workspaceId: string, ids: string[]) {
    const map = new Map<string, { latestId: string | null; lastMessageAt: Date | null }>();
    if (!ids.length) return map;
    const rows = await this.prisma.client.conversation.findMany({
      where: { workspaceId, customerId: { in: ids } },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, customerId: true, lastMessageAt: true },
    });
    for (const r of rows)
      if (!map.has(r.customerId))
        map.set(r.customerId, { latestId: r.id, lastMessageAt: r.lastMessageAt });
    return map;
  }

  async list(workspaceId: string, q: CustomerQuery) {
    const db = this.prisma.client;
    const where = this.buildWhere(workspaceId, q);
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      q.sort === 'name' ? [{ name: q.dir }, { id: 'asc' }] : [{ createdAt: q.dir }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy,
        include: customerInclude,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const info = await this.convInfo(
      workspaceId,
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((r) =>
        toCustomerListItem(r, info.get(r.id) ?? { latestId: null, lastMessageAt: null }),
      ),
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
    const [total, active, withConv, last30, prev30] = await Promise.all([
      db.customer.count({ where: { workspaceId } }),
      db.customer.count({ where: { workspaceId, status: 'ACTIVE' } }),
      db.customer.count({ where: { workspaceId, conversations: { some: {} } } }),
      db.customer.count({ where: { workspaceId, createdAt: { gte: new Date(now - 30 * DAY) } } }),
      db.customer.count({
        where: {
          workspaceId,
          createdAt: { gte: new Date(now - 60 * DAY), lt: new Date(now - 30 * DAY) },
        },
      }),
    ]);
    return {
      total,
      active,
      withConversations: withConv,
      createdLast30Days: last30,
      createdPrevious30Days: prev30,
    };
  }

  async get(workspaceId: string, id: string) {
    const row = await this.prisma.client.customer.findFirst({
      where: { id, workspaceId },
      include: customerInclude,
    });
    if (!row) throw new NotFoundException('Customer not found');
    const info = await this.convInfo(workspaceId, [id]);
    return toCustomerListItem(row, info.get(id) ?? { latestId: null, lastMessageAt: null });
  }

  async create(workspaceId: string, input: CustomerInputParsed) {
    await this.assertOwner(workspaceId, input.ownerId);
    const email = input.email?.toLowerCase();
    const phoneKey = input.phone ? digitsOnly(input.phone) : undefined;
    await this.assertNoDuplicate(workspaceId, email, phoneKey);
    try {
      const c = await this.prisma.client.customer.create({
        data: {
          workspaceId,
          name: input.name,
          email,
          phone: input.phone,
          phoneKey,
          company: input.company,
          address: input.address,
          source: input.source,
          status: input.status,
          ownerId: input.ownerId ?? null,
          tags: [...new Set(input.tags)],
          notes: input.notes,
        },
      });
      await this.automation.emitEvent('customer.created', workspaceId, 'customer', c.id, 'created');
      return this.get(workspaceId, c.id);
    } catch (e) {
      throw this.translate(e);
    }
  }

  async update(workspaceId: string, id: string, input: UpdateCustomerInput) {
    const cur = await this.assertExists(workspaceId, id);
    if (input.ownerId) await this.assertOwner(workspaceId, input.ownerId);
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
    try {
      await this.prisma.client.customer.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone, phoneKey }),
          ...(input.company !== undefined && { company: input.company || null }),
          ...(input.address !== undefined && { address: input.address || null }),
          ...(input.source && { source: input.source }),
          ...(input.status && { status: input.status }),
          ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
          ...(input.leadStatus && { leadStatus: input.leadStatus }),
          ...(input.tags && { tags: [...new Set(input.tags)] }),
          ...(input.notes !== undefined && { notes: input.notes }),
        },
      });
    } catch (e) {
      throw this.translate(e);
    }
    return this.get(workspaceId, id);
  }

  /** Customers with conversations cannot be deleted (it would cascade-delete message history); mark them Inactive instead. */
  async remove(workspaceId: string, id: string) {
    const c = await this.prisma.client.customer.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { conversations: true } } },
    });
    if (!c) throw new NotFoundException('Customer not found');
    if (c._count.conversations > 0)
      throw new ConflictException(
        'This customer has conversations. Mark them Inactive instead of deleting.',
      );
    await this.prisma.client.customer.delete({ where: { id } });
  }

  async notes(workspaceId: string, id: string) {
    await this.assertExists(workspaceId, id);
    const rows = await this.prisma.client.customerNote.findMany({
      where: { customerId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { author: { select: { id: true, name: true } } },
    });
    return {
      data: rows.map((n) => ({
        id: n.id,
        body: n.body,
        author: n.author,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
    };
  }

  async addNote(workspaceId: string, id: string, authorId: string, body: string) {
    await this.assertExists(workspaceId, id);
    await this.prisma.client.customerNote.create({
      data: { workspaceId, customerId: id, authorId, body },
    });
    return this.notes(workspaceId, id);
  }

  /** Authors edit their own notes; deleting also needs customers:delete unless you wrote it (checked by the caller via `canModerate`). */
  async updateNote(workspaceId: string, id: string, noteId: string, userId: string, body: string) {
    const n = await this.prisma.client.customerNote.findFirst({
      where: { id: noteId, customerId: id, workspaceId },
    });
    if (!n) throw new NotFoundException('Note not found');
    if (n.authorId !== userId) throw new ForbiddenException('You can only edit your own notes');
    await this.prisma.client.customerNote.update({ where: { id: noteId }, data: { body } });
    return this.notes(workspaceId, id);
  }

  async removeNote(
    workspaceId: string,
    id: string,
    noteId: string,
    userId: string,
    canModerate: boolean,
  ) {
    const n = await this.prisma.client.customerNote.findFirst({
      where: { id: noteId, customerId: id, workspaceId },
    });
    if (!n) throw new NotFoundException('Note not found');
    if (n.authorId !== userId && !canModerate)
      throw new ForbiddenException('You can only delete your own notes');
    await this.prisma.client.customerNote.delete({ where: { id: noteId } });
    return this.notes(workspaceId, id);
  }

  async conversations(workspaceId: string, id: string) {
    await this.assertExists(workspaceId, id);
    const rows = await this.prisma.client.conversation.findMany({
      where: { customerId: id, workspaceId },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: {
        channel: { select: { provider: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    return {
      data: rows.map((c) => ({
        id: c.id,
        provider: c.channel.provider,
        status: c.status,
        preview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt.toISOString(),
        assignee: c.assignee,
      })),
    };
  }

  /** Real recorded events only: creation, conversations started, internal notes. (No tag/field change history is stored yet.) */
  async activity(workspaceId: string, id: string) {
    const c = await this.assertExists(workspaceId, id);
    const [convs, notes] = await Promise.all([
      this.conversations(workspaceId, id),
      this.notes(workspaceId, id),
    ]);
    const events = [
      {
        id: `created-${c.id}`,
        type: 'CREATED' as const,
        body: 'Customer record created',
        at: c.createdAt.toISOString(),
        conversationId: null,
      },
      ...convs.data.map((x) => ({
        id: `conv-${x.id}`,
        type: 'CONVERSATION' as const,
        body: `${x.provider.charAt(0) + x.provider.slice(1).toLowerCase()} conversation: ${x.preview || 'no messages'}`,
        at: x.lastMessageAt,
        conversationId: x.id,
      })),
      ...notes.data.map((n) => ({
        id: `note-${n.id}`,
        type: 'NOTE' as const,
        body: `${n.author?.name ?? 'Team'}: ${n.body}`,
        at: n.createdAt,
        conversationId: null,
      })),
    ];
    return { data: events.sort((a, b) => b.at.localeCompare(a.at)) };
  }

  async bulk(workspaceId: string, input: CustomerBulkInput) {
    const db = this.prisma.client;
    const where = { id: { in: input.ids }, workspaceId };
    if (input.action === 'ASSIGN') {
      await this.assertOwner(workspaceId, input.ownerId);
      return {
        updated: (await db.customer.updateMany({ where, data: { ownerId: input.ownerId ?? null } }))
          .count,
      };
    }
    if (input.action === 'SET_STATUS')
      return {
        updated: (await db.customer.updateMany({ where, data: { status: input.status! } })).count,
      };
    const rows = await db.customer.findMany({ where, select: { id: true, tags: true } });
    for (const r of rows) {
      const tags =
        input.action === 'ADD_TAGS'
          ? [...new Set([...r.tags, ...input.tags!])].slice(0, 20)
          : r.tags.filter((t) => !input.tags!.includes(t));
      await db.customer.update({ where: { id: r.id }, data: { tags } });
    }
    return { updated: rows.length };
  }

  async exportCsv(workspaceId: string, f: CustomerFilter, ids?: string) {
    const where = this.buildWhere(workspaceId, f);
    const idList = ids
      ?.split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, EXPORT_LIMIT);
    const finalWhere: Prisma.CustomerWhereInput = idList?.length
      ? { AND: [where, { id: { in: idList } }] }
      : where;
    const rows = await this.prisma.client.customer.findMany({
      where: finalWhere,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
      include: customerInclude,
    });
    return toCsv(
      [
        'Name',
        'Email',
        'Phone',
        'Company',
        'Status',
        'Source',
        'Owner',
        'Tags',
        'Conversations',
        'Created',
      ],
      rows.map((c) => [
        c.name,
        c.email,
        c.phone,
        c.company,
        c.status,
        c.source,
        c.owner?.name,
        c.tags.join('; '),
        c._count.conversations,
        c.createdAt.toISOString(),
      ]),
    );
  }

  /** Same validation as manual create. Duplicates are skipped (never merged) and reported per row. */
  async importRows(workspaceId: string, rows: Record<string, unknown>[]) {
    const result = { created: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    for (const [i, raw] of rows.entries()) {
      const row = i + 1;
      const str = (k: string) => (raw[k] == null ? undefined : String(raw[k]).trim());
      const parsed = customerInputSchema.safeParse({
        name: str('name'),
        email: str('email'),
        phone: str('phone'),
        company: str('company'),
        address: str('address'),
        source: (str('source') || 'IMPORT').toUpperCase(),
        tags: (str('tags') ?? '')
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean),
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
        await this.create(workspaceId, parsed.data);
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

  private async assertExists(workspaceId: string, id: string) {
    const c = await this.prisma.client.customer.findFirst({ where: { id, workspaceId } });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }
  private async assertOwner(workspaceId: string, ownerId?: string | null) {
    if (!ownerId) return;
    const m = await this.prisma.client.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
    });
    if (!m) throw new BadRequestException('Owner is not a member of this workspace');
  }
  private async assertNoDuplicate(
    workspaceId: string,
    email?: string | null,
    phoneKey?: string | null,
    exceptId?: string,
  ) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (email) or.push({ email });
    if (phoneKey) or.push({ phoneKey });
    if (!or.length) return;
    const dup = await this.prisma.client.customer.findFirst({
      where: { workspaceId, OR: or, ...(exceptId && { id: { not: exceptId } }) },
      select: { email: true },
    });
    if (dup)
      throw new ConflictException(
        dup.email && dup.email === email
          ? 'A customer with this email already exists'
          : 'A customer with this phone number already exists',
      );
  }
  private translate(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return new ConflictException('A customer with this email or phone already exists');
    return e;
  }
}
