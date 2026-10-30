import { type JobsOptions, Queue } from 'bullmq';
import type Redis from 'ioredis';
import { QUEUES } from '@torio/types';

/**
 * Default retry policy for every job: 5 attempts with exponential backoff
 * (2s, 4s, 8s, 16s). Completed jobs are trimmed; failed jobs are kept for
 * inspection (the "dead letter" set) for 7 days.
 *
 * IDEMPOTENCY: handlers may run more than once (retries, stalled-job recovery).
 * Producers should pass a deterministic `jobId` derived from the business event
 * (e.g. `webhook:${provider}:${eventId}`) so duplicate enqueues collapse, and
 * handlers must make their side effects safe to repeat.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const createQueue = (name: string, connection: Redis) =>
  new Queue(name, { connection, defaultJobOptions });

export const SYSTEM_QUEUE = QUEUES.system;
export const EXAMPLE_JOB = 'example.echo';
