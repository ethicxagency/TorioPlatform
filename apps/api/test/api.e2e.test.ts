import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makePrismaFake, type FakeMembership } from './helpers';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const memberships: FakeMembership[] = [
  { id: 'm1', workspaceId: WS_A, userId: OWNER_A, role: 'OWNER', createdAt: new Date(0) },
  { id: 'm2', workspaceId: WS_A, userId: AGENT_A, role: 'AGENT', createdAt: new Date(0) },
  { id: 'm3', workspaceId: WS_B, userId: OWNER_B, role: 'OWNER', createdAt: new Date(0) },
];

describe('API (e2e, in-memory data)', () => {
  let app: INestApplication;
  let token: (id: string) => Promise<string>;

  beforeAll(async () => {
    ({ app, token } = await createTestApp(makePrismaFake(memberships)));
  });
  afterAll(() => app.close());

  it('GET /health is public and ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/ready reports database up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.redis.status).toBe('skipped');
  });

  it('rejects unauthenticated access with the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/workspaces').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects forged tokens', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', 'Bearer abc.def.ghi')
      .expect(401);
  });

  it("lists only the caller's workspaces", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${await token(OWNER_A)}`)
      .expect(200);
    expect(res.body.map((w: { id: string }) => w.id)).toEqual([WS_A]);
  });

  describe('tenant isolation', () => {
    it("non-member gets 404 for another tenant's workspace", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WS_B}`)
        .set('Authorization', `Bearer ${await token(OWNER_A)}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it("non-member cannot list another tenant's members", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${WS_B}/members`)
        .set('Authorization', `Bearer ${await token(OWNER_A)}`)
        .expect(404);
    });

    it('member can read own workspace and members', async () => {
      const auth = { Authorization: `Bearer ${await token(AGENT_A)}` };
      await request(app.getHttpServer()).get(`/api/v1/workspaces/${WS_A}`).set(auth).expect(200);
    });

    it('malformed workspace id is a 400, not a lookup', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/workspaces/not-a-uuid')
        .set('Authorization', `Bearer ${await token(OWNER_A)}`)
        .expect(400);
    });
  });

  it('validates request bodies with field-level details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('rate-limits auth endpoints', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'bad', password: 'x' });
      codes.push(r.status);
    }
    expect(codes).toContain(429);
  });

  it('sends secure headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('API readiness failures', () => {
  it('returns 503 when the database is down', async () => {
    const { app } = await createTestApp(makePrismaFake([], { dbUp: false }));
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body.status).toBe('error');
    expect(res.body.checks.database.status).toBe('down');
    await app.close();
  });

  it('returns 200 degraded when Redis is down but not required', async () => {
    const { app } = await createTestApp(makePrismaFake([]), {
      configured: true,
      ping: async () => {
        throw new Error('down');
      },
    });
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.status).toBe('degraded');
    await app.close();
  });
});
