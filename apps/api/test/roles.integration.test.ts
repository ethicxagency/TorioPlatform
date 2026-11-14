import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { ROLE_TEMPLATES } from '@torio/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service';

/**
 * Real-PostgreSQL tests for custom roles: creation from templates, validation, enforcement of a custom role by the API,
 * privilege-escalation refusals, workspace isolation, deletion with reassignment, audit, and the unchanged system roles.
 * Needs TEST_DATABASE_URL with the custom_roles migration applied.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('custom roles and permissions (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let auth: (id: string) => Promise<{ Authorization: string }>;
  const sfx = Math.random().toString(36).slice(2, 8);
  const ids = {} as Record<string, string>;
  const http = () => request(app.getHttpServer());
  const W = () => `/api/v1/workspaces/${ids.ws}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.THROTTLE_DISABLED = 'true';
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
    const [owner, admin, admin2, agent, agent2, outsider] = await Promise.all(
      ['owner', 'admin', 'admin2', 'agent', 'agent2', 'outsider'].map(mk),
    );
    const ws = await db.workspace.create({ data: { name: 'Roles', slug: `roles-${sfx}` } });
    const wsB = await db.workspace.create({ data: { name: 'Other', slug: `roles-b-${sfx}` } });
    const mem = async (workspaceId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') =>
      (await db.workspaceMembership.create({ data: { workspaceId, userId, role } })).id;
    ids.mOwner = await mem(ws.id, owner!.id, 'OWNER');
    ids.mAdmin = await mem(ws.id, admin!.id, 'ADMIN');
    ids.mAdmin2 = await mem(ws.id, admin2!.id, 'ADMIN');
    ids.mAgent = await mem(ws.id, agent!.id, 'AGENT');
    ids.mAgent2 = await mem(ws.id, agent2!.id, 'AGENT');
    ids.mOut = await mem(wsB.id, outsider!.id, 'OWNER');
    for (const u of [owner!, admin!, admin2!, agent!, agent2!, outsider!])
      await db.session.create({
        data: {
          userId: u.id,
          familyId: randomUUID(),
          refreshTokenHash: `${u.id}-${sfx}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    Object.assign(ids, {
      owner: owner!.id,
      admin: admin!.id,
      admin2: admin2!.id,
      agent: agent!.id,
      agent2: agent2!.id,
      outsider: outsider!.id,
      ws: ws.id,
      wsB: wsB.id,
    });
  });

  afterAll(async () => {
    await db.workspaceMembership.deleteMany({
      where: { workspaceId: { in: [ids.ws!, ids.wsB!] } },
    });
    await db.workspace.deleteMany({ where: { id: { in: [ids.ws!, ids.wsB!] } } });
    await db.user.deleteMany({
      where: {
        id: { in: [ids.owner!, ids.admin!, ids.admin2!, ids.agent!, ids.agent2!, ids.outsider!] },
      },
    });
    await db.$disconnect();
    await app.close();
  });

  const supportPerms = ROLE_TEMPLATES.find((t) => t.key === 'customer_support')!.permissions;
  let roleId = '';

  it('system roles are unchanged: admins and agents cannot manage roles, everyone with members:read can see them', async () => {
    const list = await http()
      .get(`${W()}/roles`)
      .set(await auth(ids.agent!))
      .expect(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual(['OWNER', 'ADMIN', 'AGENT']);
    const owner = list.body.data[0];
    expect([owner.editable, owner.kind]).toEqual([false, 'SYSTEM']);
    expect(owner.memberCount).toBe(1);
    expect(list.body.data[1].memberCount).toBe(2);
    const body = { name: 'Support', permissions: supportPerms };
    await http()
      .post(`${W()}/roles`)
      .set(await auth(ids.admin!))
      .send(body)
      .expect(403);
    await http()
      .post(`${W()}/roles`)
      .set(await auth(ids.agent!))
      .send(body)
      .expect(403);
    const tpl = await http()
      .get(`${W()}/roles/templates`)
      .set(await auth(ids.admin!))
      .expect(200);
    expect(tpl.body.data.map((t: { key: string }) => t.key)).toContain('customer_support');
  });

  it('the owner creates a role from a template; names and permissions are validated on the server', async () => {
    const owner = await auth(ids.owner!);
    const made = await http()
      .post(`${W()}/roles`)
      .set(owner)
      .send({
        name: 'Support',
        description: 'Answers customers',
        templateKey: 'customer_support',
        permissions: supportPerms,
      })
      .expect(201);
    roleId = made.body.id;
    expect(made.body.permissions).toEqual(
      expect.arrayContaining(['conversations:reply', 'workspace:read']),
    );
    expect(made.body.permissions).not.toContain('members:manage');
    const bad = (permissions: string[], name = 'X1') =>
      http().post(`${W()}/roles`).set(owner).send({ name, permissions });
    expect((await bad(['made:up'])).status).toBe(400);
    expect((await bad(['workspace:delete'])).status).toBe(400); // owner-only keys can never be in a role
    expect((await bad(['roles:manage'])).status).toBe(400);
    expect((await bad(['leads:read'], 'support')).status).toBe(409); // names are unique ignoring case
    expect((await bad(['leads:read'], 'Admin')).status).toBe(409);
    expect((await bad(['leads:read'], 'a')).status).toBe(400);
    const baseline = await bad([], 'Empty role');
    expect(baseline.status).toBe(201);
    expect(baseline.body.permissions).toEqual(['workspace:read']); // the baseline is always there
    await http().delete(`${W()}/roles/${baseline.body.id}`).set(owner).send({}).expect(204);
  });

  it('the API enforces a custom role: the member gets exactly its permissions, nothing from the old role', async () => {
    const owner = await auth(ids.owner!);
    const leadsOnly = await http()
      .post(`${W()}/roles`)
      .set(owner)
      .send({ name: 'Leads only', permissions: ['leads:read'] })
      .expect(201);
    // before: a plain agent reads customers
    await http()
      .get(`${W()}/customers`)
      .set(await auth(ids.agent2!))
      .expect(200);
    await http()
      .patch(`${W()}/members/${ids.mAgent2}`)
      .set(owner)
      .send({ customRoleId: leadsOnly.body.id })
      .expect(200);
    const a2 = await auth(ids.agent2!);
    await http().get(`${W()}/customers`).set(a2).expect(403);
    await http().get(`${W()}/leads`).set(a2).expect(200);
    const mine = await http().get('/api/v1/workspaces').set(a2).expect(200);
    const row = mine.body.find((w: { id: string }) => w.id === ids.ws);
    expect(row.customRole.name).toBe('Leads only');
    expect(row.permissions).toEqual(['workspace:read', 'leads:read']);
    expect(row.role).toBe('AGENT'); // the base role stays AGENT
    const m = await db.workspaceMembership.findUnique({ where: { id: ids.mAgent2! } });
    expect([m?.role, m?.customRoleId]).toEqual(['AGENT', leadsOnly.body.id]);
    // changing the role takes effect on the very next request
    await http()
      .patch(`${W()}/roles/${leadsOnly.body.id}`)
      .set(owner)
      .send({ permissions: ['leads:read', 'customers:read'] })
      .expect(200);
    await http().get(`${W()}/customers`).set(a2).expect(200);
    const shrink = await http()
      .patch(`${W()}/roles/${leadsOnly.body.id}`)
      .set(owner)
      .send({ permissions: ['leads:read'] })
      .expect(200);
    expect(shrink.body.affectedMembers).toBe(1); // the UI warns before this
    await http().get(`${W()}/customers`).set(a2).expect(403);
    ids.leadsOnly = leadsOnly.body.id;
  });

  it('nobody can hand out more than they hold, give a role to an owner, an admin or themselves, or use another workspace’s role', async () => {
    const owner = await auth(ids.owner!);
    const admin = await auth(ids.admin!);
    const billing = await http()
      .post(`${W()}/roles`)
      .set(owner)
      .send({ name: 'Billing manager', permissions: ['billing:manage', 'billing:read'] })
      .expect(201);
    // an admin does not hold billing:manage, so cannot give a role that carries it
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(admin)
      .send({ customRoleId: billing.body.id })
      .expect(403);
    // an admin can give a role within their own authority to an agent...
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(admin)
      .send({ customRoleId: roleId })
      .expect(200);
    // ...but not to another admin, to the owner, or to themselves
    await http()
      .patch(`${W()}/members/${ids.mAdmin2}`)
      .set(admin)
      .send({ customRoleId: roleId })
      .expect(403);
    await http()
      .patch(`${W()}/members/${ids.mOwner}`)
      .set(admin)
      .send({ customRoleId: roleId })
      .expect(403);
    await http()
      .patch(`${W()}/members/${ids.mAdmin}`)
      .set(admin)
      .send({ customRoleId: roleId })
      .expect(403);
    await http()
      .patch(`${W()}/members/${ids.mOwner}`)
      .set(owner)
      .send({ customRoleId: roleId })
      .expect(403);
    // a member holding a custom role (even with members:manage) cannot create or change roles
    const withManage = await http()
      .post(`${W()}/roles`)
      .set(owner)
      .send({ name: 'People manager', permissions: ['members:read', 'members:manage'] })
      .expect(201);
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(owner)
      .send({ customRoleId: withManage.body.id })
      .expect(200);
    const pm = await auth(ids.agent!);
    await http()
      .post(`${W()}/roles`)
      .set(pm)
      .send({ name: 'Mine', permissions: ['leads:read'] })
      .expect(403);
    await http().patch(`${W()}/roles/${roleId}`).set(pm).send({ name: 'Hacked' }).expect(403);
    // a custom-role member can never manage an admin or the owner either
    await http()
      .patch(`${W()}/members/${ids.mAdmin}`)
      .set(pm)
      .send({ status: 'SUSPENDED' })
      .expect(403);
    // workspace isolation
    const outsider = await auth(ids.outsider!);
    await http().get(`${W()}/roles`).set(outsider).expect(404);
    await http()
      .post(`${W()}/roles`)
      .set(outsider)
      .send({ name: 'Nope', permissions: [] })
      .expect(404);
    const other = await http()
      .post(`/api/v1/workspaces/${ids.wsB}/roles`)
      .set(outsider)
      .send({ name: 'Other role', permissions: ['leads:read'] })
      .expect(201);
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(owner)
      .send({ customRoleId: other.body.id })
      .expect(404); // a role from another workspace does not exist here
    await http()
      .patch(`/api/v1/workspaces/${ids.wsB}/roles/${roleId}`)
      .set(outsider)
      .send({ name: 'Taken' })
      .expect(404);
    expect(
      (await http().get(`/api/v1/workspaces/${ids.wsB}/roles`).set(outsider)).body.data.map(
        (r: { name: string }) => r.name,
      ),
    ).not.toContain('Support');
    ids.withManage = withManage.body.id;
    ids.billing = billing.body.id;
  });

  it('a system role replaces a custom one, duplicating copies the permissions, and deleting needs a reassignment', async () => {
    const owner = await auth(ids.owner!);
    // giving a system role removes the custom role
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(owner)
      .send({ role: 'AGENT' })
      .expect(200);
    expect(
      (await db.workspaceMembership.findUnique({ where: { id: ids.mAgent! } }))?.customRoleId,
    ).toBeNull();
    await http()
      .patch(`${W()}/members/${ids.mAgent}`)
      .set(owner)
      .send({ role: 'AGENT', customRoleId: roleId })
      .expect(400);
    const copy = await http().post(`${W()}/roles/${roleId}/duplicate`).set(owner).expect(201);
    expect(copy.body.name).toBe('Support copy');
    expect(copy.body.permissions).toEqual(
      (await http().get(`${W()}/roles/${roleId}`).set(owner)).body.permissions,
    );
    // delete refused while members use it, then allowed with a reassignment
    await http().delete(`${W()}/roles/${ids.leadsOnly}`).set(owner).send({}).expect(400);
    await http()
      .delete(`${W()}/roles/${ids.leadsOnly}`)
      .set(owner)
      .send({ reassignTo: ids.leadsOnly })
      .expect(400);
    await http()
      .delete(`${W()}/roles/${ids.leadsOnly}`)
      .set(owner)
      .send({ reassignTo: 'OWNER' })
      .expect(400);
    await http()
      .delete(`${W()}/roles/${ids.leadsOnly}`)
      .set(owner)
      .send({ reassignTo: 'AGENT' })
      .expect(204);
    const moved = await db.workspaceMembership.findUnique({ where: { id: ids.mAgent2! } });
    expect([moved?.role, moved?.customRoleId]).toEqual(['AGENT', null]);
    await http()
      .get(`${W()}/customers`)
      .set(await auth(ids.agent2!))
      .expect(200); // back to the agent role's access
    await http().delete(`${W()}/roles/${copy.body.id}`).set(owner).send({}).expect(204);
    // the owner role and system roles cannot be changed or deleted through the roles API
    await http().patch(`${W()}/roles/OWNER`).set(owner).send({ name: 'X1' }).expect(400);
    await http().delete(`${W()}/roles/ADMIN`).set(owner).send({}).expect(400);
  });

  it('records role and assignment changes in the audit log, without secrets', async () => {
    const rows = await db.auditLog.findMany({
      where: {
        workspaceId: ids.ws!,
        action: { in: ['role.create', 'role.update', 'role.delete', 'member.role_change'] },
      },
    });
    const actions = rows.map((r) => r.action);
    for (const a of ['role.create', 'role.update', 'role.delete', 'member.role_change'])
      expect(actions).toContain(a);
    const update = rows.find((r) => r.action === 'role.update')!;
    expect((update.metadata as { removed?: string[] }).removed).toBeDefined();
    expect(rows.every((r) => r.actorId !== null)).toBe(true);
    expect(JSON.stringify(rows.map((r) => r.metadata))).not.toMatch(/password|token|secret/i);
  });
});
