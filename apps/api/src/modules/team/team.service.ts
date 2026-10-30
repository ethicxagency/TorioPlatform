import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import type {
  InvitationInput,
  MemberQuery,
  TeamInput,
  UpdateMemberInput,
  UpdateTeamInput,
} from '@torio/contracts';
import { assignableRoles, canManageMember, type WorkspaceRole } from '@torio/types';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/password.service';

const INVITE_TTL_MS = 7 * 86_400_000;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  AGENT: 'Agent',
};

export interface Actor {
  userId: string;
  role: WorkspaceRole;
}

/** Member, invitation and team management. Every query is scoped by workspaceId; every mutation is policy-checked and audited. */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------- members ----------

  async summary(ws: string) {
    const db = this.prisma.client;
    const [total, active, suspended, pending, unassigned] = await Promise.all([
      db.workspaceMembership.count({ where: { workspaceId: ws } }),
      db.workspaceMembership.count({ where: { workspaceId: ws, status: 'ACTIVE' } }),
      db.workspaceMembership.count({ where: { workspaceId: ws, status: 'SUSPENDED' } }),
      db.invitation.count({
        where: {
          workspaceId: ws,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      db.conversation.count({ where: { workspaceId: ws, status: 'OPEN', assigneeId: null } }),
    ]);
    return {
      totalMembers: total,
      activeMembers: active,
      suspendedMembers: suspended,
      pendingInvitations: pending,
      unassignedOpenConversations: unassigned,
    };
  }

  private async decorate(
    ws: string,
    rows: {
      id: string;
      userId: string;
      role: WorkspaceRole;
      status: 'ACTIVE' | 'SUSPENDED';
      createdAt: Date;
      user: {
        name: string;
        email: string;
        teamMemberships: { team: { id: string; name: string; workspaceId: string } }[];
      };
    }[],
  ) {
    const db = this.prisma.client;
    const userIds = rows.map((r) => r.userId);
    const [open, sessions] = userIds.length
      ? await Promise.all([
          db.conversation.groupBy({
            by: ['assigneeId'],
            where: { workspaceId: ws, status: 'OPEN', assigneeId: { in: userIds } },
            _count: { _all: true },
          }),
          db.session.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _max: { createdAt: true, lastUsedAt: true },
          }),
        ])
      : [[], []];
    return rows.map((r) => {
      const sess = sessions.find((s) => s.userId === r.userId)?._max;
      const last = [sess?.createdAt, sess?.lastUsedAt]
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: r.id,
        userId: r.userId,
        role: r.role,
        status: r.status,
        name: r.user.name,
        email: r.user.email,
        teams: r.user.teamMemberships
          .filter((t) => t.team.workspaceId === ws)
          .map((t) => ({ id: t.team.id, name: t.team.name })),
        assignedOpenConversations: open.find((o) => o.assigneeId === r.userId)?._count._all ?? 0,
        lastSignInAt: last?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  private memberInclude = {
    user: {
      select: {
        name: true,
        email: true,
        teamMemberships: {
          select: { team: { select: { id: true, name: true, workspaceId: true } } },
        },
      },
    },
  } satisfies Prisma.WorkspaceMembershipInclude;

  async listMembers(ws: string, q: MemberQuery) {
    const db = this.prisma.client;
    const and: Prisma.WorkspaceMembershipWhereInput[] = [{ workspaceId: ws }];
    if (q.role) and.push({ role: q.role });
    if (q.status) and.push({ status: q.status });
    if (q.q)
      and.push({
        user: {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        },
      });
    if (q.team)
      and.push({
        user: { teamMemberships: { some: { teamId: q.team, team: { workspaceId: ws } } } },
      });
    const where: Prisma.WorkspaceMembershipWhereInput = { AND: and };
    const desc = q.sort?.startsWith('-');
    const field = q.sort?.replace(/^-/, '');
    const orderBy: Prisma.WorkspaceMembershipOrderByWithRelationInput[] =
      field === 'name'
        ? [{ user: { name: desc ? 'desc' : 'asc' } }]
        : field === 'role'
          ? [{ role: desc ? 'desc' : 'asc' }, { createdAt: 'asc' }]
          : [{ createdAt: desc ? 'desc' : 'asc' }];
    const [total, rows] = await Promise.all([
      db.workspaceMembership.count({ where }),
      db.workspaceMembership.findMany({
        where,
        orderBy,
        include: this.memberInclude,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: await this.decorate(ws, rows),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async getMember(ws: string, memberId: string) {
    const row = await this.prisma.client.workspaceMembership.findFirst({
      where: { id: memberId, workspaceId: ws },
      include: this.memberInclude,
    });
    if (!row) throw new NotFoundException('Member not found');
    const [m] = await this.decorate(ws, [row]);
    const resolved = await this.prisma.client.conversation.count({
      where: {
        workspaceId: ws,
        assigneeId: row.userId,
        status: 'RESOLVED',
        updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    });
    return { ...m!, resolvedLast30Days: resolved };
  }

  async memberActivity(ws: string, memberId: string) {
    await this.assertMember(ws, memberId);
    const rows = await this.prisma.client.auditLog.findMany({
      where: { workspaceId: ws, entityType: 'membership', entityId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, name: true } } },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        description: (r.metadata as { description?: string } | null)?.description ?? r.action,
        actor: r.actor,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async updateMember(ws: string, actor: Actor, memberId: string, input: UpdateMemberInput) {
    const target = await this.assertMember(ws, memberId);
    if (target.userId === actor.userId)
      throw new ForbiddenException('You cannot change your own role or access');
    if (!canManageMember(actor.role, target.role))
      throw new ForbiddenException('You are not allowed to manage this member');
    if (input.role && !assignableRoles(actor.role).includes(input.role))
      throw new ForbiddenException('You are not allowed to assign that role');
    const events: string[] = [];
    const who = await this.nameOf(target.userId);
    if (input.role && input.role !== target.role)
      events.push(`Role changed from ${ROLE_LABEL[target.role]} to ${ROLE_LABEL[input.role]}`);
    if (input.status && input.status !== target.status)
      events.push(input.status === 'SUSPENDED' ? 'Access suspended' : 'Access restored');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.workspaceMembership.update({
        where: { id: memberId },
        data: {
          ...(input.role && { role: input.role }),
          ...(input.status && { status: input.status }),
        },
      });
      for (const description of events)
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId: actor.userId,
            action: 'member.update',
            entityType: 'membership',
            entityId: memberId,
            metadata: { description: `${description} (${who})` },
          },
        });
    });
    return this.getMember(ws, memberId);
  }

  /** Removes the member from this workspace only. Their Inbox/lead/customer assignments are cleared so nothing stays owned by someone without access. */
  async removeMember(ws: string, actor: Actor, memberId: string) {
    const target = await this.assertMember(ws, memberId);
    if (target.userId === actor.userId) throw new ForbiddenException('You cannot remove yourself');
    if (!canManageMember(actor.role, target.role))
      throw new ForbiddenException('You are not allowed to remove this member');
    const who = await this.nameOf(target.userId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { workspaceId: ws, assigneeId: target.userId },
        data: { assigneeId: null },
      });
      await tx.lead.updateMany({
        where: { workspaceId: ws, ownerId: target.userId },
        data: { ownerId: null },
      });
      await tx.customer.updateMany({
        where: { workspaceId: ws, ownerId: target.userId },
        data: { ownerId: null },
      });
      await tx.team.updateMany({
        where: { workspaceId: ws, leadId: target.userId },
        data: { leadId: null },
      });
      await tx.teamMembership.deleteMany({
        where: { userId: target.userId, team: { workspaceId: ws } },
      });
      await tx.workspaceMembership.delete({ where: { id: memberId } });
      await tx.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: actor.userId,
          action: 'member.remove',
          entityType: 'membership',
          entityId: memberId,
          metadata: { description: `${who} removed from the workspace` },
        },
      });
    });
  }

  // ---------- invitations ----------

  private inviteDto(i: {
    id: string;
    email: string;
    role: WorkspaceRole;
    createdAt: Date;
    expiresAt: Date;
    team: { id: string; name: string } | null;
    invitedBy: { id: string; name: string } | null;
  }) {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      team: i.team,
      invitedBy: i.invitedBy,
      status: i.expiresAt > new Date() ? ('PENDING' as const) : ('EXPIRED' as const),
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    };
  }
  private inviteInclude = {
    team: { select: { id: true, name: true } },
    invitedBy: { select: { id: true, name: true } },
  } satisfies Prisma.InvitationInclude;

  async listInvitations(ws: string) {
    const rows = await this.prisma.client.invitation.findMany({
      where: { workspaceId: ws, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: this.inviteInclude,
    });
    return { data: rows.map((r) => this.inviteDto(r)) };
  }

  private inviteUrl(token: string) {
    return `${this.config.WEB_URL.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
  }

  async createInvitation(ws: string, actor: Actor, input: InvitationInput) {
    const role = input.role ?? 'AGENT';
    if (!assignableRoles(actor.role).includes(role))
      throw new ForbiddenException('You are not allowed to invite with that role');
    const email = input.email.toLowerCase();
    const db = this.prisma.client;
    if (
      input.teamId &&
      !(await db.team.findFirst({ where: { id: input.teamId, workspaceId: ws } }))
    )
      throw new BadRequestException('Team not found in this workspace');
    const existing = await db.workspaceMembership.findFirst({
      where: { workspaceId: ws, user: { email } },
    });
    if (existing) throw new ConflictException('This person is already a member of the workspace');
    const live = await db.invitation.findFirst({
      where: {
        workspaceId: ws,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (live)
      throw new ConflictException(
        'A pending invitation for this email already exists. Resend or cancel it instead.',
      );
    const token = randomBytes(32).toString('base64url');
    try {
      const inv = await db.$transaction(async (tx) => {
        // An expired-but-unrevoked invitation would violate the live-invite index: retire it first.
        await tx.invitation.updateMany({
          where: { workspaceId: ws, email, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const created = await tx.invitation.create({
          data: {
            workspaceId: ws,
            email,
            role,
            teamId: input.teamId ?? null,
            tokenHash: hashToken(token),
            invitedById: actor.userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
          include: this.inviteInclude,
        });
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId: actor.userId,
            action: 'invitation.create',
            entityType: 'invitation',
            entityId: created.id,
            metadata: { description: `Invited ${email} as ${ROLE_LABEL[role]}` },
          },
        });
        return created;
      });
      return { ...this.inviteDto(inv), inviteUrl: this.inviteUrl(token), emailSent: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('A pending invitation for this email already exists.');
      throw e;
    }
  }

  async resendInvitation(ws: string, actor: Actor, id: string) {
    const inv = await this.liveInvitation(ws, id);
    if (!assignableRoles(actor.role).includes(inv.role))
      throw new ForbiddenException('You are not allowed to manage this invitation');
    const token = randomBytes(32).toString('base64url');
    const updated = await this.prisma.client.invitation.update({
      where: { id },
      data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      include: this.inviteInclude,
    });
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId: actor.userId,
        action: 'invitation.resend',
        entityType: 'invitation',
        entityId: id,
        metadata: { description: `Resent invitation to ${inv.email}` },
      },
    });
    return { ...this.inviteDto(updated), inviteUrl: this.inviteUrl(token), emailSent: false };
  }

  async revokeInvitation(ws: string, actor: Actor, id: string) {
    const inv = await this.liveInvitation(ws, id);
    if (!assignableRoles(actor.role).includes(inv.role))
      throw new ForbiddenException('You are not allowed to manage this invitation');
    await this.prisma.client.$transaction([
      this.prisma.client.invitation.update({ where: { id }, data: { revokedAt: new Date() } }),
      this.prisma.client.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: actor.userId,
          action: 'invitation.revoke',
          entityType: 'invitation',
          entityId: id,
          metadata: { description: `Cancelled invitation to ${inv.email}` },
        },
      }),
    ]);
  }

  /** Public: lets the invitee see what they are joining. Possession of the token is the credential. */
  async previewInvitation(token: string) {
    const inv = await this.findByToken(token);
    const ws = await this.prisma.client.workspace.findUniqueOrThrow({
      where: { id: inv.workspaceId },
      select: { name: true },
    });
    return { email: inv.email, workspaceName: ws.name, role: inv.role };
  }

  /** Public: first-time invitee creates an account (email is taken from the invitation, not from the client). */
  async acceptForNewUser(token: string, name: string, password: string) {
    const inv = await this.findByToken(token);
    const db = this.prisma.client;
    if (await db.user.findUnique({ where: { email: inv.email } }))
      throw new ConflictException(
        'An account with this email already exists. Sign in, then accept the invitation.',
      );
    const passwordHash = await this.passwords.hash(password);
    await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('This invitation has already been used');
      const user = await tx.user.create({
        data: { email: inv.email, name, passwordHash, emailVerifiedAt: new Date() },
      });
      await this.join(tx, inv, user.id);
    });
    return { workspaceId: inv.workspaceId };
  }

  /** Authenticated: an existing account accepts, but only if its email matches the invitation. */
  async acceptForUser(token: string, userId: string) {
    const inv = await this.findByToken(token);
    const db = this.prisma.client;
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    if (user.email.toLowerCase() !== inv.email)
      throw new ForbiddenException('This invitation was sent to a different email address');
    await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('This invitation has already been used');
      await this.join(tx, inv, userId);
    });
    return { workspaceId: inv.workspaceId };
  }

  private async join(
    tx: Prisma.TransactionClient,
    inv: {
      id: string;
      workspaceId: string;
      role: WorkspaceRole;
      teamId: string | null;
      email: string;
    },
    userId: string,
  ) {
    const m = await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
      update: {},
      create: { workspaceId: inv.workspaceId, userId, role: inv.role },
    });
    if (inv.teamId)
      await tx.teamMembership.upsert({
        where: { teamId_userId: { teamId: inv.teamId, userId } },
        update: {},
        create: { teamId: inv.teamId, userId },
      });
    await tx.auditLog.create({
      data: {
        workspaceId: inv.workspaceId,
        actorId: userId,
        action: 'invitation.accept',
        entityType: 'membership',
        entityId: m.id,
        metadata: { description: `Joined as ${ROLE_LABEL[inv.role]} via invitation` },
      },
    });
  }

  private async findByToken(token: string) {
    const inv = await this.prisma.client.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    // One generic message so tokens cannot be probed for state.
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date())
      throw new NotFoundException('This invitation is invalid or has expired');
    return inv;
  }
  private async liveInvitation(ws: string, id: string) {
    const inv = await this.prisma.client.invitation.findFirst({
      where: { id, workspaceId: ws, acceptedAt: null, revokedAt: null },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    return inv;
  }

  // ---------- teams ----------

  private async teamDtos(ws: string, ids?: string[]) {
    const db = this.prisma.client;
    const teams = await db.team.findMany({
      where: { workspaceId: ws, ...(ids && { id: { in: ids } }) },
      orderBy: { name: 'asc' },
      include: {
        lead: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    const userIds = [...new Set(teams.flatMap((t) => t.members.map((m) => m.userId)))];
    const open = userIds.length
      ? await db.conversation.groupBy({
          by: ['assigneeId'],
          where: { workspaceId: ws, status: 'OPEN', assigneeId: { in: userIds } },
          _count: { _all: true },
        })
      : [];
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      lead: t.lead,
      members: t.members.map((m) => ({ userId: m.userId, name: m.user.name })),
      openConversations: t.members.reduce(
        (n, m) => n + (open.find((o) => o.assigneeId === m.userId)?._count._all ?? 0),
        0,
      ),
    }));
  }

  async listTeams(ws: string) {
    return { data: await this.teamDtos(ws) };
  }

  private async assertWorkspaceUsers(ws: string, userIds: string[]) {
    if (!userIds.length) return;
    const found = await this.prisma.client.workspaceMembership.count({
      where: { workspaceId: ws, userId: { in: userIds } },
    });
    if (found !== new Set(userIds).size)
      throw new BadRequestException('Every team member must belong to this workspace');
  }

  async createTeam(
    ws: string,
    actor: Actor,
    input: TeamInput & { memberIds: string[]; description: string },
  ) {
    const memberIds = [...new Set(input.memberIds)];
    await this.assertWorkspaceUsers(ws, [...memberIds, ...(input.leadId ? [input.leadId] : [])]);
    try {
      const team = await this.prisma.client.$transaction(async (tx) => {
        const t = await tx.team.create({
          data: {
            workspaceId: ws,
            name: input.name,
            description: input.description,
            leadId: input.leadId ?? null,
            members: { create: memberIds.map((userId) => ({ userId })) },
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId: actor.userId,
            action: 'team.create',
            entityType: 'team',
            entityId: t.id,
            metadata: { description: `Created team ${t.name}` },
          },
        });
        return t;
      });
      return (await this.teamDtos(ws, [team.id]))[0]!;
    } catch (e) {
      throw this.translateTeam(e);
    }
  }

  async updateTeam(ws: string, actor: Actor, id: string, input: UpdateTeamInput) {
    if (!(await this.prisma.client.team.findFirst({ where: { id, workspaceId: ws } })))
      throw new NotFoundException('Team not found');
    const memberIds = input.memberIds ? [...new Set(input.memberIds)] : undefined;
    await this.assertWorkspaceUsers(ws, [
      ...(memberIds ?? []),
      ...(input.leadId ? [input.leadId] : []),
    ]);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.team.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.leadId !== undefined && { leadId: input.leadId }),
          },
        });
        if (memberIds) {
          await tx.teamMembership.deleteMany({
            where: { teamId: id, userId: { notIn: memberIds } },
          });
          await tx.teamMembership.createMany({
            data: memberIds.map((userId) => ({ teamId: id, userId })),
            skipDuplicates: true,
          });
        }
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId: actor.userId,
            action: 'team.update',
            entityType: 'team',
            entityId: id,
            metadata: { description: 'Team updated' },
          },
        });
      });
    } catch (e) {
      throw this.translateTeam(e);
    }
    return (await this.teamDtos(ws, [id]))[0]!;
  }

  async deleteTeam(ws: string, actor: Actor, id: string) {
    const t = await this.prisma.client.team.findFirst({ where: { id, workspaceId: ws } });
    if (!t) throw new NotFoundException('Team not found');
    await this.prisma.client.$transaction([
      this.prisma.client.team.delete({ where: { id } }),
      this.prisma.client.auditLog.create({
        data: {
          workspaceId: ws,
          actorId: actor.userId,
          action: 'team.delete',
          entityType: 'team',
          entityId: id,
          metadata: { description: `Deleted team ${t.name}` },
        },
      }),
    ]);
  }

  // ---------- helpers ----------
  private async assertMember(ws: string, memberId: string) {
    const m = await this.prisma.client.workspaceMembership.findFirst({
      where: { id: memberId, workspaceId: ws },
    });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }
  private async nameOf(userId: string) {
    return (
      (await this.prisma.client.user.findUnique({ where: { id: userId }, select: { name: true } }))
        ?.name ?? 'member'
    );
  }
  private translateTeam(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return new ConflictException('A team with this name already exists');
    return e;
  }
}
