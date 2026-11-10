import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput, RegisterInput } from '@torio/contracts';
import { slugify } from '@torio/contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PlatformSettingsService } from '../platform/platform-settings.service';
import { PasswordService } from './password.service';

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: string;
  };
}

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly platform: PlatformSettingsService,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta): Promise<IssuedSession> {
    if (!(await this.platform.registrationOpen()))
      throw new ForbiddenException('New registrations are currently closed.');
    const existing = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await this.passwords.hash(input.password);
    const workspaceName = input.workspaceName ?? `${input.name.split(/\s+/)[0] || 'My'}'s workspace`;
    const slug = `${slugify(workspaceName)}-${randomBytes(3).toString('hex')}`;

    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const workspace = await tx.workspace.create({
        data: { name: workspaceName, slug, createdById: created.id },
      });
      await tx.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: created.id, role: 'OWNER' },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: created.id,
          action: 'auth.register',
          entityType: 'user',
          entityId: created.id,
          ipAddress: meta.ipAddress,
        },
      });
      return created;
    });

    return this.issueSession(user, randomUUID(), meta);
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<IssuedSession> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Invalid email or password');

    await this.prisma.client.auditLog.create({
      data: {
        actorId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ipAddress: meta.ipAddress,
      },
    });
    return this.issueSession(user, randomUUID(), meta);
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated (revoked) token is
   * treated as theft: the whole token family is revoked.
   */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedSession> {
    const session = await this.prisma.client.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      await this.prisma.client.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session expired');
    }

    // Atomic claim: only one concurrent request can revoke this row.
    const claimed = await this.prisma.client.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Invalid refresh token');

    return this.issueSession(session.user, session.familyId, meta);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.client.session.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Starts a session for an already-authenticated user (password, or a verified social identity). */
  issueFor(
    user: Parameters<AuthService['issueSession']>[0],
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    return this.issueSession(user, randomUUID(), meta);
  }

  /**
   * Creates a customer with their own workspace, exactly like password registration, for sign-in methods that have
   * no password of their own: the stored hash is of random bytes nobody holds, so password login can never match.
   */
  async createCustomer(
    input: {
      email: string;
      name: string;
      workspaceName: string;
      emailVerified: boolean;
      provider?: string;
    },
    meta: ClientMeta,
  ) {
    const passwordHash = await this.passwords.hash(randomBytes(32).toString('base64url'));
    const slug = `${slugify(input.workspaceName)}-${randomBytes(3).toString('hex')}`;
    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          emailVerifiedAt: input.emailVerified ? new Date() : null,
        },
      });
      const workspace = await tx.workspace.create({
        data: { name: input.workspaceName, slug, createdById: created.id },
      });
      await tx.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: created.id, role: 'OWNER' },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: created.id,
          action: 'auth.register',
          entityType: 'user',
          entityId: created.id,
          ipAddress: meta.ipAddress,
          metadata: input.provider ? { provider: input.provider } : undefined,
        },
      });
      return created;
    });
  }

  private async issueSession(
    user: {
      id: string;
      email: string;
      name: string;
      emailVerifiedAt: Date | null;
      createdAt: Date;
    },
    familyId: string,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const session = await this.prisma.client.session.create({
      data: {
        userId: user.id,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300),
        ipAddress: meta.ipAddress,
        expiresAt: refreshExpiresAt,
      },
    });
    const expiresIn = this.config.ACCESS_TOKEN_TTL_SECONDS;
    const accessToken = await this.jwt.signAsync({ sub: user.id, sid: session.id }, { expiresIn });
    return {
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerifiedAt !== null,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
