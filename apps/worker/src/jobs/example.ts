import type { Job } from 'bullmq';
import { z } from 'zod';

export const exampleJobSchema = z.object({
  message: z.string().max(200),
  /** Set to true in development to exercise retry/backoff handling. */
  failOnce: z.boolean().optional(),
});
export type ExampleJobData = z.infer<typeof exampleJobSchema>;

/** Harmless job that proves the worker pipeline works. Validates its payload; never trusts the queue. */
export async function handleExample(job: Job): Promise<{ echoed: string; attempt: number }> {
  const data = exampleJobSchema.parse(job.data);
  if (data.failOnce && job.attemptsMade === 0) throw new Error('simulated first-attempt failure');
  return { echoed: data.message, attempt: job.attemptsMade + 1 };
}
