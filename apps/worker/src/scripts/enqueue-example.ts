import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

import Redis from 'ioredis';
import { loadEnv } from '../env';
import { createQueue, EXAMPLE_JOB, SYSTEM_QUEUE } from '../queues';

async function main() {
  const env = loadEnv();
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createQueue(SYSTEM_QUEUE, connection);
  const job = await queue.add(EXAMPLE_JOB, {
    message: 'hello from torio',
    failOnce: process.argv.includes('--fail-once'),
  });
  console.log(`enqueued ${job.name} id=${job.id}`);
  await queue.close();
  connection.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
