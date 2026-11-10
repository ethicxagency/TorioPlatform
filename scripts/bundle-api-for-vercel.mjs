// Vercel's NestJS builder does not ship pnpm workspace packages (@torio/*), so the function
// crashed with "Cannot find module '@torio/database'". Run on Vercel only, after `nest build`:
// bundle the compiled API (workspace packages + all JS deps) into one CJS file and point
// src/main.ts at it, so the function is self-contained. Native addons stay external.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api');

await build({
  entryPoints: [join(apiDir, 'dist/main.js')],
  outfile: join(apiDir, 'vercel-bundle.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['@node-rs/argon2', '@nestjs/microservices*', '@nestjs/websockets/socket-module', 'class-transformer*', 'class-validator*', 'bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});
writeFileSync(join(apiDir, 'src/main.ts'), "require('../vercel-bundle.cjs');\n");
console.log('API bundled for Vercel');
