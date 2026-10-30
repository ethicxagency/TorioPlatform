import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { processJob } from '../processors';
import { defaultJobOptions } from '../queues';

const job = (name: string, data: unknown, attemptsMade = 0) =>
  ({ name, data, attemptsMade }) as unknown as Job;

describe('example job', () => {
  it('echoes the message', async () => {
    await expect(processJob(job('example.echo', { message: 'hi' }))).resolves.toEqual({
      echoed: 'hi',
      attempt: 1,
    });
  });

  it('fails the first attempt when asked, then succeeds on retry', async () => {
    await expect(processJob(job('example.echo', { message: 'x', failOnce: true }))).rejects.toThrow(
      /simulated/,
    );
    await expect(
      processJob(job('example.echo', { message: 'x', failOnce: true }, 1)),
    ).resolves.toBeTruthy();
  });

  it('rejects invalid payloads', async () => {
    await expect(processJob(job('example.echo', { message: 123 }))).rejects.toThrow();
  });

  it('rejects unknown job names', async () => {
    await expect(processJob(job('nope', {}))).rejects.toThrow(/No handler/);
  });

  it('retry policy uses exponential backoff', () => {
    expect(defaultJobOptions.attempts).toBe(5);
    expect(defaultJobOptions.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });
});
