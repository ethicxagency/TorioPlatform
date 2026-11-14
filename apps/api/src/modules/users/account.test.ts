/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles stand in for the Prisma client */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { hashToken } from '../auth/auth.service';
import { UsersService } from './users.service';

const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function setup(over: Record<string, any> = {}, opts: { mail?: boolean; sendOk?: boolean } = {}) {
  const user: Record<string, any> = {
    id: U,
    email: 'nadia@example.com',
    name: 'Nadia',
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    phone: null,
    jobTitle: null,
    timeZone: null,
    landingPage: 'dashboard',
    image: 'https://lh3.googleusercontent.com/p',
    imageSource: 'PROVIDER',
    providerImage: 'https://lh3.googleusercontent.com/p',
    passwordHash: 'random-unusable',
    passwordSetAt: null,
    identities: [
      { provider: 'GOOGLE', email: 'nadia@example.com', createdAt: new Date('2026-01-02') },
    ],
    ...over,
  };
  const tokens: Record<string, any>[] = [];
  const sessions = [
    { id: 's-current', userId: U, familyId: 'f1', revokedAt: null as Date | null },
    { id: 's-other', userId: U, familyId: 'f2', revokedAt: null as Date | null },
  ];
  const audits: Record<string, any>[] = [];
  const mails: { to: string; subject: string; text: string }[] = [];
  const db: any = {
    user: {
      findUnique: async () => user,
      update: async ({ data }: any) => Object.assign(user, data),
    },
    emailToken: {
      findFirst: async ({ where }: any) =>
        [...tokens]
          .reverse()
          .find(
            (t) =>
              t.userId === where.userId &&
              t.type === where.type &&
              (where.usedAt === null ? t.usedAt === null : true) &&
              (!where.expiresAt || t.expiresAt > where.expiresAt.gt),
          ) ?? null,
      updateMany: async ({ where, data }: any) =>
        tokens
          .filter((t) => t.userId === where.userId && t.usedAt === null)
          .forEach((t) => Object.assign(t, data)),
      create: async ({ data }: any) => (
        tokens.push({
          id: `t${tokens.length + 1}`,
          attempts: 0,
          usedAt: null,
          createdAt: new Date(),
          ...data,
        }),
        tokens.at(-1)
      ),
      update: async ({ where, data }: any) => {
        const t = tokens.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries<any>(data))
          t[k] = v?.increment ? t[k] + v.increment : v;
        return t;
      },
    },
    session: {
      findFirst: async ({ where }: any) => sessions.find((s) => s.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const s of sessions)
          if (!s.revokedAt && s.familyId !== where.familyId?.not) {
            Object.assign(s, data);
            n++;
          }
        return { count: n };
      },
    },
    auditLog: { create: async ({ data }: any) => void audits.push(data) },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg)),
  };
  const mail = {
    configured: opts.mail ?? true,
    send: async (to: string, subject: string, text: string) => {
      mails.push({ to, subject, text });
      return opts.sendOk ?? true;
    },
  };
  const images = {
    process: async () => ({ bytes: Buffer.from('x'), width: 512, height: 512 }),
    save: async () => ({ id: 'img1', url: 'https://api.test/api/v1/images/img1' }),
    removed: [] as string[],
    remove: async function (k: string) {
      this.removed.push(k);
    },
  };
  const passwords = {
    hash: async (p: string) => `hash:${p}`,
    verify: async (h: string, p: string) => h === `hash:${p}`,
  };
  const svc = new UsersService(
    { client: db } as never,
    passwords as never,
    mail as never,
    images as never,
  );
  const code = () => /\b(\d{6})\b/.exec(mails.at(-1)!.text)![1]!;
  return { svc, user, tokens, sessions, audits, mails, images, code };
}
const set = (code: string, pw = 'Good-pass-123', confirm = pw) => ({
  code,
  newPassword: pw,
  confirmPassword: confirm,
});

