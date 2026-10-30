import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

import { loadEnv } from './env';
import { createLogger } from './logger';
import { startWorkers } from './worker';

function main() {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL);
  const running = startWorkers(env, log);

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'received shutdown signal');
    void running.shutdown().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  log.info({ concurrency: env.WORKER_CONCURRENCY }, 'torio worker started');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
