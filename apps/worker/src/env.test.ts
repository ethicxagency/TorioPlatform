import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('worker env', () => {
  it('requires REDIS_URL', () => {
    expect(() => loadEnv({})).toThrowError(/REDIS_URL/);
  });
  it('parses defaults', () => {
    const e = loadEnv({ REDIS_URL: 'redis://localhost:6379' });
    expect(e.WORKER_CONCURRENCY).toBe(5);
    expect(e.WORKER_HEALTH_PORT).toBe(4100);
  });
});
