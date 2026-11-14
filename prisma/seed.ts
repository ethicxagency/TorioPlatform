import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { createPrismaClient } from '@torio/database';
import { seedBrain, seedInbox, seedLeads, seedOrders } from './seed-data';

/**
 * Development seed. Creates a demo workspace with one user per role.
 * Passwords are for local development only and are generated per run unless
 * SEED_PASSWORD is provided; they are printed once, never stored in source.
 */

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrismaClient(url);

  const password = process.env.SEED_PASSWORD ?? `Dev-${Math.random().toString(36).slice(2, 12)}A1`;
  const passwordHash = await hash(password, { algorithm: 2 });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'urbannest-demo' },
    update: {},
    create: { name: 'UrbanNest (demo)', slug: 'urbannest-demo', defaultCurrency: 'BDT' },
  });

  const people = [
    { email: 'owner@urbannest.test', name: 'Rahim Haque', role: 'OWNER' as const },
    { email: 'admin@urbannest.test', name: 'Nadia Islam', role: 'ADMIN' as const },
    { email: 'agent@urbannest.test', name: 'Farid Ahmed', role: 'AGENT' as const },
  ];

  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, name: p.name, passwordHash, passwordSetAt: new Date(), emailVerifiedAt: new Date() },
    });
    await prisma.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role: p.role },
      create: { workspaceId: workspace.id, userId: user.id, role: p.role },
    });
  }

  await seedInbox(prisma, workspace.id);
  await seedLeads(prisma, workspace.id);
  await seedBrain(prisma, workspace.id);
  await seedOrders(prisma, workspace.id);

  // A local-only Super Admin so /admin can be tried. Real deployments create theirs with `pnpm admin:create`.
  if ((await prisma.platformAdmin.count()) === 0) {
    const adminPassword =
      process.env.ADMIN_PASSWORD ?? `Adm-${Math.random().toString(36).slice(2, 14)}-Aa1`;
    await prisma.platformAdmin.create({
      data: {
        email: 'admin@torio.local',
        name: 'Platform Admin',
        passwordHash: await hash(adminPassword, { algorithm: 2 }),
      },
    });
    console.log(`Created Super Admin admin@torio.local. Password (shown once): ${adminPassword}`);
  }

  console.log(`Seeded workspace "${workspace.slug}" with ${people.length} users.`);
  console.log(`Dev password for newly created users: ${password}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
