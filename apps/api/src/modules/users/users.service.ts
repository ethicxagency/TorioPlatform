import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { ChangePasswordInput, SetPasswordInput, UpdateProfileInput } from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { hashToken } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
import { PasswordService } from '../auth/password.service';
import { ImagesService, type UploadedFile } from '../images/images.service';
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
  imageSource: string | null;
  providerImage: string | null;
  passwordSetAt: Date | null;
  identities?: { provider: 'GOOGLE' | 'FACEBOOK'; email: string | null; createdAt: Date }[];
};

const IDENTITY_SELECT = { provider: true, email: true, createdAt: true } as const;
const CODE_TTL_MS = 10 * 60_000;
const CODE_COOLDOWN_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly images: ImagesService,
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
      hasPassword: u.passwordSetAt !== null,
      passwordSetAt: u.passwordSetAt?.toISOString() ?? null,
      identities: (u.identities ?? []).map((i) => ({
        provider: i.provider,
        email: i.email,
        connectedAt: i.createdAt.toISOString(),
      })),
      imageSource: (u.imageSource === 'CUSTOM' ||
      u.imageSource === 'PROVIDER' ||
      u.imageSource === 'NONE'
        ? u.imageSource
        : null) as 'CUSTOM' | 'PROVIDER' | 'NONE' | null,
      hasProviderImage: !!u.providerImage,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { identities: { select: IDENTITY_SELECT } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.dto(user);
  }

  /** Only these personal fields can change here. Email, status and memberships are never touched. */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      include: { identities: { select: IDENTITY_SELECT } },
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
    if (!user.passwordSetAt)
      throw new BadRequestException('This account has no password yet. Set one first.');
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
  // ---------- first password for a social-only account ----------

  /**
   * Emails a 6-digit code to the account's own address. It is the proof of identity for choosing a first password, so it only goes
   * to an account that has none, expires in 10 minutes, can be asked for once a minute, and is stored only as a hash.
   */
  async requestPasswordCode(userId: string) {
    const db = this.prisma.client;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.passwordSetAt)
      throw new ConflictException('This account already has a password. Use Change password.');
    if (!this.mail.configured)
      throw new ServiceUnavailableException(
        'Email delivery isn’t set up for this Torio deployment, so a code can’t be sent.',
      );
    const last = await db.emailToken.findFirst({
      where: { userId, type: 'PASSWORD_SET_CODE' },
      orderBy: { createdAt: 'desc' },
    });
    const wait = last ? last.createdAt.getTime() + CODE_COOLDOWN_MS - Date.now() : 0;
    if (wait > 0)
      throw new HttpException(
        `Please wait ${Math.ceil(wait / 1000)} seconds before asking for another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.$transaction([
      db.emailToken.updateMany({
        where: { userId, type: 'PASSWORD_SET_CODE', usedAt: null },
        data: { usedAt: new Date() },
      }),
      db.emailToken.create({
        data: {
          userId,
          type: 'PASSWORD_SET_CODE',
          tokenHash: hashToken(`${userId}:${code}`),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      }),
    ]);
    const sent = await this.mail.send(
      user.email,
      'Your Torio code',
      `Hi ${user.name},\n\nYour code to set a password for your Torio account is ${code}. It works once and expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this message; nothing changes without the code.`,
    );
    if (!sent)
      throw new ServiceUnavailableException('The email could not be sent. Try again shortly.');
    return { sent: true as const, expiresInMinutes: CODE_TTL_MS / 60_000 };
  }

  /**
   * Sets the first password of an account that has none, after the emailed code. The social sign-ins stay linked, the account,
   * memberships and roles are untouched, and other devices are signed out like on any password change.
   */
  async setPassword(userId: string, currentSessionId: string, input: SetPasswordInput) {
    const db = this.prisma.client;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.passwordSetAt)
      throw new ConflictException('This account already has a password. Use Change password.');
    const row = await db.emailToken.findFirst({
      where: { userId, type: 'PASSWORD_SET_CODE', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new BadRequestException('That code has expired. Ask for a new one.');
    if (row.attempts >= CODE_MAX_ATTEMPTS) {
      await db.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      throw new BadRequestException('Too many wrong codes. Ask for a new one.');
    }
    if (row.tokenHash !== hashToken(`${userId}:${input.code}`)) {
      await db.emailToken.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('That code is not right.');
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    const current = await db.session.findFirst({ where: { id: currentSessionId, userId } });
    await db.$transaction(async (tx) => {
      await tx.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordSetAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null, ...(current && { familyId: { not: current.familyId } }) },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'user.password_set',
          entityType: 'user',
          entityId: userId,
          metadata: { description: 'A first password was set for a social sign-in account' },
        },
      });
    });
    return this.getProfile(userId);
  }

  // ---------- profile picture ----------

  /** A picture the person uploaded. It wins over the provider's, and later social sign-ins never overwrite it. */
  async uploadAvatar(userId: string, file: UploadedFile | undefined) {
    const processed = await this.images.process('USER_AVATAR', file);
    const saved = await this.images.save('USER_AVATAR', userId, processed, userId);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { image: saved.url, imageSource: 'CUSTOM' },
    });
    return this.getProfile(userId);
  }

  /** No picture: initials are shown, and a social sign-in will not bring one back until the person asks. */
  async removeAvatar(userId: string) {
    await this.images.remove('USER_AVATAR', userId);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { image: null, imageSource: 'NONE' },
    });
    return this.getProfile(userId);
  }

  /** Goes back to the picture Google or Facebook gave us, and deletes the uploaded one. */
  async useProviderAvatar(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.providerImage)
      throw new BadRequestException('There is no Google or Facebook picture to use.');
    await this.images.remove('USER_AVATAR', userId);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { image: user.providerImage, imageSource: 'PROVIDER' },
    });
    return this.getProfile(userId);
  }

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
