import { createPrismaClient } from '@torio/database';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Runs against a real PostgreSQL when TEST_DATABASE_URL is set (e.g. docker compose up postgres,
 * then `pnpm db:deploy`). Skipped otherwise so the default test run needs no infrastructure.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('database connectivity and constraints', () => {
  const prisma = url ? createPrismaClient(url) : undefined;
  afterAll(() => prisma?.$disconnect());

  it('connects and answers SELECT 1', async () => {
    const rows = await prisma!.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });

  it('enforces unique membership per user per workspace', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const user = await prisma!.user.create({
      data: { email: `it-${suffix}@x.co`, name: 'IT', passwordHash: 'x' },
    });
    const ws = await prisma!.workspace.create({ data: { name: 'IT', slug: `it-${suffix}` } });
    try {
      await prisma!.workspaceMembership.create({
        data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' },
      });
      await expect(
        prisma!.workspaceMembership.create({
          data: { workspaceId: ws.id, userId: user.id, role: 'AGENT' },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma!.workspace.delete({ where: { id: ws.id } });
      await prisma!.user.delete({ where: { id: user.id } });
    }
  });
});
