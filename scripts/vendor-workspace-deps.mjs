// Vercel traces the API function from apps/api only. Workspace packages are symlinks to
// ../../packages/*, outside that root, so they were missing at runtime
// ("Cannot find module '@torio/database'"). After the build, replace each symlink with a
// real copy (package.json + dist) so the function bundle ships them.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps/api');
const pkg = JSON.parse(readFileSync(join(apiDir, 'package.json'), 'utf8'));
const names = Object.entries(pkg.dependencies ?? {})
  .filter(([, v]) => String(v).startsWith('workspace:'))
  .map(([n]) => n);

for (const name of names) {
  const dir = name.replace('@torio/', '');
  const src = join(root, 'packages', dir);
  const dest = join(root, 'node_modules', name);
  if (!existsSync(join(src, 'dist'))) throw new Error(`${name}: ${src}/dist missing (build first)`);
  if (lstatSync(dest, { throwIfNoEntry: false })) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (p) => !p.split('/').includes('node_modules') });
  console.log(`vendored ${name}`);
}
