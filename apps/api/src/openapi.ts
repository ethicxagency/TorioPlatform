import 'reflect-metadata';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
// The spec does not depend on real infrastructure; fall back to placeholders so CI can generate it.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-only-secret-not-used-at-runtime';
process.env.LOG_LEVEL = 'silent';
process.env.WEB_URL ??= 'http://localhost:3000';
process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:3000';

async function main() {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { buildOpenApiDocument, configureApp } = await import('./bootstrap');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const doc = buildOpenApiDocument(app);
  writeFileSync(resolve(__dirname, '../openapi.json'), JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  console.log('Wrote apps/api/openapi.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