describe('sign-in methods are derived from real state', () => {
  it('shows a social-only account as having no password, and what each provider holds (no tokens)', async () => {
    const t = setup();
    const p = await t.svc.getProfile(U);
    expect(p).toMatchObject({
      hasPassword: false,
      passwordSetAt: null,
      providers: ['GOOGLE'],
      imageSource: 'PROVIDER',
      hasProviderImage: true,
    });
    expect(p.identities).toEqual([
      { provider: 'GOOGLE', email: 'nadia@example.com', connectedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(JSON.stringify(p)).not.toMatch(/passwordHash|providerUserId|token/i);
    expect(
      (await setup({ passwordSetAt: new Date('2026-02-01') }).svc.getProfile(U)).hasPassword,
    ).toBe(true);
  });
});

describe('first password for a social-only account', () => {
  it('emails a 6-digit code (stored only as a hash) and then sets the password, keeping the social links and signing out other devices', async () => {
    const t = setup();
    expect(await t.svc.requestPasswordCode(U)).toEqual({ sent: true, expiresInMinutes: 10 });
    expect(t.mails[0]!.to).toBe('nadia@example.com');
    const code = t.code();
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(t.tokens)).not.toContain(code);
    expect(t.tokens[0]!.tokenHash).toBe(hashToken(`${U}:${code}`));
    const p = await t.svc.setPassword(U, 's-current', set(code));
    expect(p.hasPassword).toBe(true);
    expect(p.providers).toEqual(['GOOGLE']); // Google stays connected
    expect(t.user.passwordHash).toBe('hash:Good-pass-123'); // hashed, never plain
    expect(t.user.passwordSetAt).toBeInstanceOf(Date);
    expect(t.sessions.find((s) => s.id === 's-current')!.revokedAt).toBeNull();
    expect(t.sessions.find((s) => s.id === 's-other')!.revokedAt).not.toBeNull();
    expect(t.audits[0]).toMatchObject({ action: 'user.password_set', actorId: U });
    expect(JSON.stringify(t.audits)).not.toContain('Good-pass-123');
    // the code works once
    await expect(t.svc.setPassword(U, 's-current', set(code))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('refuses a wrong code, retires the code after five wrong guesses, and an expired one', async () => {
    const t = setup();
    await t.svc.requestPasswordCode(U);
    const good = t.code();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(t.svc.setPassword(U, 's-current', set(wrong))).rejects.toThrow(/not right/);
    await expect(t.svc.setPassword(U, 's-current', set(good))).rejects.toThrow(
      /Too many wrong codes/,
    );
    expect(t.user.passwordSetAt).toBeNull();
    const e = setup();
    await e.svc.requestPasswordCode(U);
    e.tokens[0]!.expiresAt = new Date(Date.now() - 1000);
    await expect(e.svc.setPassword(U, 's-current', set(e.code()))).rejects.toThrow(/expired/);
  });
  it('asks for a code at most once a minute, and only when email can be sent', async () => {
    const t = setup();
    await t.svc.requestPasswordCode(U);
    const e = await t.svc.requestPasswordCode(U).catch((x) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(429);
    await expect(setup({}, { mail: false }).svc.requestPasswordCode(U)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(setup({}, { sendOk: false }).svc.requestPasswordCode(U)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('does not offer a first password to an account that already has one, and never needs the old password', async () => {
    const t = setup({ passwordSetAt: new Date(), passwordHash: 'hash:Old-pass-1234' });
    await expect(t.svc.requestPasswordCode(U)).rejects.toBeInstanceOf(ConflictException);
    await expect(t.svc.setPassword(U, 's-current', set('123456'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Change password still verifies the current one and leaves the social links alone
    await t.svc.changePassword(U, 's-current', {
      currentPassword: 'Old-pass-1234',
      newPassword: 'New-pass-12345',
    });
    expect(t.user.passwordHash).toBe('hash:New-pass-12345');
    await expect(
      t.svc.changePassword(U, 's-current', {
        currentPassword: 'wrong-password',
        newPassword: 'Another-pass-1',
      }),
    ).rejects.toThrow(/current password is incorrect/);
    // ...and a social-only account is sent to Set password instead
    await expect(
      setup().svc.changePassword(U, 's-current', {
        currentPassword: 'x',
        newPassword: 'Good-pass-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('profile picture', () => {
  it('a custom upload wins, removing gives initials and blocks the provider picture, restoring brings the provider one back', async () => {
    const t = setup();
    let p = await t.svc.uploadAvatar(U, {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      size: 1,
    });
    expect(p).toMatchObject({
      image: 'https://api.test/api/v1/images/img1',
      imageSource: 'CUSTOM',
      hasProviderImage: true,
    });
    expect(t.user.providerImage).toBe('https://lh3.googleusercontent.com/p'); // remembered, so it can be restored
    p = await t.svc.useProviderAvatar(U);
    expect(p).toMatchObject({
      image: 'https://lh3.googleusercontent.com/p',
      imageSource: 'PROVIDER',
    });
    expect(t.images.removed).toContain('USER_AVATAR'); // the uploaded copy is deleted
    p = await t.svc.removeAvatar(U);
    expect(p).toMatchObject({ image: null, imageSource: 'NONE' });
    await expect(setup({ providerImage: null }).svc.useProviderAvatar(U)).rejects.toThrow(
      /no Google or Facebook picture/,
    );
  });
});
