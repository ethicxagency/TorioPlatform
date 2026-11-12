import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';
import { AiProviderRegistry } from '../src/modules/ai/ai-registry';
import type { ProviderAdapter } from '../src/modules/ai/providers/types';

/**
 * Real-PostgreSQL tests for the AI infrastructure: encrypted key storage, admin-only configuration, drafts through the real
 * Brain and conversation data, usage rows and tenant isolation. The providers are fakes, so no real OpenAI or Gemini call
 * is made. Needs TEST_DATABASE_URL with the ai_orchestration migration applied.
 */
const url = process.env.TEST_DATABASE_URL;
const PW = 'Admin-passphrase-1';
const KEY = 'sk-test-integration-key-0123456789';
const REPLY = 'The linen sofa is Tk 25,000 and delivery inside the city takes 2-3 days.';

describe.skipIf(!url)('AI infrastructure (real PostgreSQL, fake providers)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  let cookie = '';
  const seenKeys: string[] = [];
  const http = () => request(app.getHttpServer());
  const A = '/api/v1/admin/ai';
  const admin = {
    get: (p: string) => http().get(`${A}${p}`).set('Cookie', cookie),
    send: (m: 'put' | 'patch' | 'post' | 'delete', p: string, body: object = {}) =>
      http()[m](`${A}${p}`).set('Cookie', cookie).set('X-Torio-Admin', '1').send(body),
  };

  const fake = (key: string, name: string): ProviderAdapter => ({
    key,
    name,
    listModels: async (k) => {
      seenKeys.push(k);
      return [{ modelId: `${key}-model`, label: `${name} model`, supportsTemperature: true }];
    },
    generate: async (i) => {
      seenKeys.push(i.apiKey);
      return { text: REPLY, inputTokens: 1000, outputTokens: 100, cachedTokens: 0 };
    },
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
    process.env.CHANNEL_ENCRYPTION_KEY = 'integration-test-encryption-key-32-chars-min!';
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const registry = new AiProviderRegistry();
    registry.register(fake('openai', 'OpenAI'));
    registry.register(fake('gemini', 'Google Gemini'));
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AiProviderRegistry)
        .useValue(registry)
        .compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const hash = await app.get(PasswordService).hash(PW);
    const adm = await db.platformAdmin.create({
      data: { email: `ai-root-${sfx}@torio.test`, name: 'Root', passwordHash: hash },
    });
    ids.admin = adm.id;
    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ email: adm.email, password: PW });
    cookie = ((login.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0] ?? '';
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: hash } });
    const [agent, outsider] = await Promise.all([mk('aiagent'), mk('aiout')]);
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `ai-a-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `ai-b-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: agent.id, role: 'OWNER' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const cust = await db.customer.create({
      data: { workspaceId: wsA.id, name: 'Nadia Rahman', email: `n-${sfx}@t.co` },
    });
    const ch = await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'WA', status: 'CONNECTED' },
    });
    const conv = await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: ch.id, customerId: cust.id },
    });
    await db.message.create({
      data: {
        workspaceId: wsA.id,
        conversationId: conv.id,
        kind: 'INBOUND',
        body: 'How much is the linen sofa and how long is delivery?',
      },
    });
    Object.assign(ids, {
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
      conv: conv.id,
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.agent!, ids.outsider!] } } });
    await db.adminAuditLog.deleteMany({ where: { adminId: ids.admin! } });
    await db.platformAdmin.deleteMany({ where: { id: ids.admin! } });
    // Provider rows are singletons (one per adapter), so the suite removes the ones it created. Run it against the test database only.
    await db.aiProvider.deleteMany({});
    await db.platformSetting.deleteMany({ where: { key: 'ai.settings' } });
    await db.$disconnect();
    await app.close();
  });

  it('only a signed-in Super Admin can reach AI management; customers cannot', async () => {
    await http().get(`${A}/providers`).expect(401);
    await http()
      .get(`${A}/providers`)
      .set(await auth(ids.agent!))
      .expect(401); // a customer token is not an admin session
    await admin.get('/providers').expect(200);
    await http()
      .put(`${A}/providers/openai/key`)
      .set('Cookie', cookie)
      .send({ apiKey: KEY })
      .expect(403); // missing admin header
  });

  it('stores keys encrypted, masks them everywhere, audits the change and never returns the key', async () => {
    const saved = await admin.send('put', '/providers/openai/key', { apiKey: KEY }).expect(200);
    expect(JSON.stringify(saved.body)).not.toContain(KEY);
    expect(saved.body.data.find((p: { key: string }) => p.key === 'openai')).toMatchObject({
      hasKey: true,
      keyMask: '••••••••6789',
    });
    const row = await db.aiProvider.findUnique({ where: { key: 'openai' } });
    expect(row?.keyCiphertext).toBeTruthy();
    expect(row?.keyCiphertext).not.toContain(KEY);
    expect(row?.keyLast4).toBe('6789');
    const audit = await db.adminAuditLog.findMany({
      where: { action: { startsWith: 'ai.key' }, adminId: ids.admin! },
    });
    expect(audit.map((a) => a.action)).toContain('ai.key.created');
    expect(JSON.stringify(audit)).not.toContain(KEY);
    await admin.send('put', '/providers/openai/key', { apiKey: `${KEY}-second` }).expect(200);
    expect(
      await db.adminAuditLog.count({ where: { action: 'ai.key.replaced', adminId: ids.admin! } }),
    ).toBe(1);
  });

  it('tests the connection server-side with the decrypted key and loads the model list', async () => {
    seenKeys.length = 0;
    const r = await admin.send('post', '/providers/openai/test').expect(200);
    expect(r.body).toMatchObject({ ok: true, health: 'HEALTHY', modelCount: 1 });
    expect(JSON.stringify(r.body)).not.toContain('sk-');
    expect(seenKeys).toEqual([`${KEY}-second`]);
    const p = (await admin.get('/providers')).body.data.find(
      (x: { key: string }) => x.key === 'openai',
    );
    expect(p.health).toBe('HEALTHY');
    expect(p.models[0].modelId).toBe('openai-model');
  });

  it('Inbox AI Assist says it is unavailable until the platform enables it', async () => {
    const h = await auth(ids.agent!);
    const o = await http().get(`/api/v1/workspaces/${ids.wsA}/ai/options`).set(h).expect(200);
    expect(o.body.available).toBe(false);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
      .set(h)
      .send({ requestId: randomUUID(), mode: 'auto' })
      .expect(503);
  });

  it('prepares a draft from the real conversation and Brain, records usage with an estimated cost, and keeps no text', async () => {
    const prov = (await admin.get('/providers')).body.data.find(
      (x: { key: string }) => x.key === 'openai',
    );
    const m = prov.models[0];
    await admin
      .send('patch', `/models/${m.id}`, {
        enabled: true,
        inputPriceMicros: 1_000_000,
        outputPriceMicros: 2_000_000,
      })
      .expect(200);
    await admin
      .send('patch', '/providers/openai', { enabled: true, defaultModel: 'openai-model' })
      .expect(200);
    await admin.send('patch', '/settings', { enabled: true }).expect(200);
    // Nothing is assumed unlimited: until the plan is given an allowance, AI is refused.
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
      .set(await auth(ids.agent!))
      .send({ requestId: randomUUID(), mode: 'auto' })
      .expect(403);
    await admin
      .send('patch', '/settings', {
        defaultPlanLimit: {
          included: true,
          monthlyRequests: 100,
          monthlyTokens: null,
          multiModel: false,
          maxConcurrent: 2,
          maxRequestChars: 24000,
        },
      })
      .expect(200);
    // Brain knowledge for the store
    const { emptyBrainConfig } = await import('@torio/contracts');
    const b = emptyBrainConfig();
    b.voice.language = 'English';
    b.shipping.timeInside = '2-3 days';
    b.products = [
      {
        id: 'p1',
        name: 'Linen sofa',
        category: '',
        description: '',
        price: '25,000',
        variants: '',
        sizes: '',
        colors: '',
        stock: 'In stock',
        benefits: '',
        usage: '',
        limitations: '',
        faqs: '',
      } as never,
    ];
    await http()
      .put(`/api/v1/workspaces/${ids.wsA}/brain`)
      .set(await auth(ids.agent!))
      .send({ config: b, baseVersion: 0 })
      .expect(200);

    const h = await auth(ids.agent!);
    const rq = randomUUID();
    const r = await http()
      .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
      .set(h)
      .send({ requestId: rq, mode: 'auto' })
      .expect(200);
    expect(r.body).toMatchObject({
      draft: REPLY,
      mode: 'auto',
      needsReview: false,
      providers: ['OpenAI'],
    });
    const row = await db.aiRequest.findFirst({
      where: { workspaceId: ids.wsA!, requestId: rq },
      include: { calls: true },
    });
    expect(row).toMatchObject({
      status: 'succeeded',
      phase: 'done',
      inputTokens: 1000,
      outputTokens: 100,
      costMicros: 1200,
    });
    expect(row?.calls).toHaveLength(1);
    expect(JSON.stringify(row)).not.toContain('linen'); // metadata only: no message or draft text is stored
    expect(JSON.stringify(row)).not.toContain('Tk 25,000');
    // the same request id is never billed twice
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
      .set(h)
      .send({ requestId: rq, mode: 'auto' })
      .expect(409);
    expect(await db.aiRequest.count({ where: { workspaceId: ids.wsA! } })).toBe(1);
    const ph = await http()
      .get(`/api/v1/workspaces/${ids.wsA}/ai/requests/${rq}/phase`)
      .set(h)
      .expect(200);
    expect(ph.body).toMatchObject({ phase: 'done', status: 'succeeded' });
  });

  it('stops AI at a budget limit with a clear message, and resumes when the budget is lifted', async () => {
    const h = await auth(ids.agent!);
    const draft = () =>
      http()
        .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
        .set(h)
        .send({ requestId: randomUUID(), mode: 'auto' });
    await admin
      .send('patch', '/settings', {
        budgets: {
          monthlyMicros: 1000,
          providerMicros: {},
          workspaceMicros: null,
          alertPercent: 80,
          onLimit: 'block',
        },
      })
      .expect(200);
    const blocked = await draft().expect(429); // $0.0012 is already spent this month
    expect(blocked.body.message ?? blocked.body.error?.message).toMatch(/paused for this month/);
    const status = (await admin.get('/budget').expect(200)).body;
    expect(status.alerts[0]).toMatchObject({ scope: 'platform', level: 'limit' });
    const options = (
      await http().get(`/api/v1/workspaces/${ids.wsA}/ai/options`).set(h).expect(200)
    ).body;
    expect(options.available).toBe(false);
    await admin
      .send('patch', '/settings', {
        budgets: {
          monthlyMicros: null,
          providerMicros: {},
          workspaceMicros: null,
          alertPercent: 80,
          onLimit: 'block',
        },
      })
      .expect(200);
    await draft().expect(200);
    const o2 = (await http().get(`/api/v1/workspaces/${ids.wsA}/ai/options`).set(h).expect(200))
      .body;
    expect(o2.usage).toMatchObject({ requests: 2, requestLimit: 100 });
  });

  it('keeps tenants apart: another workspace cannot draft from, or read the progress of, this one', async () => {
    const out = await auth(ids.outsider!);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/ai/conversations/${ids.conv}/draft`)
      .set(out)
      .send({ requestId: randomUUID(), mode: 'auto' })
      .expect(404);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/ai/conversations/${ids.conv}/draft`)
      .set(out)
      .send({ requestId: randomUUID(), mode: 'auto' })
      .expect(404);
    const any = await db.aiRequest.findFirst({ where: { workspaceId: ids.wsA! } });
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/ai/requests/${any!.requestId}/phase`)
      .set(out)
      .expect(404);
    expect(await db.aiRequest.count({ where: { workspaceId: ids.wsB! } })).toBe(0);
  });

  it('admin usage and logs show recorded requests, and a key can be removed (turning the provider off)', async () => {
    const o = (await admin.get('/overview?days=30').expect(200)).body;
    expect(o).toMatchObject({
      requests: 2,
      succeeded: 2,
      inputTokens: 2000,
      estimatedCostMicros: 2400,
    });
    const l = (await admin.get('/logs?status=succeeded').expect(200)).body;
    expect(l.data[0]).toMatchObject({ providers: ['openai'], costMicros: 1200 });
    expect(JSON.stringify(l)).not.toMatch(/linen|Tk 25,000|sk-/);
    const del = await admin.send('delete', '/providers/openai/key').expect(200);
    expect(del.body.data.find((p: { key: string }) => p.key === 'openai')).toMatchObject({
      hasKey: false,
      enabled: false,
    });
    expect(
      (await db.aiProvider.findUnique({ where: { key: 'openai' } }))?.keyCiphertext,
    ).toBeNull();
    expect(
      await db.adminAuditLog.count({ where: { action: 'ai.key.deleted', adminId: ids.admin! } }),
    ).toBe(1);
  });
});
