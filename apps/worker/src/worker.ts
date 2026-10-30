import { type Job, Worker } from 'bullmq';
import { createServer, type Server } from 'node:http';
import Redis from 'ioredis';
import { QUEUES } from '@torio/types';
import type { WorkerEnv } from './env';
import type { Logger } from './logger';
import { processJob } from './processors';

export interface RunningWorker {
  workers: Worker[];
  health: Server;
  shutdown: () => Promise<void>;
}

/** Wires BullMQ workers, structured job logging, failure handling and a health endpoint. */
export function startWorkers(env: WorkerEnv, log: Logger): RunningWorker {
  // BullMQ workers require maxRetriesPerRequest: null.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  let redisOk = false;
  connection.on('ready', () => (redisOk = true));
  connection.on('end', () => (redisOk = false));
  connection.on('close', () => (redisOk = false));
  connection.on('error', (err) => log.error({ err: err.message }, 'redis connection error'));

  const workers = Object.values(QUEUES).map((queueName) => {
    const worker = new Worker(queueName, processJob, {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    });
    const meta = (job: Job) => ({
      queue: queueName,
      jobId: job.id,
      name: job.name,
      attempt: job.attemptsMade,
    });
    worker.on('active', (job) => log.info(meta(job), 'job started'));
    worker.on('completed', (job) => log.info(meta(job), 'job completed'));
    worker.on('failed', (job, err) => {
      const final = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : true;
      log[final ? 'error' : 'warn'](
        { ...(job ? meta(job) : { queue: queueName }), err: err.message, final },
        final
          ? 'job failed permanently (kept in failed set)'
          : 'job failed, will retry with backoff',
      );
    });
    worker.on('error', (err) => log.error({ queue: queueName, err: err.message }, 'worker error'));
    return worker;
  });

  const health = createServer((req, res) => {
    if (req.url === '/health') {
      const ok = redisOk && workers.every((w) => w.isRunning());
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: ok ? 'ok' : 'error',
          redis: redisOk ? 'up' : 'down',
          queues: workers.length,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  health.listen(env.WORKER_HEALTH_PORT, () =>
    log.info({ port: env.WORKER_HEALTH_PORT }, 'worker health endpoint ready'),
  );

  const shutdown = async () => {
    log.info('shutting down worker');
    health.close();
    await Promise.all(workers.map((w) => w.close()));
    connection.disconnect();
  };

  return { workers, health, shutdown };
}
