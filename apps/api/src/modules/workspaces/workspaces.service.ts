import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SLUG_MAX, storeSlugSchema } from '@torio/contracts';
import type { AuditQuery, CreateStoreInput, UpdateWorkspaceInput } from '@torio/contracts';
import { Prisma } from '@torio/database';
import { PrismaService } from '../../database/prisma.service';
import { ImagesService, type UploadedFile } from '../images/images.service';

/** Stops a runaway script from creating stores without bound. */
const MAX_OWNED_STORES = 20;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
  ) {}

  /**
   * Only stores the user is an active member of. Exactly one is `active`: the last one they used (if they still belong
   * to it), else the oldest. The active store is listed first.
   */
  async listForUser(userId: string) {
    const [rows, prefs] = await Promise.all([
      this.prisma.client.workspaceMembership.findMany({
        // Suspended stores stay listed (their status explains why they are locked).
        where: { userId, status: 'ACTIVE' },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.userPreferences.findUnique({ where: { userId } }),
    ]);
    const activeId =
      rows.find((m) => m.workspaceId === prefs?.lastActiveWorkspaceId)?.workspaceId ??
      rows[0]?.workspaceId;
    const list = rows.map((m) => ({
      ...this.toDto(m.workspace),
      role: m.role,
      active: m.workspaceId === activeId,
    }));
    return [...list.filter((w) => w.active), ...list.filter((w) => !w.active)];
  }

  /** Switching stores: only to one the user is an active member of. Persisted, so it is restored after sign-in. */
  async setActive(userId: string, workspaceId: string) {
    const m = await this.prisma.client.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    // Same answer for "not yours" and "does not exist", so store ids can't be probed.
    if (!m || m.status !== 'ACTIVE') throw new NotFoundException('Store not found');
    await this.prisma.client.userPreferences.upsert({
      where: { userId },
      create: { userId, lastActiveWorkspaceId: workspaceId },
      update: { lastActiveWorkspaceId: workspaceId },
    });
    return this.listForUser(userId);
  }

  async slugCheck(rawSlug: string) {
    const parsed = storeSlugSchema.safeParse(rawSlug);
    if (!parsed.success)
      return {
        slug: rawSlug,
        available: false,
        reason: parsed.error.issues[0]?.message ?? 'Not a valid address',
        suggestion: null,
      };
    const slug = parsed.data;
    const taken = await this.prisma.client.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return { slug, available: true, reason: null, suggestion: null };
    return {
      slug,
      available: false,
      reason: 'This address is already taken',
      suggestion: await this.suggestSlug(slug),
    };
  }

  private async suggestSlug(base: string) {
    for (let i = 2; i < 50; i++) {
      const candidate = `${base.slice(0, SLUG_MAX - 4)}-${i}`;
      if (!(await this.prisma.client.workspace.findUnique({ where: { slug: candidate } })))
        return candidate;
    }
    return null;
  }

  /**
   * Creates a store, its OWNER membership, the audit entry and the user's active-store preference in one transaction:
   * either everything exists afterwards or nothing does. The business profile is the store's own record, which General
   * Settings later reads and edits, so there is no second copy to drift.
   */
  async create(userId: string, input: CreateStoreInput) {
    const owned = await this.prisma.client.workspaceMembership.count({
      where: { userId, role: 'OWNER' },
    });
    if (owned >= MAX_OWNED_STORES)
      throw new ForbiddenException(`You can own up to ${MAX_OWNED_STORES} stores.`);
    try {
      const workspace = await this.prisma.client.$transaction(async (tx) => {
        const w = await tx.workspace.create({
          data: {
            name: input.name,
            slug: input.slug,
            createdById: userId,
            defaultCurrency: input.defaultCurrency,
            reportingTimeZone: input.reportingTimeZone,
            contactEmail: input.contactEmail,
            industry: input.industry,
            phone: input.phone,
            country: input.country,
            addressLine: input.addressLine,
            city: input.city,
            state: input.state,
            postalCode: input.postalCode,
          },
        });
        await tx.workspaceMembership.create({
          data: { workspaceId: w.id, userId, role: 'OWNER' },
        });
        await tx.userPreferences.upsert({
          where: { userId },
          create: { userId, lastActiveWorkspaceId: w.id },
          update: { lastActiveWorkspaceId: w.id },
        });
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
      return { ...this.toDto(workspace), role: 'OWNER' as const, active: true };
    } catch (e) {
      // The unique index is the authority; the availability check is only a courtesy.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('This store address is already taken');
      throw e;
    }
  }

  async get(workspaceId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') {
    const w = await this.prisma.client.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return { ...this.toDto(w), role, active: true };
  }

  /**
   * The workspace's brand logo, shared by everything that shows the workspace. Stored apart from any personal picture: its own
   * kind and owner, and its own column. An SVG is accepted only when plain, and is drawn to pixels first.
   */
  async setLogo(
    workspaceId: string,
    actorId: string,
    role: 'OWNER' | 'ADMIN' | 'AGENT',
    file: UploadedFile | undefined,
  ) {
    const processed = await this.images.process('WORKSPACE_LOGO', file);
    const saved = await this.images.save('WORKSPACE_LOGO', workspaceId, processed, actorId);
    const w = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: { logo: saved.url },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId,
          action: 'workspace.logo_update',
          entityType: 'workspace',
          entityId: workspaceId,
          metadata: { description: 'Brand logo uploaded' },
        },
      });
      return updated;
    });
    return { ...this.toDto(w), role, active: true };
  }

  async removeLogo(workspaceId: string, actorId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') {
    await this.images.remove('WORKSPACE_LOGO', workspaceId);
    const w = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: { logo: null },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId,
          action: 'workspace.logo_remove',
          entityType: 'workspace',
          entityId: workspaceId,
          metadata: { description: 'Brand logo removed' },
        },
      });
      return updated;
    });
    return { ...this.toDto(w), role, active: true };
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
    const changed = (
      [
        'name',
        'description',
        'defaultCurrency',
        'contactEmail',
        'reportingTimeZone',
        'industry',
        'phone',
        'country',
        'addressLine',
        'city',
        'state',
        'postalCode',
      ] as const
    ).filter((k) => input[k] !== undefined && input[k] !== cur[k]);
    const w = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
          ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
          ...(input.reportingTimeZone !== undefined && {
            reportingTimeZone: input.reportingTimeZone,
          }),
          ...(input.industry !== undefined && { industry: input.industry }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.country !== undefined && { country: input.country }),
          ...(input.addressLine !== undefined && { addressLine: input.addressLine }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.state !== undefined && { state: input.state }),
          ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
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
    return { ...this.toDto(w), role, active: true };
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
    status?: 'ACTIVE' | 'SUSPENDED';
    reportingTimeZone?: string;
    defaultCurrency: string | null;
    contactEmail: string | null;
    logo?: string | null;
    phone?: string | null;
    industry?: string | null;
    country?: string | null;
    addressLine?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    createdAt: Date;
  }) {
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      status: w.status ?? ('ACTIVE' as const),
      reportingTimeZone: w.reportingTimeZone ?? 'UTC',
      defaultCurrency: w.defaultCurrency,
      contactEmail: w.contactEmail,
      logo: w.logo ?? null,
      phone: w.phone ?? null,
      industry: w.industry ?? null,
      country: w.country ?? null,
      addressLine: w.addressLine ?? null,
      city: w.city ?? null,
      state: w.state ?? null,
      postalCode: w.postalCode ?? null,
      createdAt: w.createdAt.toISOString(),
    };
  }
}
