import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/config.module';
import type { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import type { PlatformSettingsService } from '../platform/platform-settings.service';
import { PasswordService } from './password.service';

interface Row {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  [k: string]: unknown;
}

function setup() {
  const sessions: Row[] = [];
  const user = {
    id: 'u1',
    email: 'a@b.co',
    name: 'A',
    status: 'ACTIVE',
    passwordHash: '',
    emailVerifiedAt: null,
    createdAt: new Date(0),
  };
  const client = {
    user: {
      findUnique: async ({ where }: { where: { email?: string } }) =>
        where.email === user.email ? user : null,
    },
    auditLog: { create: async () => ({}) },
    session: {
      create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt'> }) => {
        const row = { ...data, id: `s${sessions.length + 1}`, revokedAt: null } as Row;
        sessions.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { refreshTokenHash: string } }) => {
        const s = sessions.find((x) => x.refreshTokenHash === where.refreshTokenHash);
        return s ? { ...s, user } : null;
      },
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const hit = sessions.filter(
          (s) =>
            (where.id === undefined || s.id === where.id) &&
            (where.familyId === undefined || s.familyId === where.familyId) &&
            (where.refreshTokenHash === undefined ||
              s.refreshTokenHash === where.refreshTokenHash) &&
            (where.revokedAt === undefined || s.revokedAt === where.revokedAt),
        );
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      },
    },
  };
  const config = { ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30 } as AppConfig;
  const passwords = new PasswordService();
  const jwt = new JwtService({ secret: 'k'.repeat(32) });
  const svc = new AuthService({ client } as unknown as PrismaService, passwords, jwt, config, {
    registrationOpen: async () => true,
  } as unknown as PlatformSettingsService);
  return { svc, sessions, user, passwords };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    ctx.user.passwordHash = await ctx.passwords.hash('GoodPassw0rd!');
  });

  it('rejects wrong password and unknown email with the same message', async () => {
    const wrong = await ctx.svc
      .login({ email: 'a@b.co', password: 'nope' }, {})
      .catch((e: Error) => e);
    const unknown = await ctx.svc
      .login({ email: 'x@b.co', password: 'nope' }, {})
      .catch((e: Error) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect((wrong as Error).message).toBe((unknown as Error).message);
  });

  it('stores only a hash of the refresh token', async () => {
    const s = await ctx.svc.login({ email: 'a@b.co', password: 'GoodPassw0rd!' }, {});
    expect(ctx.sessions).toHaveLength(1);
    expect(JSON.stringify(ctx.sessions)).not.toContain(s.refreshToken);
  });

  it('rotates refresh tokens and keeps the family', async () => {
    const first = await ctx.svc.login({ email: 'a@b.co', password: 'GoodPassw0rd!' }, {});
    const second = await ctx.svc.refresh(first.refreshToken, {});
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(ctx.sessions[0]?.revokedAt).toBeInstanceOf(Date);
    expect(ctx.sessions[1]?.familyId).toBe(ctx.sessions[0]?.familyId);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const first = await ctx.svc.login({ email: 'a@b.co', password: 'GoodPassw0rd!' }, {});
    const second = await ctx.svc.refresh(first.refreshToken, {});
    await expect(ctx.svc.refresh(first.refreshToken, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(ctx.svc.refresh(second.refreshToken, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout revokes the session', async () => {
    const s = await ctx.svc.login({ email: 'a@b.co', password: 'GoodPassw0rd!' }, {});
    await ctx.svc.logout(s.refreshToken);
    await expect(ctx.svc.refresh(s.refreshToken, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired sessions', async () => {
    const s = await ctx.svc.login({ email: 'a@b.co', password: 'GoodPassw0rd!' }, {});
    ctx.sessions[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(ctx.svc.refresh(s.refreshToken, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
