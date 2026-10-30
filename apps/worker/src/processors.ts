import type { Job } from 'bullmq';
import { EXAMPLE_JOB } from './queues';
import { handleExample } from './jobs/example';

type Handler = (job: Job) => Promise<unknown>;

/** Job name -> handler. Add webhook/AI/notification/automation handlers here. */
export const handlers: Record<string, Handler> = {
  [EXAMPLE_JOB]: handleExample,
};

export async function processJob(job: Job): Promise<unknown> {
  const handler = handlers[job.name];
  if (!handler) throw new Error(`No handler registered for job "${job.name}"`);
  return handler(job);
}
