import { Injectable } from '@nestjs/common';
import { slugify } from '@torio/contracts';
import type { AuditQuery, UpdateWorkspaceInput } from '@torio/contracts';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only workspaces the user is a member of. */
  async listForUser(userId: string) {
    const rows = await this.prisma.client.workspaceMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({ ...this.toDto(m.workspace), role: m.role }));
  }

  async create(userId: string, name: string) {
    const slug = `${slugify(name)}-${randomBytes(3).toString('hex')}`;
    const workspace = await this.prisma.client.$transaction(async (tx) => {
      const w = await tx.workspace.create({ data: { name, slug, createdById: userId } });
      await tx.workspaceMembership.create({ data: { workspaceId: w.id, userId, role: 'OWNER' } });
      await tx.auditLog.create({
        data: {
          workspaceId: w.id,
          actorId: userId,
          action: 'workspace.create',
          entityType: 'workspace',
          entityId: w.id,
        },
      });
      return w;
    });
    return { ...this.toDto(workspace), role: 'OWNER' as const };
  }

  async get(workspaceId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') {
    const w = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return { ...this.toDto(w), role };
  }

  /** Workspace profile only. The slug (and so URLs/identity) never changes here. */
  async update(
    workspaceId: string,
    actorId: string,
    role: 'OWNER' | 'ADMIN' | 'AGENT',
    input: UpdateWorkspaceInput,
  ) {
    const cur = await this.prisma.client.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const changed = (['name', 'description', 'defaultCurrency', 'contactEmail'] as const).filter(
      (k) => input[k] !== undefined && input[k] !== cur[k],
    );
    const w = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
          ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
        },
      });
      if (changed.length)
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorId,
            action: 'workspace.update',
            entityType: 'workspace',
            entityId: workspaceId,
            metadata: { description: `Workspace settings changed: ${changed.join(', ')}` },
          },
        });
      return updated;
    });
    return { ...this.toDto(w), role };
  }

  async audit(workspaceId: string, q: AuditQuery) {
    const where = {
      workspaceId,
      ...(q.q && { action: { contains: q.q, mode: 'insensitive' as const } }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.auditLog.count({ where }),
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        description: (r.metadata as { description?: string } | null)?.description ?? r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  private toDto(w: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    defaultCurrency: string | null;
    contactEmail: string | null;
    createdAt: Date;
  }) {
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      defaultCurrency: w.defaultCurrency,
      contactEmail: w.contactEmail,
      createdAt: w.createdAt.toISOString(),
    };
  }
}
