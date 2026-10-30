import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { RedisService } from '../src/database/redis.service';

export interface FakeMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'AGENT';
  createdAt: Date;
}

/** Minimal in-memory stand-in for the Prisma client surface the app uses in these tests. */
export function makePrismaFake(memberships: FakeMembership[], opts: { dbUp?: boolean } = {}) {
  const client = {
    $queryRaw: async () => {
      if (opts.dbUp === false) throw new Error('db down');
      return [{ '?column?': 1 }];
    },
    $disconnect: async () => undefined,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(client),
    workspaceMembership: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) =>
        memberships.find(
          (m) =>
            m.workspaceId === where.workspaceId_userId.workspaceId &&
            m.userId === where.workspaceId_userId.userId,
        ) ?? null,
      findMany: async ({ where }: { where: { userId?: string; workspaceId?: string } }) =>
        memberships
          .filter((m) =>
            where.userId ? m.userId === where.userId : m.workspaceId === where.workspaceId,
          )
          .map((m) => ({
            ...m,
            workspace: {
              id: m.workspaceId,
              name: `WS ${m.workspaceId}`,
              slug: m.workspaceId,
              createdAt: new Date(0),
            },
            user: { name: 'N', email: 'n@x.co' },
          })),
      count: async ({ where }: { where: { workspaceId: string } }) =>
        memberships.filter((m) => m.workspaceId === where.workspaceId).length,
    },
    workspace: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: 'W',
        slug: 'w',
        createdAt: new Date(0),
      }),
    },
  };
  return { client, ping: async () => client.$queryRaw(), onModuleDestroy: async () => undefined };
}

export async function createTestApp(
  prisma: ReturnType<typeof makePrismaFake>,
  redis: { configured: boolean; ping: () => Promise<void> } = {
    configured: false,
    ping: async () => undefined,
  },
): Promise<{ app: INestApplication; token: (userId: string) => Promise<string> }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisService)
    .useValue({ ...redis, onModuleDestroy: async () => undefined })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const jwt = app.get(JwtService);
  return { app, token: (userId) => jwt.signAsync({ sub: userId, sid: 'test-session' }) };
}
