import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@torio/database';
import type { CreateRoleInput, DeleteRoleInput, UpdateRoleInput } from '@torio/contracts';
import {
  normalizeRolePermissions,
  OWNER_ONLY_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_TEMPLATES,
  type Permission,
  type WorkspaceRole,
} from '@torio/types';
import { PrismaService } from '../../database/prisma.service';

/** What the person acting may do, taken from their verified membership: nobody can hand out more than this. */
export interface RoleActor {
  userId: string;
  permissions: ReadonlySet<Permission>;
}

const MAX_CUSTOM_ROLES = 20;
const SYSTEM: { id: WorkspaceRole; name: string; description: string }[] = [
  {
    id: 'OWNER',
    name: 'Owner',
    description:
      'Full workspace access. A fixed system role: it cannot be edited, removed or reassigned.',
  },
  {
    id: 'ADMIN',
    name: 'Admin',
    description: 'Manages workspace operations: members, channels, settings and business data.',
  },
  {
    id: 'AGENT',
    name: 'Agent',
    description: 'Handles conversations, customers and leads, with limited administrative access.',
  },
];
const keyOf = (name: string) => name.trim().toLowerCase();

/**
 * Custom roles for a workspace. A role is a name plus a list of permission keys the API really enforces. Every rule that keeps
 * people from raising themselves lives here, on the server: keys are validated, the owner-only keys can never be put in a role,
 * and nobody can put a permission in a role (or give a role) that they do not hold themselves.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  templates() {
    return { data: ROLE_TEMPLATES.map((t) => ({ ...t, permissions: [...t.permissions] })) };
  }

  private dto(r: {
    id: string;
    name: string;
    description: string | null;
    templateKey: string | null;
    permissions: string[];
    createdAt: Date;
    updatedAt: Date;
    updatedBy: { id: string; name: string } | null;
    _count?: { memberships: number };
  }) {
    return {
      id: r.id,
      kind: 'CUSTOM' as const,
      name: r.name,
      description: r.description,
      templateKey: r.templateKey,
      permissions: normalizeRolePermissions(r.permissions),
      memberCount: r._count?.memberships ?? 0,
      editable: true,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    };
  }

  private async customRows(ws: string) {
    const rows = await this.prisma.client.workspaceRoleDef.findMany({
      where: { workspaceId: ws },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });
    const ids = [
      ...new Set(rows.map((r) => r.updatedById ?? r.createdById).filter(Boolean)),
    ] as string[];
    const people = ids.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    return rows.map((r) =>
      this.dto({
        ...r,
        updatedBy: people.find((p) => p.id === (r.updatedById ?? r.createdById)) ?? null,
      }),
    );
  }

  async list(ws: string) {
    const counts = await this.prisma.client.workspaceMembership.groupBy({
      by: ['role'],
      where: { workspaceId: ws, customRoleId: null },
      _count: { _all: true },
    });
    const system = SYSTEM.map((s) => ({
      id: s.id,
      kind: 'SYSTEM' as const,
      name: s.name,
      description: s.description,
      templateKey: null,
      permissions: [...ROLE_PERMISSIONS[s.id]],
      memberCount: counts.find((c) => c.role === s.id)?._count._all ?? 0,
      editable: false,
      createdAt: null,
      updatedAt: null,
      updatedBy: null,
    }));
    return { data: [...system, ...(await this.customRows(ws))] };
  }

  async detail(ws: string, id: string) {
    const all = (await this.list(ws)).data;
    const role = all.find((r) => r.id === id);
    if (!role) throw new NotFoundException('Role not found');
    const members = await this.prisma.client.workspaceMembership.findMany({
      where:
        role.kind === 'SYSTEM'
          ? { workspaceId: ws, role: id as WorkspaceRole, customRoleId: null }
          : { workspaceId: ws, customRoleId: id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...role,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
      })),
    };
  }

  /** Rejects unknown keys and the owner-only keys, adds the baseline, and refuses anything the actor does not hold. */
  private checked(actor: RoleActor, keys: readonly string[], already: readonly string[] = []) {
    const unknown = keys.filter((k) => !(PERMISSIONS as readonly string[]).includes(k));
    if (unknown.length) throw new BadRequestException(`Unknown permission: ${unknown[0]}`);
    const ownerOnly = keys.filter((k) => (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(k));
    if (ownerOnly.length)
      throw new BadRequestException(
        `${ownerOnly[0]} is reserved for the Owner and cannot be part of a role`,
      );
    const perms = normalizeRolePermissions(keys);
    const beyond = perms.filter((p) => !already.includes(p) && !actor.permissions.has(p));
    if (beyond.length)
      throw new ForbiddenException(
        `You cannot grant ${beyond[0]}, because you do not have it yourself`,
      );
    return perms;
  }

  private audit(
    tx: Prisma.TransactionClient,
    ws: string,
    actorId: string,
    action: string,
    entityId: string,
    description: string,
    extra: Record<string, unknown> = {},
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action,
        entityType: 'role',
        entityId,
        metadata: { description, ...extra } as Prisma.InputJsonValue,
      },
    });
  }

  async create(ws: string, actor: RoleActor, input: CreateRoleInput) {
    const db = this.prisma.client;
    const perms = this.checked(actor, input.permissions);
    if ((await db.workspaceRoleDef.count({ where: { workspaceId: ws } })) >= MAX_CUSTOM_ROLES)
      throw new BadRequestException(
        `A workspace can have at most ${MAX_CUSTOM_ROLES} custom roles`,
      );
    const name = input.name.trim();
    if (SYSTEM.some((s) => keyOf(s.name) === keyOf(name)))
      throw new ConflictException('That name is used by a system role');
    try {
      const id = await db.$transaction(async (tx) => {
        const row = await tx.workspaceRoleDef.create({
          data: {
            workspaceId: ws,
            name,
            nameKey: keyOf(name),
            description: input.description ?? null,
            templateKey: input.templateKey ?? null,
            permissions: perms,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
        await this.audit(
          tx,
          ws,
          actor.userId,
          'role.create',
          row.id,
          `Custom role “${name}” created`,
          {
            templateKey: input.templateKey ?? null,
            permissions: perms,
          },
        );
        return row.id;
      });
      return this.detail(ws, id);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw new ConflictException('A role with that name already exists');
      throw e;
    }
  }

  private async own(ws: string, id: string) {
    const row = await this.prisma.client.workspaceRoleDef.findFirst({
      where: { id, workspaceId: ws },
      include: { _count: { select: { memberships: true } } },
    });
    if (!row) throw new NotFoundException('Role not found');
    return row;
  }

  async update(ws: string, actor: RoleActor, id: string, input: UpdateRoleInput) {
    const row = await this.own(ws, id);
    const current = normalizeRolePermissions(row.permissions);
    const next = input.permissions ? this.checked(actor, input.permissions, current) : current;
    const added = next.filter((p) => !current.includes(p));
    const removed = current.filter((p) => !next.includes(p));
    const name = input.name?.trim();
    if (name && SYSTEM.some((s) => keyOf(s.name) === keyOf(name)))
      throw new ConflictException('That name is used by a system role');
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.workspaceRoleDef.update({
          where: { id },
          data: {
            ...(name && { name, nameKey: keyOf(name) }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.permissions && { permissions: next }),
            updatedById: actor.userId,
          },
        });
        const changes = [
          name && name !== row.name ? `renamed to “${name}”` : null,
          added.length ? `added ${added.join(', ')}` : null,
          removed.length ? `removed ${removed.join(', ')}` : null,
          input.description !== undefined && (input.description ?? null) !== row.description
            ? 'description changed'
            : null,
        ].filter(Boolean);
        if (changes.length)
          await this.audit(
            tx,
            ws,
            actor.userId,
            'role.update',
            id,
            `Role “${row.name}”: ${changes.join('; ')}`,
            {
              added,
              removed,
            },
          );
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw new ConflictException('A role with that name already exists');
      throw e;
    }
    return {
      ...(await this.detail(ws, id)),
      affectedMembers: removed.length ? row._count.memberships : 0,
    };
  }

  async duplicate(ws: string, actor: RoleActor, id: string) {
    const row = await this.own(ws, id);
    const taken = new Set(
      (
        await this.prisma.client.workspaceRoleDef.findMany({
          where: { workspaceId: ws },
          select: { nameKey: true },
        })
      ).map((r) => r.nameKey),
    );
    let name = `${row.name} copy`;
    for (let n = 2; taken.has(keyOf(name)); n++) name = `${row.name} copy ${n}`;
    return this.create(ws, actor, {
      name: name.slice(0, 40),
      description: row.description,
      templateKey: row.templateKey,
      permissions: normalizeRolePermissions(row.permissions),
    });
  }

  async remove(ws: string, actor: RoleActor, id: string, input: DeleteRoleInput) {
    const row = await this.own(ws, id);
    const members = row._count.memberships;
    let target: { role: WorkspaceRole; customRoleId: string | null; label: string } | null = null;
    if (members > 0) {
      if (!input.reassignTo)
        throw new BadRequestException(
          `${members} member${members === 1 ? ' uses' : 's use'} this role. Choose a role to move them to before deleting it.`,
        );
      if (input.reassignTo === id) throw new BadRequestException('Choose a different role');
      if (input.reassignTo === 'ADMIN' || input.reassignTo === 'AGENT') {
        const perms = ROLE_PERMISSIONS[input.reassignTo];
        if ([...perms].some((p) => !actor.permissions.has(p)))
          throw new ForbiddenException(
            'You cannot move members to a role with more access than you have',
          );
        target = {
          role: input.reassignTo,
          customRoleId: null,
          label: input.reassignTo === 'ADMIN' ? 'Admin' : 'Agent',
        };
      } else {
        const dest = await this.own(ws, input.reassignTo);
        if (dest.permissions.some((p) => !actor.permissions.has(p as Permission)))
          throw new ForbiddenException(
            'You cannot move members to a role with more access than you have',
          );
        target = { role: 'AGENT', customRoleId: dest.id, label: dest.name };
      }
    }
    await this.prisma.client.$transaction(async (tx) => {
      if (target && members > 0) {
        const moved = await tx.workspaceMembership.findMany({
          where: { workspaceId: ws, customRoleId: id },
          select: { id: true, user: { select: { name: true } } },
        });
        await tx.workspaceMembership.updateMany({
          where: { workspaceId: ws, customRoleId: id },
          data: { role: target.role, customRoleId: target.customRoleId },
        });
        for (const m of moved)
          await tx.auditLog.create({
            data: {
              workspaceId: ws,
              actorId: actor.userId,
              action: 'member.role_change',
              entityType: 'membership',
              entityId: m.id,
              metadata: {
                description: `Role changed from ${row.name} to ${target.label} because “${row.name}” was deleted (${m.user.name})`,
                change: { from: id, to: target.customRoleId ?? target.role },
              },
            },
          });
      }
      await tx.workspaceRoleDef.delete({ where: { id } });
      await this.audit(
        tx,
        ws,
        actor.userId,
        'role.delete',
        id,
        `Custom role “${row.name}” deleted`,
        {
          reassigned: members,
          to: target?.label ?? null,
        },
      );
    });
  }
}
