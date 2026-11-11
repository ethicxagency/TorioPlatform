import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { AdminAudit } from '../admin/admin-audit.service';
import type { AdminContext } from '../admin/admin-auth';
import { hashToken } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
import { randomToken } from '../auth/oauth-cookie';
import { PasswordService } from '../auth/password.service';

const TOKEN_TTL_MS = 24 * 3_600_000;
const RESEND_COOLDOWN_MS = 60_000;
const ACTIVE = ['PENDING_VERIFICATION', 'VERIFIED', 'PROCESSING'] as const;

const newReference = () => {
  const r = randomBytes(10).toString('hex').toUpperCase();
  return `TDR-${r.slice(0, 5)}-${r.slice(5, 10)}-${r.slice(10, 15)}-${r.slice(15)}`;
};
const mask = (email: string) => {
  const [l = '', d = ''] = email.split('@');
  return `${l.slice(0, 1)}***@${d}`;
};

/**
 * Account deletion. Ownership is always proven first: either the signed-in session plus the account password, or a
 * single-use link emailed to the account's own address, so typing someone else's email can never delete their account.
 * Completed deletions anonymize the user row (history keeps valid references) and remove everything that grants access.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly audit: AdminAudit,
    @Inject(APP_CONFIG) private readonly c: AppConfig,
  ) {}

  private log(
    userId: string | null,
    action: string,
    ip?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.client.auditLog.create({
      data: { actorId: userId, action, entityType: 'account_deletion', ipAddress: ip, metadata },
    });
  }

  private active(userId: string) {
    return this.prisma.client.accountDeletionRequest.findFirst({
      where: { userId, status: { in: [...ACTIVE] } },
    });
  }

  private async sendLink(req: { id: string; email: string }, name: string) {
    const token = randomToken(32);
    await this.prisma.client.accountDeletionRequest.update({
      where: { id: req.id },
      data: { tokenHash: hashToken(token), tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });
    const sent = await this.mail.send(
      req.email,
      'Confirm your Torio account deletion request',
      `Hi ${name},\n\nWe received a request to permanently delete your Torio account. To confirm it was you, open:\n${this.c.WEB_URL.replace(/\/$/, '')}/delete-account?token=${token}\n\nThe link works once and expires in 24 hours. If you didn't ask for this, ignore this message: nothing will be deleted.`,
    );
    if (!sent)
      throw new ServiceUnavailableException(
        'The confirmation email could not be sent. Try again shortly.',
      );
  }

  /** Visitor submits an email: the answer never says whether an account exists. A request exists only for a real account. */
  async requestByEmail(email: string, reason: string | undefined, ip?: string) {
    if (!this.mail.configured)
      throw new ServiceUnavailableException(
        'Email delivery isn’t set up for this Torio deployment, so a verification link can’t be sent. Sign in and request deletion from your account, or contact support.',
      );
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE') {
      const existing = await this.active(user.id);
      if (existing?.status === 'PENDING_VERIFICATION') {
        // One active request: re-send the link (not more often than the cooldown) instead of creating another.
        if (Date.now() - existing.updatedAt.getTime() >= RESEND_COOLDOWN_MS)
          await this.sendLink(existing, user.name);
      } else if (!existing) {
        let created;
        try {
          created = await this.prisma.client.accountDeletionRequest.create({
            data: {
              reference: newReference(),
              userId: user.id,
              email: user.email,
              reason: reason || null,
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002')
            return { verificationSent: true, reference: null, status: null };
          throw e;
        }
        await this.sendLink(created, user.name);
        await this.log(user.id, 'account.deletion.requested', ip, { via: 'email' });
      }
    }
    return { verificationSent: true, reference: null, status: null };
  }

  /** A signed-in customer. The password confirms it is really them; without it the emailed link is used instead. */
  async requestSignedIn(
    userId: string,
    input: { password?: string; reason?: string },
    ip?: string,
  ) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await this.active(userId);
    if (existing)
      return { verificationSent: false, reference: existing.reference, status: existing.status };
    if (!input.password) {
      if (!this.mail.configured)
        throw new ServiceUnavailableException(
          'Email delivery isn’t set up, so confirm with your password instead.',
        );
      const created = await this.prisma.client.accountDeletionRequest.create({
        data: {
          reference: newReference(),
          userId,
          email: user.email,
          reason: input.reason || null,
        },
      });
      await this.sendLink(created, user.name);
      await this.log(userId, 'account.deletion.requested', ip, { via: 'email' });
      return { verificationSent: true, reference: null, status: null };
    }
    if (!(await this.passwords.verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('That password is not correct.');
    const created = await this.prisma.client.accountDeletionRequest.create({
      data: {
        reference: newReference(),
        userId,
        email: user.email,
        reason: input.reason || null,
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
    await this.log(userId, 'account.deletion.requested', ip, { via: 'password' });
    return { verificationSent: false, reference: created.reference, status: created.status };
  }

  /** The emailed link: single use, expiring. Only now does the request exist for the customer to see. */
  async verify(token: string, ip?: string) {
    const row = await this.prisma.client.accountDeletionRequest.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !row ||
      row.status !== 'PENDING_VERIFICATION' ||
      !row.tokenExpiresAt ||
      row.tokenExpiresAt <= new Date()
    )
      throw new BadRequestException('This confirmation link is invalid or has expired.');
    const claimed = await this.prisma.client.accountDeletionRequest.updateMany({
      where: { id: row.id, status: 'PENDING_VERIFICATION', tokenHash: row.tokenHash },
      data: { status: 'VERIFIED', verifiedAt: new Date(), tokenHash: null, tokenExpiresAt: null },
    });
    if (claimed.count !== 1)
      throw new BadRequestException('This confirmation link is invalid or has expired.');
    await this.log(row.userId, 'account.deletion.verified', ip);
    return { reference: row.reference, status: 'VERIFIED' as const };
  }

  /** Only the caller's own requests. Requests still waiting for the emailed confirmation are not shown: they do not exist for the customer yet. */
  async mine(userId: string) {
    const rows = await this.prisma.client.accountDeletionRequest.findMany({
      where: { userId, status: { not: 'PENDING_VERIFICATION' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      data: rows.map((r) => ({
        type: 'ACCOUNT_DELETION' as const,
        reference: r.reference,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
        rejectionReason: r.status === 'REJECTED' ? r.rejectionReason : null,
      })),
    };
  }

  async statusOf(reference: string) {
    const r = await this.prisma.client.accountDeletionRequest.findUnique({ where: { reference } });
    if (!r) throw new NotFoundException('No request with that reference.');
    return {
      reference: r.reference,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      rejectionReason: r.status === 'REJECTED' ? r.rejectionReason : null,
    };
  }

  // ----- Super Admin -----

  async list(status?: string) {
    const rows = await this.prisma.client.accountDeletionRequest.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        email: r.email,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        processedAt: r.processedAt?.toISOString() ?? null,
        rejectionReason: r.rejectionReason,
        summary: (r.summary as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  async reject(admin: AdminContext, id: string, reason: string, ip?: string) {
    const r = await this.prisma.client.accountDeletionRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (r.status === 'COMPLETED' || r.status === 'REJECTED' || r.status === 'PROCESSING')
      throw new ConflictException(`A ${r.status.toLowerCase()} request can’t be rejected.`);
    await this.prisma.client.accountDeletionRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        processedAt: new Date(),
        processedById: admin.id,
        tokenHash: null,
        tokenExpiresAt: null,
      },
    });
    await this.audit.log({
      admin,
      action: 'account.deletion.reject',
      targetType: 'account_deletion_request',
      targetId: id,
      ip,
      metadata: { reference: r.reference },
    });
    return this.list();
  }

  /**
   * Carries out a verified request. Refused (rejected with a reason, nothing changed) while the customer owns a
   * workspace that still has other active members: that workspace belongs to them too, so ownership is transferred first.
   */
  async process(admin: AdminContext, id: string, ip?: string) {
    const r = await this.prisma.client.accountDeletionRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (r.status !== 'VERIFIED')
      throw new ConflictException('Only a verified request can be processed.');
    if (!r.userId) throw new BadRequestException('This request has no account to delete.');
    const userId = r.userId;
    const claimed = await this.prisma.client.accountDeletionRequest.updateMany({
      where: { id, status: 'VERIFIED' },
      data: { status: 'PROCESSING', processedById: admin.id },
    });
    if (claimed.count !== 1)
      throw new ConflictException('This request is already being processed.');
    try {
      const owned = await this.prisma.client.workspaceMembership.findMany({
        where: { userId, role: 'OWNER', status: 'ACTIVE' },
        select: { workspaceId: true },
      });
      for (const o of owned) {
        const others = await this.prisma.client.workspaceMembership.count({
          where: { workspaceId: o.workspaceId, userId: { not: userId }, status: 'ACTIVE' },
        });
        if (others > 0) {
          await this.prisma.client.accountDeletionRequest.update({
            where: { id },
            data: {
              status: 'REJECTED',
              rejectionReason:
                'This account owns a workspace that other people still use. Transfer ownership or remove the other members first, then submit a new request.',
              processedAt: new Date(),
            },
          });
          await this.audit.log({
            admin,
            action: 'account.deletion.reject',
            targetType: 'account_deletion_request',
            targetId: id,
            ip,
            metadata: { reference: r.reference, reason: 'owner_with_members' },
          });
          return this.list();
        }
      }
      const summary = await this.execute(userId, r.email);
      await this.prisma.client.accountDeletionRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          email: mask(r.email),
          reason: null,
          summary,
        },
      });
      await this.audit.log({
        admin,
        action: 'account.deletion.complete',
        targetType: 'account_deletion_request',
        targetId: id,
        ip,
        metadata: { reference: r.reference, ...summary },
      });
      await this.mail.send(
        r.email,
        'Your Torio account was deleted',
        `Your Torio account deletion (reference ${r.reference}) is complete. Access to the account has been removed and personal information deleted or anonymized according to our retention policy.`,
      );
    } catch (e) {
      // Nothing is left half-done: processing runs in one transaction, so the request returns to VERIFIED to retry.
      await this.prisma.client.accountDeletionRequest.update({
        where: { id },
        data: { status: 'VERIFIED' },
      });
      throw new HttpException(
        `Processing failed and was rolled back: ${e instanceof Error ? e.message : 'unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.list();
  }

  private execute(userId: string, email: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const sole = await tx.workspaceMembership.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { workspaceId: true },
      });
      const soleIds: string[] = [];
      for (const m of sole) {
        const others = await tx.workspaceMembership.count({
          where: { workspaceId: m.workspaceId, userId: { not: userId }, status: 'ACTIVE' },
        });
        if (others === 0) soleIds.push(m.workspaceId);
      }
      // Workspaces nobody else uses lose their live integrations: channels are disconnected and their tokens deleted.
      const channels = soleIds.length
        ? await tx.channel.updateMany({
            where: { workspaceId: { in: soleIds }, status: { not: 'DISCONNECTED' } },
            data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
          })
        : { count: 0 };
      const creds = soleIds.length
        ? await tx.channelCredential.deleteMany({ where: { workspaceId: { in: soleIds } } })
        : { count: 0 };
      const sessions = await tx.session.deleteMany({ where: { userId } });
      const identities = await tx.userIdentity.deleteMany({ where: { userId } });
      await tx.emailToken.deleteMany({ where: { userId } });
      await tx.pendingSocialSignup.deleteMany({ where: { email } });
      await tx.invitation.updateMany({
        where: { email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.teamMembership.deleteMany({ where: { userId } });
      const memberships = await tx.workspaceMembership.deleteMany({ where: { userId } });
      const random = await this.passwords.hash(randomBytes(32).toString('base64url'));
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.torio.invalid`,
          name: 'Deleted user',
          passwordHash: random,
          phone: null,
          jobTitle: null,
          timeZone: null,
          status: 'DISABLED',
          emailVerifiedAt: null,
          suspendedReason: 'Account deleted at the customer’s request',
        },
      });
      return {
        sessionsRevoked: sessions.count,
        identitiesRemoved: identities.count,
        membershipsRemoved: memberships.count,
        channelsDisconnected: channels.count,
        channelCredentialsDeleted: creds.count,
        workspacesWithNoOtherMembers: soleIds.length,
      };
    });
  }
}
