import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { createPrismaClient } from '@torio/database';

/**
 * Creates (or resets the password of) a platform Super Admin. This is the ONLY way an admin account comes to exist:
 * there is no HTTP endpoint for it, so no customer or request can create one.
 *
 *   pnpm admin:create -- --email owner@yourcompany.com --name "Your Name"
 *
 * The password is read from ADMIN_PASSWORD (min 12 chars) or generated and printed once.
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim() || 'Platform Admin';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Pass a valid --email');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const given = process.env.ADMIN_PASSWORD;
  if (given && given.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  const password = given ?? `${randomBytes(12).toString('base64url')}aA1`;
  const prisma = createPrismaClient(url);
  const passwordHash = await hash(password, { algorithm: 2 });
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  await prisma.platformAdmin.upsert({
    where: { email },
    create: { email, name, passwordHash, role: 'SUPER_ADMIN' },
    update: { passwordHash, isActive: true, name },
  });
  if (existing)
    await prisma.adminSession.updateMany({
      where: { adminId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  console.log(`${existing ? 'Updated' : 'Created'} Super Admin ${email}.`);
  if (!given) console.log(`Password (shown once): ${password}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
