import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

// Repo-root .env (dist/ and src/ are both two levels below apps/api). Real env vars win.
loadDotenv({ path: resolve(__dirname, '../../../.env'), quiet: true });

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupDocs } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = configureApp(app);
  setupDocs(app, config);
  // Hosts such as Vercel assign the port through PORT; locally API_PORT applies.
  const port = Number(process.env.PORT) || config.API_PORT;
  await app.listen(port);
  app
    .get(Logger)
    .log(
      `Torio API listening on :${port} (docs: ${config.NODE_ENV === 'production' ? 'disabled' : '/docs'})`,
    );
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
