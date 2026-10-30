import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000, http://localhost:3001',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and parses lists', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
    expect(env.REDIS_REQUIRED).toBe(false);
  });

  it('fails fast on missing required vars and never prints values', () => {
    const secret = 'super-secret-short';
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: secret })).toThrowError(
      /JWT_ACCESS_SECRET/,
    );
    try {
      validateEnv({ ...base, JWT_ACCESS_SECRET: secret });
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL/);
  });

  it('rejects wildcard CORS', () => {
    expect(() => validateEnv({ ...base, CORS_ALLOWED_ORIGINS: '*' })).toThrowError(/wildcard/);
  });

  it('requires REDIS_URL when Redis is required', () => {
    expect(() => validateEnv({ ...base, REDIS_REQUIRED: 'true' })).toThrowError(/REDIS_URL/);
  });

  it('requires secure cookies in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrowError(/COOKIE_SECURE/);
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).COOKIE_SECURE,
    ).toBe(true);
  });
});
