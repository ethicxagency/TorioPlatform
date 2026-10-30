import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationEngine } from '../src/modules/automation/automation.engine';

/** Real-PostgreSQL tests for the automation engine and API. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('automation (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let engine: AutomationEngine;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}/automations`;
  const http = () => request(app.getHttpServer());
  const step = {
    gate: (field: string, op: string, value: string, id = 'g') => ({
      id,
      type: 'condition',
      conditions: [{ field, op, value }],
    }),
    note: (text: string, id = 'n') => ({
      id,
      type: 'action',
      action: 'add_order_note',
      config: { text },
    }),
  };
  const def = (trigger: string, steps: unknown[]) => ({
    schemaVersion: 1,
    trigger: { type: trigger },
    steps,
  });
  /** Creates, fills, and activates an automation as the owner. */
  async function make(name: string, trigger: string, steps: unknown[], activate = true) {
    const o = await auth(ids.owner!);
    const c = (await http().post(base()).set(o).send({ name, trigger }).expect(201)).body;
    await http()
      .patch(`${base()}/${c.id}`)
      .set(o)
      .send({ definition: def(trigger, steps) })
      .expect(200);
    if (activate) await http().post(`${base()}/${c.id}/publish`).set(o).expect(200);
    return c.id as string;
  }
  const newOrder = async (unit: number) =>
    (
      await http()
        .post(`/api/v1/workspaces/${ids.wsA}/orders`)
        .set(await auth(ids.agent!))
        .send({
          customerId: ids.cust,
          currency: 'USD',
          items: [{ name: 'Thing', quantity: 1, unitPriceMinor: unit }],
          requestId: randomUUID(),
        })
        .expect(201)
    ).body;
  const runs = (automationId: string) =>
    db.automationExecution.findMany({ where: { automationId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    engine = app.get(AutomationEngine);
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, agent, outsider] = await Promise.all([mk('owner'), mk('agent'), mk('outsider')]);
    const wsA = await db.workspace.create({ data: { name: 'A', slug: `aua-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'B', slug: `aub-${sfx}` } });
    await db.workspaceMembership.createMany({
      data: [
        { workspaceId: wsA.id, userId: owner.id, role: 'OWNER' },
        { workspaceId: wsA.id, userId: agent.id, role: 'AGENT' },
        { workspaceId: wsB.id, userId: outsider.id, role: 'OWNER' },
      ],
    });
    const cust = await db.customer.create({ data: { workspaceId: wsA.id, name: 'Nadia' } });
    const ch = await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'WA', status: 'CONNECTED' },
    });
    const conv = await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: ch.id, customerId: cust.id },
    });
    Object.assign(ids, {
      owner: owner.id,
      agent: agent.id,
      outsider: outsider.id,
      wsA: wsA.id,
      wsB: wsB.id,
      cust: cust.id,
      conv: conv.id,
    });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.auditLog.deleteMany({
      where: { actorId: { in: [ids.owner!, ids.agent!, ids.outsider!] } },
    });
    await db.user.deleteMany({ where: { id: { in: [ids.owner!, ids.agent!, ids.outsider!] } } });
    await db.$disconnect();
    await app.close();
  });

  it('creates drafts from a template or a trigger, rejects unknown triggers, and enforces permissions', async () => {
    const owner = await auth(ids.owner!);
    const agent = await auth(ids.agent!);
    const t = (
      await http()
        .post(base())
        .set(owner)
        .send({ name: 'From template', templateKey: 'flag-large-orders' })
        .expect(201)
    ).body;
    expect(t).toMatchObject({
      status: 'DRAFT',
      triggerType: 'order.created',
      stepCount: 2,
      publishedVersion: 0,
    });
    await http().post(base()).set(owner).send({ name: 'x', trigger: 'order.exploded' }).expect(400);
    await http().post(base()).set(owner).send({ name: 'x' }).expect(400);
    await http().post(base()).set(owner).send({ name: 'x', templateKey: 'nope' }).expect(400);
    // agents can read but not create, edit, test or activate
    expect((await http().get(base()).set(agent).expect(200)).body.meta.total).toBeGreaterThan(0);
    await http().post(base()).set(agent).send({ name: 'y', trigger: 'order.created' }).expect(403);
    await http().patch(`${base()}/${t.id}`).set(agent).send({ name: 'z' }).expect(403);
    await http().post(`${base()}/${t.id}/publish`).set(agent).expect(403);
    await http().post(`${base()}/${t.id}/test`).set(agent).send({}).expect(403);
    await http().get(base()).expect(401);
  });

  it('validates definitions server-side and blocks activation until they are valid', async () => {
    const owner = await auth(ids.owner!);
    const id = await make(
      'Invalid',
      'conversation.assigned',
      [{ id: 'a', type: 'action', action: 'add_order_note', config: { text: 'x' } }],
      false,
    );
    const v = (await http().post(`${base()}/${id}/validate`).set(owner).expect(200)).body;
    expect(v.ok).toBe(false);
    expect(v.issues[0].message).toMatch(/needs a order/);
    const r = await http().post(`${base()}/${id}/publish`).set(owner).expect(400);
    expect(r.body.error.message).toMatch(/Fix 1 problem/);
    // unknown step types and scripts never get stored
    await http()
      .patch(`${base()}/${id}`)
      .set(owner)
      .send({
        definition: def('order.created', [{ id: 'x', type: 'script', code: 'process.exit()' }]),
      })
      .expect(400);
    // assignee must be an active member of THIS workspace
    const lead = await make(
      'Assign',
      'lead.created',
      [{ id: 'a', type: 'action', action: 'assign_lead_owner', config: { userId: ids.outsider } }],
      false,
    );
    expect(
      (await http().post(`${base()}/${lead}/validate`).set(owner)).body.issues[0].message,
    ).toMatch(/isn’t an active member/);
    // stale editors get 409
    const cur = (await http().get(`${base()}/${id}`).set(owner)).body;
    await http()
      .patch(`${base()}/${id}`)
      .set(owner)
      .send({ definition: cur.definition, baseRevision: cur.draftRevision - 1 })
      .expect(409);
  });

  it('runs an active automation when the real event happens: matching runs act, others skip', async () => {
    const id = await make('Large orders', 'order.created', [
      step.gate('order.total', 'gt', '100'),
      step.note('Big order #{{order.number}} for {{customer.name}}'),
    ]);
    const small = await newOrder(5_000);
    const large = await newOrder(25_000);
    expect(await engine.tick()).toBe(2);
    const [r1, r2] = await runs(id);
    expect(r1).toMatchObject({ status: 'SKIPPED', entityId: small.id });
    expect(r2).toMatchObject({ status: 'SUCCEEDED', entityId: large.id });
    const notes = await db.orderNote.findMany({ where: { orderId: large.id } });
    expect(notes).toHaveLength(1);
    // the note is credited to the automation
    expect(notes[0]!.body).toBe(
      `Big order #${large.number} for Nadia\n— Automation “Large orders”`,
    );
    expect(await db.orderNote.count({ where: { orderId: small.id } })).toBe(0);
    // the stored context never holds contact details
    expect(JSON.stringify(r2!.context)).not.toMatch(/email|phone/i);
    // replaying the same event can't start a second run
    await engine.emitEvent('order.created', ids.wsA!, 'order', large.id, 'created');
    expect(await runs(id)).toHaveLength(2);
    expect(await engine.tick()).toBe(0);
    expect(await db.orderNote.count({ where: { orderId: large.id } })).toBe(1);
  });

  it('only runs for its own workspace, and drafts / deactivated automations never run', async () => {
    const draft = await make('Draft only', 'order.created', [step.note('x')], false);
    const o = await newOrder(1_000);
    expect(await engine.tick()).toBe(1); // only the active automation picks it up
    expect(await runs(draft)).toHaveLength(0);
    // an event in workspace B can't reach workspace A's automation
    const before = await db.automationExecution.count({ where: { workspaceId: ids.wsA! } });
    const custB = await db.customer.create({ data: { workspaceId: ids.wsB!, name: 'B cust' } });
    await db.order.create({
      data: {
        workspaceId: ids.wsB!,
        number: 1001,
        customerId: custB.id,
        currency: 'USD',
        subtotalMinor: 9,
        totalMinor: 9,
      },
    });
    const ob = await db.order.findFirstOrThrow({ where: { workspaceId: ids.wsB! } });
    await engine.emitEvent('order.created', ids.wsB!, 'order', ob.id, 'created');
    expect(await db.automationExecution.count({ where: { workspaceId: ids.wsA! } })).toBe(before);
    // an order id from another workspace can't be used as context in this one
    await engine.emitEvent('order.created', ids.wsA!, 'order', ob.id, 'created');
    expect(await db.automationExecution.count({ where: { workspaceId: ids.wsA! } })).toBe(before);
    expect(o.id).toBeTruthy();
  });

  it('wait steps persist across ticks, and deactivating cancels waiting runs', async () => {
    const id = await make('Follow up', 'conversation.assigned', [
      { id: 'w', type: 'wait', minutes: 60 },
      {
        id: 'n',
        type: 'action',
        action: 'add_conversation_note',
        config: { text: 'Check on {{customer.name}}' },
      },
    ]);
    await http()
      .patch(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}`)
      .set(await auth(ids.owner!))
      .send({ assigneeId: ids.agent })
      .expect(200);
    await engine.tick();
    const [w] = await runs(id);
    expect(w).toMatchObject({ status: 'WAITING', currentStep: 1 });
    expect(await db.message.count({ where: { conversationId: ids.conv!, kind: 'NOTE' } })).toBe(0);
    expect(await engine.tick()).toBe(0); // not due yet
    await db.automationExecution.update({
      where: { id: w!.id },
      data: { resumeAt: new Date(Date.now() - 1000) },
    });
    expect(await engine.tick()).toBe(1);
    expect((await runs(id))[0]).toMatchObject({ status: 'SUCCEEDED', currentStep: 2 });
    const note = await db.message.findFirstOrThrow({
      where: { conversationId: ids.conv!, kind: 'NOTE' },
    });
    expect(note.body).toContain('Check on Nadia');

    // second event, then deactivate while it waits
    await http()
      .patch(`/api/v1/workspaces/${ids.wsA}/conversations/${ids.conv}`)
      .set(await auth(ids.owner!))
      .send({ assigneeId: null })
      .expect(200);
    await engine.tick();
    const waiting = (await runs(id)).find((r) => r.status === 'WAITING')!;
    expect(waiting).toBeTruthy();
    await http()
      .post(`${base()}/${id}/deactivate`)
      .set(await auth(ids.owner!))
      .expect(200);
    expect((await db.automationExecution.findUnique({ where: { id: waiting.id } }))?.status).toBe(
      'CANCELLED',
    );
    await http()
      .post(`${base()}/${id}/deactivate`)
      .set(await auth(ids.owner!))
      .expect(409);
    expect((await runs(id)).filter((r) => r.status === 'SUCCEEDED')).toHaveLength(1); // history kept
  });

  it('fails permanently on bad data without retrying, and retry resumes from the failed step only', async () => {
    const o = await auth(ids.owner!);
    const lead = await db.lead.create({
      data: { workspaceId: ids.wsA!, name: 'L', source: 'MANUAL' },
    });
    const tmp = await db.user.create({
      data: { email: `tmp-${sfx}@t.co`, name: 'Tmp', passwordHash: 'x' },
    });
    const m = await db.workspaceMembership.create({
      data: { workspaceId: ids.wsA!, userId: tmp.id, role: 'AGENT' },
    });
    const id = await make('Own leads', 'lead.stage_changed', [
      { id: 'a', type: 'action', action: 'assign_lead_owner', config: { userId: tmp.id } },
      { id: 'b', type: 'action', action: 'set_lead_stage', config: { stage: 'QUALIFIED' } },
    ]);
    await db.workspaceMembership.update({ where: { id: m.id }, data: { status: 'SUSPENDED' } });
    await http()
      .patch(`/api/v1/workspaces/${ids.wsA}/leads/${lead.id}`)
      .set(o)
      .send({ stage: 'CONTACTED' })
      .expect(200);
    await engine.tick();
    const failed = (await runs(id))[0]!;
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1, currentStep: 0 });
    expect(failed.error).toMatch(/no longer an active member/);
    expect(await engine.tick()).toBe(0); // permanent: not retried automatically
    // fix the cause, then retry
    await db.workspaceMembership.update({ where: { id: m.id }, data: { status: 'ACTIVE' } });
    await http()
      .post(`${base()}/executions/${failed.id}/retry`)
      .set(await auth(ids.agent!))
      .expect(403);
    await http().post(`${base()}/executions/${failed.id}/retry`).set(o).expect(200);
    await engine.tick();
    const done = (await runs(id))[0]!;
    expect(done).toMatchObject({ status: 'SUCCEEDED', currentStep: 2 });
    const l = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l).toMatchObject({ ownerId: tmp.id, stage: 'QUALIFIED' });
    await http().post(`${base()}/executions/${failed.id}/retry`).set(o).expect(409); // no longer failed
    // automation-made changes never emit events, so this can't loop
    expect(await runs(id)).toHaveLength(1);
    await db.workspaceMembership.delete({ where: { id: m.id } });
    await db.user.delete({ where: { id: tmp.id } });
  });

  it('versions are immutable; edits stay in the draft until published', async () => {
    const o = await auth(ids.owner!);
    const id = await make('Versioned', 'customer.created', [
      { id: 'a', type: 'action', action: 'add_customer_tag', config: { tag: 'v1' } },
    ]);
    const live = (await http().get(`${base()}/${id}`).set(o)).body;
    expect(live).toMatchObject({
      status: 'ACTIVE',
      publishedVersion: 1,
      hasUnpublishedChanges: false,
    });
    await http()
      .patch(`${base()}/${id}`)
      .set(o)
      .send({
        definition: def('customer.created', [
          { id: 'a', type: 'action', action: 'add_customer_tag', config: { tag: 'v2' } },
        ]),
      })
      .expect(200);
    expect((await http().get(`${base()}/${id}`).set(o)).body.hasUnpublishedChanges).toBe(true);
    await http()
      .post(`/api/v1/workspaces/${ids.wsA}/customers`)
      .set(o)
      .send({ name: 'Zed' })
      .expect(201);
    await engine.tick();
    const cust = await db.customer.findFirstOrThrow({
      where: { workspaceId: ids.wsA!, name: 'Zed' },
    });
    expect(cust.tags).toEqual(['v1']); // ran the published version, not the draft
    await http().post(`${base()}/${id}/publish`).set(o).expect(200);
    const versions = await db.automationVersion.findMany({
      where: { automationId: id },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect((await runs(id))[0]!.version).toBe(1);
  });

  it('test runs simulate only: nothing is changed, and they stay out of history and metrics', async () => {
    const o = await auth(ids.owner!);
    const id = await make(
      'Tester',
      'order.created',
      [
        step.gate('order.total', 'gt', '100'),
        step.note('Hello {{customer.name}} #{{order.number}}'),
      ],
      false,
    );
    const before = await db.orderNote.count({ where: { workspaceId: ids.wsA! } });
    const r = (
      await http()
        .post(`${base()}/${id}/test`)
        .set(o)
        .send({ sample: { 'order.total': 500, 'customer.name': 'ignored' } })
        .expect(200)
    ).body;
    expect(r.execution).toMatchObject({ isTest: true, status: 'SUCCEEDED' });
    expect(r.execution.steps.map((s: { status: string }) => s.status)).toEqual([
      'simulated',
      'simulated',
    ]);
    expect(r.execution.steps[1].message).toContain('Nothing was changed');
    const miss = (
      await http()
        .post(`${base()}/${id}/test`)
        .set(o)
        .send({ sample: { 'order.total': 5 } })
    ).body;
    expect(miss.execution.status).toBe('SKIPPED');
    expect(await db.orderNote.count({ where: { workspaceId: ids.wsA! } })).toBe(before);
    const hist = (await http().get(`${base()}/executions?automationId=${id}`).set(o)).body;
    expect(hist.meta.total).toBe(0);
    expect(
      (await http().get(`${base()}/executions?automationId=${id}&includeTests=true`).set(o)).body
        .meta.total,
    ).toBe(2);
    const broken = await make('Broken', 'order.created', [step.note('x', 'n')], false);
    await http()
      .patch(`${base()}/${broken}`)
      .set(o)
      .send({ definition: def('order.created', []) })
      .expect(200);
    const t = (await http().post(`${base()}/${broken}/test`).set(o).send({})).body;
    expect(t.execution.status).toBe('FAILED');
    expect(t.execution.error).toMatch(/Not runnable/);
  });

  it('lists, filters, summarises, duplicates, renames and deletes', async () => {
    const o = await auth(ids.owner!);
    const list = (await http().get(`${base()}?status=ACTIVE&sort=name&dir=asc`).set(o).expect(200))
      .body;
    expect(list.data.every((a: { status: string }) => a.status === 'ACTIVE')).toBe(true);
    const large = list.data.find((a: { name: string }) => a.name === 'Large orders');
    expect(large).toMatchObject({ runs: 3, failed: 0 });
    expect(large.lastRunAt).not.toBeNull();
    expect((await http().get(`${base()}?q=large`).set(o)).body.data).toHaveLength(1);
    expect(
      (await http().get(`${base()}?trigger=lead.created`).set(o)).body.data.every(
        (a: { triggerType: string }) => a.triggerType === 'lead.created',
      ),
    ).toBe(true);
    await http().get(`${base()}?status=BOGUS`).set(o).expect(400);
    expect(
      (await http().get(`${base()}?sort=lastRun`).set(o).expect(200)).body.data.length,
    ).toBeGreaterThan(0);
    const s = (await http().get(`${base()}/summary`).set(o).expect(200)).body;
    expect(s.total).toBeGreaterThan(3);
    expect(s.active).toBeGreaterThan(0);
    expect(s.failed).toBe(0); // the failed run was retried and succeeded
    expect(s.succeeded).toBeGreaterThanOrEqual(3);
    const dup = (await http().post(`${base()}/${large.id}/duplicate`).set(o).expect(201)).body;
    expect(dup).toMatchObject({ name: 'Copy of Large orders', status: 'DRAFT', stepCount: 2 });
    const ren = (
      await http().patch(`${base()}/${dup.id}`).set(o).send({ name: 'Renamed' }).expect(200)
    ).body;
    expect(ren.name).toBe('Renamed');
    await http().delete(`${base()}/${large.id}`).set(o).expect(409); // active
    await http()
      .delete(`${base()}/${dup.id}`)
      .set(await auth(ids.agent!))
      .expect(403);
    await http().delete(`${base()}/${dup.id}`).set(o).expect(204);
    await http().get(`${base()}/${dup.id}`).set(o).expect(404);
    expect(
      await db.auditLog.count({ where: { workspaceId: ids.wsA!, action: 'automation.activate' } }),
    ).toBeGreaterThan(0);
  });

  it('isolates tenants', async () => {
    const out = await auth(ids.outsider!);
    await http().get(base()).set(out).expect(404);
    const mine = await db.automation.findFirstOrThrow({ where: { workspaceId: ids.wsA! } });
    await http().get(`/api/v1/workspaces/${ids.wsB}/automations/${mine.id}`).set(out).expect(404);
    await http()
      .post(`/api/v1/workspaces/${ids.wsB}/automations/${mine.id}/publish`)
      .set(out)
      .expect(404);
    const ex = await db.automationExecution.findFirstOrThrow({ where: { workspaceId: ids.wsA! } });
    await http()
      .get(`/api/v1/workspaces/${ids.wsB}/automations/executions/${ex.id}`)
      .set(out)
      .expect(404);
    const detail = (
      await http()
        .get(`${base()}/executions/${ex.id}`)
        .set(await auth(ids.owner!))
        .expect(200)
    ).body;
    expect(detail.plannedSteps.length).toBeGreaterThan(0);
  });
});
