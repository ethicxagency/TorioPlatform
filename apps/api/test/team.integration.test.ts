import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Real-PostgreSQL tests for team management: roles, invitations, teams, tenant isolation. Needs TEST_DATABASE_URL. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('team management (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const base = () => `/api/v1/workspaces/${ids.wsA}`;
  const http = () => request(app.getHttpServer());
  const tokenFrom = (inviteUrl: string) => new URL(inviteUrl).searchParams.get('token')!;

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureApp(app);
    await app.init();
    db = createPrismaClient(url!);
    const jwt = app.get(JwtService);
    auth = async (id) => ({
      Authorization: `Bearer ${await jwt.signAsync({ sub: id, sid: 's' })}`,
    });
    const mk = (n: string) =>
      db.user.create({ data: { email: `${n}-${sfx}@t.co`, name: n, passwordHash: 'x' } });
    const [owner, admin, admin2, agent, agent2, outsider] = await Promise.all(
      ['owner', 'admin', 'admin2', 'agent', 'agent2', 'outsider'].map(mk),
    );
    Object.assign(ids, {
      owner: owner!.id,
      admin: admin!.id,
      admin2: admin2!.id,
      agent: agent!.id,
      agent2: agent2!.id,
      outsider: outsider!.id,
    });
    const wsA = await db.workspace.create({ data: { name: 'Team A', slug: `ta-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'Team B', slug: `tb-${sfx}` } });
    Object.assign(ids, { wsA: wsA.id, wsB: wsB.id });
    const m = (workspaceId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') => ({
      workspaceId,
      userId,
      role,
    });
    await db.workspaceMembership.createMany({
      data: [
        m(wsA.id, owner!.id, 'OWNER'),
        m(wsA.id, admin!.id, 'ADMIN'),
        m(wsA.id, admin2!.id, 'ADMIN'),
        m(wsA.id, agent!.id, 'AGENT'),
        m(wsA.id, agent2!.id, 'AGENT'),
        m(wsB.id, outsider!.id, 'OWNER'),
      ],
    });
    const mem = await db.workspaceMembership.findMany({ where: { workspaceId: wsA.id } });
    for (const x of mem) ids[`m_${x.userId}`] = x.id;
    const ch = await db.channel.create({
      data: { workspaceId: wsA.id, provider: 'WHATSAPP', displayName: 'WA' },
    });
    const cust = await db.customer.create({
      data: { workspaceId: wsA.id, name: 'C', isSample: true },
    });
    await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: ch.id, customerId: cust.id, assigneeId: agent!.id },
    });
    await db.conversation.create({
      data: { workspaceId: wsA.id, channelId: ch.id, customerId: cust.id },
    });
    const lead = await db.lead.create({
      data: { workspaceId: wsA.id, name: 'L', ownerId: agent!.id },
    });
    ids.lead = lead.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA!, ids.wsB!] } } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${sfx}@t.co` } } });
    await db.user.deleteMany({ where: { email: { startsWith: `new-${sfx}` } } });
    await db.$disconnect();
    await app.close();
  });

  it('summary and directory report real data (workload, no fabricated presence)', async () => {
    const h = await auth(ids.agent!);
    const s = (await http().get(`${base()}/team/summary`).set(h).expect(200)).body;
    expect(s).toEqual({
      totalMembers: 5,
      activeMembers: 5,
      suspendedMembers: 0,
      pendingInvitations: 0,
      unassignedOpenConversations: 1,
    });
    const list = (await http().get(`${base()}/members`).set(h).expect(200)).body;
    expect(list.meta.total).toBe(5);
    const agent = list.data.find((x: { userId: string }) => x.userId === ids.agent);
    expect(agent).toMatchObject({
      role: 'AGENT',
      status: 'ACTIVE',
      assignedOpenConversations: 1,
      lastSignInAt: null,
    });
    expect((await http().get(`${base()}/members?role=ADMIN`).set(h)).body.data).toHaveLength(2);
    expect((await http().get(`${base()}/members?q=agent2`).set(h)).body.data).toHaveLength(1);
    expect(
      (await http().get(`${base()}/members?sort=-name&pageSize=2`).set(h)).body.meta.totalPages,
    ).toBe(3);
  });

  it('tenant isolation: non-members get 404, member ids from other workspaces are unreachable', async () => {
    await http()
      .get(`${base()}/members`)
      .set(await auth(ids.outsider!))
      .expect(404);
    await http()
      .get(`${base()}/team/summary`)
      .set(await auth(ids.outsider!))
      .expect(404);
    const owner = await auth(ids.owner!);
    const other = await db.workspaceMembership.findFirstOrThrow({
      where: { workspaceId: ids.wsB! },
    });
    await http()
      .patch(`${base()}/members/${other.id}`)
      .set(owner)
      .send({ role: 'AGENT' })
      .expect(404);
    await http().delete(`${base()}/members/${other.id}`).set(owner).expect(404);
  });

  it('role management prevents privilege escalation and protects the owner', async () => {
    const owner = await auth(ids.owner!);
    const admin = await auth(ids.admin!);
    const agent = await auth(ids.agent!);
    // agents cannot manage anyone
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(agent)
      .send({ role: 'ADMIN' })
      .expect(403);
    // admin cannot promote an agent to admin, nor touch admins or the owner
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(admin)
      .send({ role: 'ADMIN' })
      .expect(403);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.admin2}`]}`)
      .set(admin)
      .send({ role: 'AGENT' })
      .expect(403);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.owner}`]}`)
      .set(admin)
      .send({ status: 'SUSPENDED' })
      .expect(403);
    await http()
      .delete(`${base()}/members/${ids[`m_${ids.owner}`]}`)
      .set(owner)
      .expect(403);
    // the owner role cannot be granted at all, and nobody changes themself
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(owner)
      .send({ role: 'OWNER' })
      .expect(400);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.owner}`]}`)
      .set(owner)
      .send({ role: 'AGENT' })
      .expect(403);
    await http()
      .delete(`${base()}/members/${ids[`m_${ids.admin}`]}`)
      .set(admin)
      .expect(403); // cannot remove yourself
    // owner promotes then admin demotes... (owner only manages admins)
    const res = await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(owner)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(res.body.role).toBe('ADMIN');
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(admin)
      .send({ role: 'AGENT' })
      .expect(403);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(owner)
      .send({ role: 'AGENT' })
      .expect(200);
  });

  it('suspending revokes access immediately; restoring brings it back; changes are audited', async () => {
    const admin = await auth(ids.admin!);
    const agentH = await auth(ids.agent2!);
    await http().get(`${base()}/members`).set(agentH).expect(200);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(admin)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    await http().get(`${base()}/members`).set(agentH).expect(404);
    expect((await http().get('/api/v1/workspaces').set(agentH)).body).toHaveLength(0);
    await http()
      .patch(`${base()}/members/${ids[`m_${ids.agent2}`]}`)
      .set(admin)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await http().get(`${base()}/members`).set(agentH).expect(200);
    const acts = (
      await http()
        .get(`${base()}/members/${ids[`m_${ids.agent2}`]}/activity`)
        .set(admin)
        .expect(200)
    ).body.data.map((a: { description: string }) => a.description);
    expect(acts.some((d: string) => d.includes('Access suspended'))).toBe(true);
    await http()
      .get(`${base()}/members/${ids[`m_${ids.agent2}`]}/activity`)
      .set(agentH)
      .expect(403); // audit:read is admin/owner only
  });

  it('invitations: validation, role limits, duplicates; token is single-use and stored only as a hash', async () => {
    const owner = await auth(ids.owner!);
    const admin = await auth(ids.admin!);
    const agent = await auth(ids.agent!);
    await http().post(`${base()}/invitations`).set(agent).send({ email: 'x@y.co' }).expect(403);
    await http()
      .post(`${base()}/invitations`)
      .set(admin)
      .send({ email: 'x@y.co', role: 'ADMIN' })
      .expect(403); // admins cannot mint admins
    await http()
      .post(`${base()}/invitations`)
      .set(owner)
      .send({ email: 'not-an-email' })
      .expect(400);
    await http()
      .post(`${base()}/invitations`)
      .set(owner)
      .send({ email: 'x@y.co', role: 'OWNER' })
      .expect(400);
    await http()
      .post(`${base()}/invitations`)
      .set(owner)
      .send({ email: `Agent-${sfx}@T.co` })
      .expect(409); // already a member
    const email = `new-${sfx}@example.test`;
    const created = (
      await http()
        .post(`${base()}/invitations`)
        .set(admin)
        .send({ email: email.toUpperCase(), role: 'AGENT' })
        .expect(201)
    ).body;
    expect(created).toMatchObject({ email, role: 'AGENT', status: 'PENDING', emailSent: false });
    ids.inv = created.id;
    ids.token = new URL(created.inviteUrl).searchParams.get('token')!;
    expect(created.inviteUrl).toContain('/accept-invite?token=');
    const row = await db.invitation.findUniqueOrThrow({ where: { id: created.id } });
    expect(JSON.stringify(row)).not.toContain(ids.token); // only a hash is stored
    await http().post(`${base()}/invitations`).set(admin).send({ email }).expect(409); // pending duplicate
    const list = (await http().get(`${base()}/invitations`).set(admin).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('inviteUrl'); // link only on create/resend
    await http().get(`${base()}/invitations`).set(agent).expect(403);
    expect((await http().get(`${base()}/team/summary`).set(owner)).body.pendingInvitations).toBe(1);
  });

  it('resend rotates the token (old link dies); new user accepts once, then cannot reuse', async () => {
    const admin = await auth(ids.admin!);
    const resent = (
      await http().post(`${base()}/invitations/${ids.inv}/resend`).set(admin).expect(200)
    ).body;
    const fresh = tokenFrom(resent.inviteUrl);
    expect(fresh).not.toBe(ids.token);
    await http().get(`/api/v1/invitations/preview?token=${ids.token}`).expect(404);
    expect(
      (await http().get(`/api/v1/invitations/preview?token=${fresh}`).expect(200)).body,
    ).toMatchObject({ workspaceName: 'Team A', role: 'AGENT' });
    await http()
      .post('/api/v1/invitations/accept-new')
      .send({ token: fresh, name: 'New Person', password: 'weak' })
      .expect(400);
    const ok = await http()
      .post('/api/v1/invitations/accept-new')
      .send({ token: fresh, name: 'New Person', password: 'GoodPassw0rd!' })
      .expect(200);
    expect(ok.body.workspaceId).toBe(ids.wsA);
    await http()
      .post('/api/v1/invitations/accept-new')
      .send({ token: fresh, name: 'Again', password: 'GoodPassw0rd!' })
      .expect(404);
    const user = await db.user.findUniqueOrThrow({ where: { email: `new-${sfx}@example.test` } });
    expect(user.emailVerifiedAt).not.toBeNull();
    const m = await db.workspaceMembership.findFirstOrThrow({
      where: { workspaceId: ids.wsA!, userId: user.id },
    });
    expect(m.role).toBe('AGENT');
  });

  it('existing accounts accept only with a matching email', async () => {
    const owner = await auth(ids.owner!);
    const inv = (
      await http()
        .post(`${base()}/invitations`)
        .set(owner)
        .send({ email: `outsider-${sfx}@t.co`, role: 'AGENT' })
        .expect(201)
    ).body;
    const token = tokenFrom(inv.inviteUrl);
    await http()
      .post('/api/v1/invitations/accept-new')
      .send({ token, name: 'X', password: 'GoodPassw0rd!' })
      .expect(409); // account exists: must sign in
    await http()
      .post('/api/v1/invitations/accept')
      .set(await auth(ids.agent!))
      .send({ token })
      .expect(403); // wrong email
    await http()
      .post('/api/v1/invitations/accept')
      .set(await auth(ids.outsider!))
      .send({ token })
      .expect(200);
    expect(
      (
        await http()
          .get('/api/v1/workspaces')
          .set(await auth(ids.outsider!))
      ).body,
    ).toHaveLength(2);
    await http()
      .post('/api/v1/invitations/accept')
      .set(await auth(ids.outsider!))
      .send({ token })
      .expect(404);
  });

  it('cancelling an invitation kills its link', async () => {
    const owner = await auth(ids.owner!);
    const inv = (
      await http()
        .post(`${base()}/invitations`)
        .set(owner)
        .send({ email: `cancel-${sfx}@example.test` })
        .expect(201)
    ).body;
    await http()
      .delete(`${base()}/invitations/${inv.id}`)
      .set(await auth(ids.agent!))
      .expect(403);
    await http().delete(`${base()}/invitations/${inv.id}`).set(owner).expect(204);
    await http()
      .get(`/api/v1/invitations/preview?token=${tokenFrom(inv.inviteUrl)}`)
      .expect(404);
    await http()
      .post(`${base()}/invitations`)
      .set(owner)
      .send({ email: `cancel-${sfx}@example.test` })
      .expect(201); // can re-invite after cancelling
  });

  it('teams: create, validate, duplicate names, members must belong to the workspace, edit, delete', async () => {
    const owner = await auth(ids.owner!);
    const agent = await auth(ids.agent!);
    await http().post(`${base()}/teams`).set(agent).send({ name: 'Support' }).expect(403);
    await http().post(`${base()}/teams`).set(owner).send({ name: 'x' }).expect(400);
    const t = (
      await http()
        .post(`${base()}/teams`)
        .set(owner)
        .send({
          name: 'Support',
          description: 'Tier 1',
          leadId: ids.admin,
          memberIds: [ids.agent, ids.admin],
        })
        .expect(201)
    ).body;
    expect(t).toMatchObject({ name: 'Support', lead: { id: ids.admin }, openConversations: 1 });
    expect(t.members).toHaveLength(2);
    await http().post(`${base()}/teams`).set(owner).send({ name: 'Support' }).expect(409);
    const stranger = await db.user.create({
      data: { email: `stranger-${sfx}@t.co`, name: 'Stranger', passwordHash: 'x' },
    });
    await http()
      .post(`${base()}/teams`)
      .set(owner)
      .send({ name: 'Sales', memberIds: [stranger.id] })
      .expect(400);
    const upd = (
      await http()
        .patch(`${base()}/teams/${t.id}`)
        .set(owner)
        .send({ memberIds: [ids.agent], leadId: null })
        .expect(200)
    ).body;
    expect(upd.members).toHaveLength(1);
    expect(upd.lead).toBeNull();
    expect((await http().get(`${base()}/members?team=${t.id}`).set(agent)).body.data).toHaveLength(
      1,
    );
    expect(
      (await http().get(`${base()}/teams`).set(agent).expect(200)).body.data.length,
    ).toBeGreaterThan(0);
    await http().delete(`${base()}/teams/${t.id}`).set(agent).expect(403);
    await http().delete(`${base()}/teams/${t.id}`).set(owner).expect(204);
  });

  it('removing a member clears their assignments and team links, keeps conversations, and is audited', async () => {
    const admin = await auth(ids.admin!);
    await http()
      .delete(`${base()}/members/${ids[`m_${ids.agent}`]}`)
      .set(admin)
      .expect(204);
    expect(
      await db.conversation.count({ where: { workspaceId: ids.wsA!, assigneeId: ids.agent! } }),
    ).toBe(0);
    expect(await db.conversation.count({ where: { workspaceId: ids.wsA! } })).toBe(2);
    expect((await db.lead.findUniqueOrThrow({ where: { id: ids.lead! } })).ownerId).toBeNull();
    await http()
      .get(`${base()}/members`)
      .set(await auth(ids.agent!))
      .expect(404);
    expect(
      await db.auditLog.count({ where: { workspaceId: ids.wsA!, action: 'member.remove' } }),
    ).toBe(1);
  });
});
