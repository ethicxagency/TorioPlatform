import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { hashToken } from './auth.service';
import { MailService } from './mail.service';
import { randomToken } from './oauth-cookie';
import { PasswordService } from './password.service';

const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 60 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;

/** Email verification and password reset. Tokens are random, stored only as hashes, single-use and expiring. */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly c: AppConfig,
  ) {}

  private link(path: string, token: string) {
    return `${this.c.WEB_URL.replace(/\/$/, '')}${path}?token=${token}`;
  }

  private async issue(userId: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttl: number) {
    const token = randomToken(32);
    await this.prisma.client.$transaction([
      // Only the newest link works: older unused ones are retired.
      this.prisma.client.emailToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.client.emailToken.create({
        data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttl) },
      }),
    ]);
    return token;
  }

  /** Sends the verification email. Returns false when email isn't configured or the provider refused. */
  async sendVerification(userId: string): Promise<boolean> {
    if (!this.mail.configured) return false;
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return false;
    const token = await this.issue(userId, 'EMAIL_VERIFICATION', VERIFY_TTL_MS);
    return this.mail.send(
      user.email,
      'Verify your email for Torio',
      `Hi ${user.name},\n\nConfirm this email address to finish setting up your Torio account:\n${this.link('/verify-email', token)}\n\nThe link works once and expires in 24 hours. If you didn't create an account, ignore this message.`,
    );
  }

  async resendVerification(userId: string) {
    if (!this.mail.configured)
      throw new ServiceUnavailableException(
        'Email delivery isn’t set up for this Torio deployment.',
      );
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    const last = await this.prisma.client.emailToken.findFirst({
      where: { userId, type: 'EMAIL_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
    });
    const wait = last ? last.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now() : 0;
    if (wait > 0)
      throw new HttpException(
        `Please wait ${Math.ceil(wait / 1000)} seconds before asking for another email.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const sent = await this.sendVerification(userId);
    if (!sent)
      throw new ServiceUnavailableException('The email could not be sent. Try again shortly.');
    return { sent: true, alreadyVerified: false };
  }

  async verifyEmail(token: string, ip?: string) {
    const row = await this.prisma.client.emailToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.type !== 'EMAIL_VERIFICATION' || row.usedAt || row.expiresAt <= new Date())
      throw new BadRequestException('This verification link is invalid or has expired.');
    await this.prisma.client.$transaction([
      this.prisma.client.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.client.user.updateMany({
        where: { id: row.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.client.auditLog.create({
        data: {
          actorId: row.userId,
          action: 'auth.email_verified',
          entityType: 'user',
          entityId: row.userId,
          ipAddress: ip,
        },
      }),
    ]);
    return { verified: true as const };
  }

  /** Always the same outcome, so the response never reveals whether the email belongs to an account. */
  async forgotPassword(email: string) {
    if (!this.mail.configured) return;
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;
    const token = await this.issue(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
    await this.mail.send(
      user.email,
      'Reset your Torio password',
      `We received a request to reset your Torio password:\n${this.link('/reset-password', token)}\n\nThe link works once and expires in 1 hour. If you didn't ask for this, ignore this message; your password hasn't changed.`,
    );
  }

  async resetPassword(token: string, password: string, ip?: string) {
    const row = await this.prisma.client.emailToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!row || row.type !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt <= new Date())
      throw new BadRequestException('This reset link is invalid or has expired.');
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.client.$transaction([
      this.prisma.client.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.client.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      // Every signed-in device is signed out: whoever knew the old password loses access.
      this.prisma.client.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.client.auditLog.create({
        data: {
          actorId: row.userId,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: row.userId,
          ipAddress: ip,
        },
      }),
    ]);
    return { reset: true as const };
  }
}
