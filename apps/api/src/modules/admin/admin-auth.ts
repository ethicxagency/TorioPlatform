import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AdminAudit } from './admin-audit.service';

export const ADMIN_COOKIE = 'torio_admin';
export const ADMIN_COOKIE_PATH = '/api/v1/admin';
const SESSION_HOURS = 8;
/** State-changing admin requests must carry this header. Browsers can't add it cross-site without a CORS preflight. */
export const ADMIN_HEADER = 'x-torio-admin';

export interface AdminContext {
  id: string;
  email: string;
  name: string;
  role: string;
  sessionId: string;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminContext => {
    const a = ctx.switchToHttp().getRequest<Request>().admin;
    if (!a) throw new Error('CurrentAdmin used on a route without admin authentication');
    return a;
  },
);

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const cookieOf = (req: Request) =>
  (req.cookies as Record<string, string> | undefined)?.[ADMIN_COOKIE];

/**
 * Authorises every /admin route from a server-side session. Admin accounts are a separate table from customers, the
 * token is an opaque cookie (not a customer JWT), and nothing the client sends can grant admin rights. The customer
 * JwtAuthGuard doesn't recognise this cookie, and this guard ignores customer tokens, so neither can stand in for
 * the other.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = cookieOf(req);
    if (!token) throw new UnauthorizedException('Admin sign-in required');
    const s = await this.prisma.client.adminSession.findUnique({
      where: { tokenHash: hash(token) },
      include: { admin: true },
    });
    if (
      !s ||
      s.revokedAt ||
      s.expiresAt <= new Date() ||
      !s.admin.isActive ||
      s.admin.role !== 'SUPER_ADMIN'
    )
      throw new UnauthorizedException('Admin sign-in required');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers[ADMIN_HEADER] !== '1')
      throw new ForbiddenException('Missing admin request header');
    req.admin = {
      id: s.admin.id,
      email: s.admin.email,
      name: s.admin.name,
      role: s.admin.role,
      sessionId: s.id,
    };
    await this.prisma.client.adminSession.update({
      where: { id: s.id },
      data: { lastUsedAt: new Date() },
    });
    return true;
  }
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AdminAudit,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; ua?: string }, res: Response) {
    const admin = await this.prisma.client.platformAdmin.findUnique({ where: { email } });
    if (!admin) await this.passwords.verifyDummy(password);
    const ok = admin ? await this.passwords.verify(admin.passwordHash, password) : false;
    if (!admin || !ok || !admin.isActive) {
      await this.audit.log({ adminEmail: email, action: 'admin.login_failed', ip: meta.ip });
      throw new UnauthorizedException('Invalid email or password');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.adminSession.create({
        data: {
          adminId: admin.id,
          tokenHash: hash(token),
          ipAddress: meta.ip,
          userAgent: meta.ua?.slice(0, 300),
          expiresAt,
        },
      });
      await tx.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
      await this.audit.log(
        { admin: { id: admin.id, email: admin.email }, action: 'admin.login', ip: meta.ip },
        tx,
      );
    });
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.COOKIE_SECURE,
      path: ADMIN_COOKIE_PATH,
      expires: expiresAt,
    });
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  }

  async logout(req: Request, res: Response) {
    const token = cookieOf(req);
    if (token) {
      const s = await this.prisma.client.adminSession.findUnique({
        where: { tokenHash: hash(token) },
        include: { admin: true },
      });
      if (s && !s.revokedAt) {
        await this.prisma.client.adminSession.update({
          where: { id: s.id },
          data: { revokedAt: new Date() },
        });
        await this.audit.log({
          admin: { id: s.admin.id, email: s.admin.email },
          action: 'admin.logout',
          ip: req.ip,
        });
      }
    }
    res.clearCookie(ADMIN_COOKIE, { path: ADMIN_COOKIE_PATH });
  }

  async changePassword(a: AdminContext, current: string, next: string, ip?: string) {
    const admin = await this.prisma.client.platformAdmin.findUniqueOrThrow({ where: { id: a.id } });
    if (!(await this.passwords.verify(admin.passwordHash, current)))
      throw new ForbiddenException('Your current password is incorrect');
    const passwordHash = await this.passwords.hash(next);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.platformAdmin.update({ where: { id: a.id }, data: { passwordHash } });
      await tx.adminSession.updateMany({
        where: { adminId: a.id, revokedAt: null, id: { not: a.sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ admin: a, action: 'admin.password_change', ip }, tx);
    });
  }

  async updateName(a: AdminContext, name: string, ip?: string) {
    await this.prisma.client.platformAdmin.update({ where: { id: a.id }, data: { name } });
    await this.audit.log({ admin: a, action: 'admin.profile_update', ip });
    return { id: a.id, email: a.email, name, role: a.role };
  }
}
