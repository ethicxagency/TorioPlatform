/* eslint-disable @typescript-eslint/no-explicit-any -- payload and response JSON are read loosely in assertions */
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';
import { MetaEventsService } from '../src/modules/tracking/meta-events.service';
import { WorkspacePixelService } from '../src/modules/tracking/workspace-pixel.service';

/**
 * Real-PostgreSQL tests for a workspace's own Meta Pixel and for purchase events from paid orders, with Meta mocked: settings,
 * verification, permissions, isolation between workspaces, one Purchase per order, no event for unpaid or cancelled orders,
 * and a failing Meta never affecting the payment. Needs TEST_DATABASE_URL with the workspace_integrations migration applied.
 */
const url = process.env.TEST_DATABASE_URL;
const TOKEN = 'EAAB-workspace-secret-token-123456';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

describe.skipIf(!url)(
  'workspace Meta Pixel and purchase events (real PostgreSQL, mocked Meta)',
  () => {
    let app: INestApplication;
    let db: PrismaClient;
    let pixel: WorkspacePixelService;
    let auth: (id: string) => Promise<{ Authorization: string }>;
    const sfx = Math.random().toString(36).slice(2, 8);
    const ids = {} as Record<string, string>;
    const http = () => request(app.getHttpServer());
    const P = (w = ids.ws!) => `/api/v1/workspaces/${w}/integrations/meta-pixel`;
    const meta = {
      calls: [] as { url: string; init: RequestInit }[],
      mode: 'ok' as 'ok' | 'down' | 'dead',
    };
    let seq = 1000;

    const mkOrder = async (over: Record<string, unknown> = {}, w = ids.ws!) => {
      const c = await db.customer.create({
        data: {
          workspaceId: w,
          name: 'Buyer',
          email: `Buyer-${sfx}-${++seq}@Example.com`,
          phone: '+880 1712-345678',
        },
      });
      return db.order.create({
        data: {
          workspaceId: w,
          number: ++seq,
          customerId: c.id,
          currency: 'BDT',
          subtotalMinor: 250_000,
          totalMinor: 250_000,
          ...over,
        } as never,
      });
    };
    const events = (w = ids.ws!) =>
      db.metaTrackingEvent.findMany({ where: { ownerKey: w }, orderBy: { createdAt: 'asc' } });
    const wait = () => new Promise((r) => setTimeout(r, 60));

    beforeAll(async () => {
      process.env.DATABASE_URL = url!;
      process.env.THROTTLE_DISABLED = 'true';
      process.env.CHANNEL_ENCRYPTION_KEY = 'integration-test-encryption-key-32-chars-min!';
      const { AppModule } = await import('../src/app.module');
      const { configureApp } = await import('../src/bootstrap');
      app = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      configureApp(app);
      await app.init();
      db = createPrismaClient(url!);
      pixel = app.get(WorkspacePixelService);
      const fake = (async (u: string, init: RequestInit) => {
        meta.calls.push({ url: String(u), init });
        if (meta.mode === 'down') return new Response('{}', { status: 503 });
        if (meta.mode === 'dead')
          return new Response(JSON.stringify({ error: { message: 'bad', code: 100 } }), {
            status: 400,
          });
        return new Response(
          JSON.stringify(
            String(u).endsWith('/events')
              ? { events_received: 1 }
              : { id: '1234567890', name: 'Shop pixel' },
          ),
          { status: 200 },
        );
      }) as never;
      pixel.fetch = fake;
      app.get(MetaEventsService).fetch = fake;
      const jwt = app.get(JwtService);
      auth = async (id) => ({
        Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: (await db.session.findFirstOrThrow({ where: { userId: id } })).id })}`,
      });
      const hash = await app.get(PasswordService).hash('Random-unusable-pass-1');
      const mk = (n: string) =>
        db.user.create({
          data: {
            email: `${n}-${sfx}@t.co`,
            name: n,
            passwordHash: hash,
            emailVerifiedAt: new Date(),
          },
        });
      const [owner, admin, agent, ownerB] = await Promise.all([
        mk('owner'),
        mk('admin'),
        mk('agent'),
        mk('ownerb'),
      ]);
      const ws = await db.workspace.create({ data: { name: 'Shop A', slug: `px-a-${sfx}` } });
      const wsB = await db.workspace.create({ data: { name: 'Shop B', slug: `px-b-${sfx}` } });
      await db.workspaceMembership.createMany({
        data: [
          { workspaceId: ws.id, userId: owner.id, role: 'OWNER' },
          { workspaceId: ws.id, userId: admin.id, role: 'ADMIN' },
          { workspaceId: ws.id, userId: agent.id, role: 'AGENT' },
          { workspaceId: wsB.id, userId: ownerB.id, role: 'OWNER' },
        ],
      });
      for (const u of [owner, admin, agent, ownerB])
        await db.session.create({
          data: {
            userId: u.id,
            familyId: randomUUID(),
            refreshTokenHash: `${u.id}-${sfx}`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
      Object.assign(ids, {
        owner: owner.id,
        admin: admin.id,
        agent: agent.id,
        ownerB: ownerB.id,
        ws: ws.id,
        wsB: wsB.id,
      });
    });

    afterAll(async () => {
      const w = [ids.ws!, ids.wsB!];
      await db.metaTrackingEvent.deleteMany({ where: { ownerKey: { in: w } } });
      await db.orderPayment.deleteMany({ where: { workspaceId: { in: w } } });
      await db.orderEvent.deleteMany({ where: { workspaceId: { in: w } } });
      await db.order.deleteMany({ where: { workspaceId: { in: w } } });
      await db.customer.deleteMany({ where: { workspaceId: { in: w } } });
      await db.workspace.deleteMany({ where: { id: { in: w } } });
      await db.user.deleteMany({
        where: { id: { in: [ids.owner!, ids.admin!, ids.agent!, ids.ownerB!] } },
      });
      await db.$disconnect();
      await app.close();
    });

    it('only Owner and Admin manage it, another workspace cannot reach it, and the token is write-only', async () => {
      await http()
        .get(P())
        .set(await auth(ids.agent!))
        .expect(403);
      await http()
        .put(P())
        .set(await auth(ids.agent!))
        .send({ pixelId: '1234567890' })
        .expect(403);
      await http()
        .get(P())
        .set(await auth(ids.ownerB!))
        .expect(404);
      await http()
        .put(`${P()}/token`)
        .set(await auth(ids.ownerB!))
        .send({ value: TOKEN })
        .expect(404);
      const admin = await auth(ids.admin!);
      await http().put(P()).set(admin).send({ pixelId: 'abc' }).expect(400);
      await http().put(P()).set(admin).send({ pixelId: '1234567890', amount: 1 }).expect(400);
      const v = await http()
        .put(P())
        .set(admin)
        .send({ pixelId: '1234567890', testEventCode: 'TEST1', conversionsApi: true })
        .expect(200);
      expect(v.body).toMatchObject({
        pixelId: '1234567890',
        status: 'NOT_CONFIGURED',
        hasToken: false,
      });
      const t = await http().put(`${P()}/token`).set(admin).send({ value: TOKEN }).expect(200);
      expect(t.body.hasToken).toBe(true);
      expect(JSON.stringify(t.body)).not.toContain(TOKEN);
      const stored = await db.workspaceIntegration.findFirstOrThrow({
        where: { workspaceId: ids.ws! },
      });
      expect(JSON.stringify(stored.data)).not.toContain(TOKEN); // encrypted at rest
      expect(JSON.stringify(await http().get(P()).set(admin))).not.toContain(TOKEN);
      // the other workspace has nothing
      await http()
        .put(P(ids.wsB))
        .set(await auth(ids.ownerB!))
        .send({ pixelId: '9999999999' })
        .expect(200);
      expect((await http().get(P()).set(admin)).body.pixelId).toBe('1234567890');
      expect(
        (
          await http()
            .get(P(ids.wsB))
            .set(await auth(ids.ownerB!))
        ).body,
      ).toMatchObject({ pixelId: '9999999999', hasToken: false });
    });

    it('is verified only by a real check of the saved Pixel and token, cannot be turned on before, and any change needs a new test', async () => {
      const o = await auth(ids.owner!);
      await http().put(`${P()}/enabled`).set(o).send({ enabled: true }).expect(400);
      const r = await http().post(`${P()}/test`).set(o).expect(200);
      expect(r.body).toMatchObject({ ok: true, status: 'VERIFIED' });
      const call = meta.calls.at(-1)!;
      expect(call.url).toBe('https://graph.facebook.com/v27.0/1234567890?fields=id,name');
      expect((call.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
      expect(
        (await http().put(`${P()}/enabled`).set(o).send({ enabled: true }).expect(200)).body,
      ).toMatchObject({ enabled: true, status: 'VERIFIED' });
      const changed = await http().put(P()).set(o).send({ pixelId: '1234567891' }).expect(200);
      expect(changed.body).toMatchObject({ enabled: false, status: 'UNVERIFIED' });
      await http().put(P()).set(o).send({ pixelId: '1234567890' }).expect(200);
      await http().post(`${P()}/test`).set(o).expect(200);
      await http().put(`${P()}/enabled`).set(o).send({ enabled: true }).expect(200);
      // test events need the test code, and go out with it
      const te = await http().post(`${P()}/test-event`).set(o).expect(200);
      expect(te.body.ok).toBe(true);
      expect(JSON.parse(String(meta.calls.at(-1)!.init.body)).test_event_code).toBe('TEST1');
      const audits = await db.auditLog.findMany({
        where: { workspaceId: ids.ws!, action: { startsWith: 'integration.meta_pixel.' } },
      });
      expect(audits.length).toBeGreaterThan(3);
      expect(JSON.stringify(audits)).not.toContain(TOKEN);
    });

    it('sends one Purchase for a fully paid order, with hashed identifiers, and never for unpaid, part-paid, cancelled or sample orders', async () => {
      const before = (await events()).length;
      const unpaid = await mkOrder();
      const part = await mkOrder({ paidMinor: 100_000, paymentStatus: 'PARTIALLY_PAID' });
      const cancelled = await mkOrder({
        paidMinor: 250_000,
        paymentStatus: 'PAID',
        status: 'CANCELLED',
      });
      const sample = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID', isSample: true });
      for (const o of [unpaid, part, cancelled, sample]) await pixel.trackOrderPaid(ids.ws!, o.id);
      expect((await events()).length).toBe(before);
      const paid = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID' });
      await pixel.trackOrderPaid(ids.ws!, paid.id);
      await wait();
      const rows = (await events()).filter((e) => e.eventName === 'Purchase');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventId: `purchase-order-${paid.id}`,
        status: 'SENT',
        ownerKey: ids.ws,
      });
      const p = rows[0]!.payload as any;
      expect(p).toMatchObject({
        event_name: 'Purchase',
        action_source: 'system_generated',
        custom_data: { value: 2500, currency: 'BDT', order_id: String(paid.number) },
      });
      const email = (await db.customer.findUniqueOrThrow({ where: { id: paid.customerId } }))
        .email!;
      expect(p.user_data.em).toEqual([sha(email.toLowerCase())]);
      expect(p.user_data.ph).toEqual([sha('8801712345678')]);
      expect(JSON.stringify(p)).not.toMatch(/Buyer|@example\.com|1712/);
      // sent to the workspace's own Pixel with the workspace's own token
      const sent = meta.calls.filter((c) => c.url.endsWith('/1234567890/events')).at(-1)!;
      expect((sent.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(String(sent.init.body)).test_event_code).toBeUndefined();
    });

    it('never repeats it: editing the order, reopening it, changing status again or a repeated trigger do not send a second one', async () => {
      const o = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID' });
      await pixel.trackOrderPaid(ids.ws!, o.id);
      await wait();
      const n = (await events()).length;
      await db.order.update({
        where: { id: o.id },
        data: { totalMinor: 260_000, status: 'COMPLETED' },
      });
      await db.order.update({ where: { id: o.id }, data: { status: 'PENDING' } });
      for (let i = 0; i < 3; i++) await pixel.trackOrderPaid(ids.ws!, o.id);
      await wait();
      expect((await events()).length).toBe(n);
    });

    it('orders made in a conversation are reported as chat sales, and an order of another workspace is never tracked here', async () => {
      const ch = await db.channel.create({
        data: {
          workspaceId: ids.ws!,
          provider: 'WHATSAPP',
          displayName: 'WA',
          status: 'CONNECTED',
        } as never,
      });
      const cust = await db.customer.create({
        data: { workspaceId: ids.ws!, name: 'Chat buyer', email: `chat-${sfx}@x.co` },
      });
      const conv = await db.conversation.create({
        data: { workspaceId: ids.ws!, channelId: ch.id, customerId: cust.id } as never,
      });
      const o = await db.order.create({
        data: {
          workspaceId: ids.ws!,
          number: ++seq,
          customerId: cust.id,
          conversationId: conv.id,
          currency: 'BDT',
          subtotalMinor: 1000,
          totalMinor: 1000,
          paidMinor: 1000,
          paymentStatus: 'PAID',
        } as never,
      });
      await pixel.trackOrderPaid(ids.ws!, o.id);
      await wait();
      expect(
        ((await events()).find((e) => e.eventId === `purchase-order-${o.id}`)!.payload as any)
          .action_source,
      ).toBe('chat');
      await db.conversation.delete({ where: { id: conv.id } });
      await db.channel.delete({ where: { id: ch.id } });
      const other = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID' }, ids.wsB!);
      await pixel.trackOrderPaid(ids.ws!, other.id); // wrong workspace: no such order here
      await pixel.trackOrderPaid(ids.wsB!, other.id); // workspace B has no connected Pixel
      expect((await events()).some((e) => e.eventId === `purchase-order-${other.id}`)).toBe(false);
      expect(await events(ids.wsB!)).toHaveLength(0);
      await http()
        .get(`${P()}/events`)
        .set(await auth(ids.ownerB!))
        .expect(404); // workspace A's log is not reachable from B
      await http()
        .get(`${P(ids.wsB)}/events`)
        .set(await auth(ids.ownerB!))
        .expect(200)
        .then((r) => expect(r.body.data).toHaveLength(0));
    });

    it('a payment recorded through the API triggers the event once, and a failing Meta never fails or blocks the payment', async () => {
      const o = await mkOrder({ currency: 'BDT', subtotalMinor: 5000, totalMinor: 5000 });
      meta.mode = 'down';
      const ow = await auth(ids.owner!);
      const pay = await http()
        .post(`/api/v1/workspaces/${ids.ws}/orders/${o.id}/payments`)
        .set(ow)
        .send({ amountMinor: 5000, method: 'CASH', requestId: randomUUID() });
      expect(pay.status).toBeLessThan(300); // the payment succeeded
      await wait();
      expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe(
        'PAID',
      );
      let row = (await events()).find((e) => e.eventId === `purchase-order-${o.id}`)!;
      expect([row.status, row.attempts, row.lastError]).toEqual([
        'FAILED',
        1,
        expect.stringContaining('503'),
      ]);
      // the log shows it with the order reference and why it failed; a manual retry delivers it once Meta is back
      const log = await http().get(`${P()}/events`).set(ow).expect(200);
      expect(log.body.data.find((e: any) => e.eventId === `purchase-order-${o.id}`)).toMatchObject({
        status: 'FAILED',
        reference: String(o.number),
      });
      meta.mode = 'ok';
      expect(
        (await http().post(`${P()}/events/retry`).set(ow).expect(200)).body.retried,
      ).toBeGreaterThanOrEqual(1);
      row = (await events()).find((e) => e.eventId === `purchase-order-${o.id}`)!;
      expect(row.status).toBe('SENT');
      // a refused event is dead and not retried automatically
      const o2 = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID' });
      meta.mode = 'dead';
      await pixel.trackOrderPaid(ids.ws!, o2.id);
      await wait();
      expect((await events()).find((e) => e.eventId === `purchase-order-${o2.id}`)!.status).toBe(
        'DEAD',
      );
      meta.mode = 'ok';
    });

    it('sends nothing when Conversions API is off or the Pixel is disconnected, and disconnecting removes the token', async () => {
      const o = await auth(ids.owner!);
      await http().put(P()).set(o).send({ conversionsApi: false }).expect(200); // changes the fingerprint's inputs? no: a switch only
      const v = (await http().get(P()).set(o)).body;
      expect(v.conversionsApi).toBe(false);
      const paid = await mkOrder({ paidMinor: 250_000, paymentStatus: 'PAID' });
      await pixel.trackOrderPaid(ids.ws!, paid.id);
      await wait();
      expect((await events()).some((e) => e.eventId === `purchase-order-${paid.id}`)).toBe(false);
      await http().put(P()).set(o).send({ conversionsApi: true }).expect(200);
      const gone = await http().delete(P()).set(o).expect(200);
      expect(gone.body).toMatchObject({
        hasToken: false,
        enabled: false,
        status: 'NOT_CONFIGURED',
      });
      await pixel.trackOrderPaid(ids.ws!, paid.id);
      await wait();
      expect((await events()).some((e) => e.eventId === `purchase-order-${paid.id}`)).toBe(false);
    });
  },
);
