import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, registerSchema, slugify } from './index';

describe('auth contracts', () => {
  it('rejects weak passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase123').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassw0rd!').success).toBe(true);
  });

  it('normalises email on register', () => {
    const r = registerSchema.parse({
      name: 'A',
      email: '  USER@Example.COM ',
      password: 'GoodPassw0rd!',
      workspaceName: 'Shop',
    });
    expect(r.email).toBe('user@example.com');
  });

  it('login does not enforce complexity', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('slugify yields url-safe slug', () => {
    expect(slugify('Urban Nest!')).toBe('urban-nest');
    expect(slugify('!!!')).toBe('workspace');
  });
});
