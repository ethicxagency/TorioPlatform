import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { createPrismaClient } from '@torio/database';

/**
 * Creates (or resets the passwords of) a set of QA accounts for testing a deployment end to end: one platform
 * Super Admin and one customer workspace with an Owner, an Admin and an Agent, so every role and permission can be tried.
 *
 *   pnpm accounts:create-test -- --domain qa.example.com [--workspace "Torio QA"] [--confirm-production] [--no-admin]
 *
 * - --no-admin skips the platform Super Admin, so only the customer workspace accounts are created.
 * - Each account gets its own random password, printed once and never stored anywhere else.
 * - Safe to re-run: existing accounts get a new password and their sessions are revoked. Nothing else is touched.
 * - Against a non-local database it refuses to run without --confirm-production, so it can't hit production by accident.
 * - These are real, working logins: delete them (or deactivate the admin) when testing is finished.
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const password = () => `${randomBytes(15).toString('base64url')}aA1!`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const domain = arg('domain')?.trim().toLowerCase();
  if (!domain || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw new Error('Pass --domain, e.g. --domain qa.example.com');
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (!local && !flag('confirm-production'))
    throw new Error(
      `DATABASE_URL points at a non-local database. Re-run with --confirm-production if you really want to create test accounts there.`,
    );
  const workspaceName = arg('workspace')?.trim() || 'Torio QA';
  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'torio-qa';
  const prisma = createPrismaClient(url);
  const out: { role: string; email: string; password: string }[] = [];

  if (!flag('no-admin')) {
    const adminEmail = `qa-superadmin@${domain}`;
    const adminPw = password();
    const adminHash = await hash(adminPw, { algorithm: 2 });
    const existingAdmin = await prisma.platformAdmin.findUnique({ where: { email: adminEmail } });
    await prisma.platformAdmin.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, name: 'QA Super Admin', passwordHash: adminHash, role: 'SUPER_ADMIN' },
      update: { passwordHash: adminHash, isActive: true },
    });
    if (existingAdmin)
      await prisma.adminSession.updateMany({ where: { adminId: existingAdmin.id, revokedAt: null }, data: { revokedAt: new Date() } });
    out.push({ role: 'Super Admin (/admin)', email: adminEmail, password: adminPw });

  }

  const workspace = await prisma.workspace.upsert({ where: { slug }, update: {}, create: { name: workspaceName, slug } });
  for (const [role, label] of [['OWNER', 'Owner'], ['ADMIN', 'Admin'], ['AGENT', 'Agent']] as const) {
    const email = `qa-${role.toLowerCase()}@${domain}`;
    const pw = password();
    const passwordHash = await hash(pw, { algorithm: 2 });
    const existing = await prisma.user.findUnique({ where: { email } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: `QA ${label}`, passwordHash, emailVerifiedAt: new Date() },
      update: { passwordHash },
    });
    if (existing) await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      create: { workspaceId: workspace.id, userId: user.id, role },
      update: { role, status: 'ACTIVE' },
    });
    out.push({ role: `${label} (workspace “${workspaceName}”)`, email, password: pw });
  }

  console.log(`QA accounts ready. Passwords are shown once; store them in your password manager.\n`);
  for (const a of out) console.log(`${a.role.padEnd(44)} ${a.email.padEnd(40)} ${a.password}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
