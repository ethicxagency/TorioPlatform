import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { createLogger } from './logger';
import { defaultJobOptions, EXAMPLE_JOB, SYSTEM_QUEUE } from './queues';
import { startWorkers } from './worker';

/** Needs a real Redis: set TEST_REDIS_URL (e.g. redis://localhost:6379). Skipped otherwise. */
const url = process.env.TEST_REDIS_URL;

describe.skipIf(!url)('worker against real Redis', () => {
  const connection = url ? new Redis(url, { maxRetriesPerRequest: null }) : undefined;
  const env = loadEnv({
    REDIS_URL: url ?? 'redis://x',
    WORKER_HEALTH_PORT: '4199',
    LOG_LEVEL: 'silent',
  });
  const running = url ? startWorkers(env, createLogger('silent')) : undefined;
  afterAll(async () => {
    await running?.shutdown();
    connection?.disconnect();
  });

  it('processes an example job, retrying after a simulated failure', async () => {
    const queue = new Queue(SYSTEM_QUEUE, {
      connection: connection!,
      defaultJobOptions: { ...defaultJobOptions, backoff: { type: 'fixed', delay: 50 } },
    });
    const events = new QueueEvents(SYSTEM_QUEUE, { connection: connection!.duplicate() });
    const job = await queue.add(EXAMPLE_JOB, { message: 'integration', failOnce: true });
    const result = await job.waitUntilFinished(events, 10_000);
    expect(result).toEqual({ echoed: 'integration', attempt: 2 });
    await events.close();
    await queue.close();
  });

  it('exposes a healthy /health endpoint', async () => {
    await new Promise((r) => setTimeout(r, 300));
    const res = await fetch('http://localhost:4199/health');
    expect(res.status).toBe(200);
  });
});
