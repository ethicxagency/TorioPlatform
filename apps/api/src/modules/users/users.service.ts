import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ChangePasswordInput, UpdateProfileInput } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/password.service';
import { describeDevice } from './device';

type UserRow = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  phone: string | null;
  jobTitle: string | null;
  timeZone: string | null;
  landingPage: string;
  image: string | null;
  identities?: { provider: 'GOOGLE' | 'FACEBOOK' }[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  private dto(u: UserRow) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerifiedAt !== null,
      createdAt: u.createdAt.toISOString(),
      phone: u.phone,
      jobTitle: u.jobTitle,
      timeZone: u.timeZone,
      landingPage: u.landingPage as 'dashboard' | 'inbox' | 'leads' | 'customers' | 'orders',
      image: u.image,
      providers: [...new Set((u.identities ?? []).map((i) => i.provider))],
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { identities: { select: { provider: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.dto(user);
  }

  /** Only these personal fields can change here. Email, status and memberships are never touched. */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      include: { identities: { select: { provider: true } } },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.jobTitle !== undefined && { jobTitle: input.jobTitle }),
        ...(input.timeZone !== undefined && { timeZone: input.timeZone }),
        ...(input.landingPage !== undefined && { landingPage: input.landingPage }),
      },
    });
    return this.dto(user);
  }

  /**
   * Verifies the current password, stores the new hash, and signs out every other device. The current session
   * stays. Existing access tokens on other devices stop working at their next refresh (≤ access-token lifetime).
   */
  async changePassword(userId: string, currentSessionId: string, input: ChangePasswordInput) {
    const db = this.prisma.client;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword)))
      // 400, not 401: a 401 makes clients treat it as an expired session and silently retry the request.
      throw new BadRequestException('Your current password is incorrect');
    const passwordHash = await this.passwords.hash(input.newPassword);
    const current = await db.session.findFirst({ where: { id: currentSessionId, userId } });
    const revoked = await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      const r = await tx.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(current && { familyId: { not: current.familyId } }),
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'user.password_change',
          entityType: 'user',
          entityId: userId,
          metadata: { description: 'Password changed; other devices were signed out' },
        },
      });
      return r.count;
    });
    return { revoked };
  }

  /** One row per signed-in device (token family). Raw tokens and hashes are never returned. */
  async sessions(userId: string, currentSessionId: string) {
    const cur = await this.prisma.client.session.findFirst({
      where: { id: currentSessionId, userId },
      select: { familyId: true },
    });
    const rows = await this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const byFamily = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byFamily.has(r.familyId)) byFamily.set(r.familyId, r);
    const familyCreated = await this.prisma.client.session.groupBy({
      by: ['familyId'],
      where: { userId, familyId: { in: [...byFamily.keys()] } },
      _min: { createdAt: true },
    });
    const first = new Map(familyCreated.map((f) => [f.familyId, f._min.createdAt]));
    return {
      data: [...byFamily.values()].map((r) => ({
        id: r.id,
        device: describeDevice(r.userAgent),
        ipAddress: r.ipAddress,
        createdAt: (first.get(r.familyId) ?? r.createdAt).toISOString(),
        lastActiveAt: (r.lastUsedAt ?? r.createdAt).toISOString(),
        current: !!cur && r.familyId === cur.familyId,
      })),
    };
  }

  async revokeSession(userId: string, currentSessionId: string, sessionId: string) {
    const db = this.prisma.client;
    const s = await db.session.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
    if (!s) throw new NotFoundException('Session not found');
    const current = await db.session.findFirst({ where: { id: currentSessionId, userId } });
    if (current && current.familyId === s.familyId)
      throw new BadRequestException('This is the device you’re using. Sign out instead.');
    const r = await db.session.updateMany({
      where: { userId, familyId: s.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (r.count === 0) throw new ConflictException('That session was already signed out');
    return this.sessions(userId, currentSessionId);
  }

  async revokeOthers(userId: string, currentSessionId: string) {
    const db = this.prisma.client;
    const current = await db.session.findFirst({ where: { id: currentSessionId, userId } });
    const r = await db.session.updateMany({
      where: { userId, revokedAt: null, ...(current && { familyId: { not: current.familyId } }) },
      data: { revokedAt: new Date() },
    });
    return { revoked: r.count };
  }

  /** The caller's own account data. Excludes password hashes, tokens and other people’s records. */
  async exportData(userId: string, currentSessionId: string) {
    const db = this.prisma.client;
    const [user, memberships, sessions] = await Promise.all([
      this.getProfile(userId),
      db.workspaceMembership.findMany({
        where: { userId },
        include: { workspace: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.sessions(userId, currentSessionId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      workspaces: memberships.map((m) => ({
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
        status: m.status,
        joinedAt: m.createdAt.toISOString(),
      })),
      signedInDevices: sessions.data.map(({ id, ...rest }) => (void id, rest)),
    };
  }
}
