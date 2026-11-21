import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../src/modules/billing/entitlements.service';
import { applyOfficialPlans } from '../src/modules/billing/official-plans';
import { PLANS } from '../src/modules/billing/plans';
import { PlansService } from '../src/modules/billing/plans.service';
import type { PrismaService } from '../src/database/prisma.service';

/** Real-PostgreSQL tests for plan entitlements. Graph/payment providers are not involved: this is the plan logic itself. */
const url = process.env.TEST_DATABASE_URL;
const ROLLBACK = new Error('rollback');
const sfx = Math.random().toString(36).slice(2, 8);

describe('official plan catalog', () => {
  const by = Object.fromEntries(PLANS.map((p) => [p.key, p]));
  it('defines Starter, Growth and Scale exactly as specified', () => {
    const pick = (k: string) => {
      const p = by[k]!;
      return [
        p.monthlyMinor / 100,
        p.yearlyMinor / 100,
        p.limits.members,
        p.limits.channels,
        p.limits.contacts,
        p.limits.messages,
      ];
    };
    expect(pick('starter')).toEqual([500, 6000, 1, 3, 500, 10_000]);
    expect(pick('growth')).toEqual([1500, 18_000, 10, 3, 5000, 50_000]);
    expect(pick('scale')).toEqual([2500, 30_000, 20, 10, 50_000, 100_000]);
    expect(by.scale!.name).toBe('Scale');
    expect(by.starter!.entitlements).toEqual([]);
    expect(by.growth!.entitlements).toEqual(['courier']);
    expect(by.scale!.entitlements).toEqual(['courier', 'brands']);
    expect(by.scale!.features).toContain('Brand Management');
    expect(by.growth!.features).toContain('Courier Integration');
    expect(by.starter!.features).toHaveLength(12);
    for (const k of ['starter', 'growth', 'scale']) expect(by[k]!.currency).toBe('BDT');
  });
});

describe.skipIf(!url)('entitlements (real PostgreSQL)', () => {
  let db: PrismaClient;
  let ent: EntitlementsService;
  let plans: PlansService;

  beforeAll(() => {
    db = createPrismaClient(url!);
    const prisma = { client: db } as unknown as PrismaService;
    plans = new PlansService(prisma);
    ent = new EntitlementsService(prisma, plans);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  let n = 0;
  /** A workspace with a live subscription held to the given plan snapshot. */
  async function workspace(
    snapshot: {
      limits: Record<string, number | null>;
      entitlements?: string[];
    } | null,
    sub: Partial<{
      status: 'ACTIVE' | 'EXPIRED';
      source: 'GATEWAY' | 'MANUAL';
      periodEnd: Date;
    }> = {},
  ) {
    const ws = await db.workspace.create({ data: { name: `E${++n}`, slug: `ent-${sfx}-${n}` } });
    if (snapshot)
      await db.subscription.create({
        data: {
          workspaceId: ws.id,
          planKey: 'starter',
          interval: 'MONTH',
          status: sub.status ?? 'ACTIVE',
          source: sub.source ?? 'MANUAL',
          providerSubscriptionId: `manual_${randomUUID()}`,
          currentPeriodStart: new Date(Date.now() - 86_400_000),
          currentPeriodEnd: sub.periodEnd ?? new Date(Date.now() + 29 * 86_400_000),
          lastEventAt: new Date(),
          planSnapshot: {
            name: 'Test',
            description: '',
            limits: {
              members: null,
              channels: null,
              contacts: null,
              messages: null,
              whatsapp: null,
              instagram: null,
              messenger: null,
              ...snapshot.limits,
            },
            features: [],
            entitlements: snapshot.entitlements ?? [],
            aiCredits: null,
            monthlyMinor: 50_000,
            yearlyMinor: 600_000,
            currency: 'BDT',
            placeholderPricing: false,
          },
        },
      });
    return ws.id;
  }
  const member = async (ws: string) => {
    const u = await db.user.create({
      data: { email: `m${++n}-${sfx}@t.co`, name: 'M', passwordHash: 'x' },
    });
    await db.workspaceMembership.create({ data: { workspaceId: ws, userId: u.id, role: 'AGENT' } });
  };
  const customer = (ws: string) =>
    db.customer.create({ data: { workspaceId: ws, name: `C${++n}` } });
  const channel = (ws: string, status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED') =>
    db.channel.create({
      data: {
        workspaceId: ws,
        provider: 'MESSENGER',
        displayName: 'P',
        externalAccountId: `x-${sfx}-${++n}`,
        status,
      },
    });
  const refused = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x) => x,
    )) as { getStatus(): number; getResponse(): Record<string, unknown> } | null;
    expect(e, 'expected a 402').not.toBeNull();
    expect(e!.getStatus()).toBe(402);
    return e!.getResponse();
  };

  it('team members: a 1-member plan refuses a second member, and counts pending invitations', async () => {
    const ws = await workspace({ limits: { members: 1 } });
    await expect(ent.assertCanAdd(ws, 'members')).resolves.toBeUndefined(); // empty workspace
    await member(ws);
    const r = await refused(ent.assertCanAdd(ws, 'members'));
    expect(r).toMatchObject({ code: 'PLAN_LIMIT', metric: 'members', limit: 1, used: 1 });
    expect(String(r.message)).toMatch(/Upgrade your plan/);
    const ws2 = await workspace({ limits: { members: 2 } });
    await member(ws2);
    await expect(ent.assertCanAdd(ws2, 'members')).resolves.toBeUndefined();
    await refused(ent.assertCanAdd(ws2, 'members', { extra: 1 })); // one pending invite fills the seat
  });

  it('connected channels: only CONNECTED ones count; a disconnected channel frees a slot', async () => {
    const ws = await workspace({ limits: { channels: 3 } });
    await channel(ws);
    await channel(ws);
    const gone = await channel(ws);
    await refused(ent.assertCanAdd(ws, 'channels'));
    await db.channel.update({ where: { id: gone.id }, data: { status: 'DISCONNECTED' } });
    await expect(ent.assertCanAdd(ws, 'channels')).resolves.toBeUndefined();
  });

  it('customer contacts are limited per workspace and other workspaces are unaffected', async () => {
    const a = await workspace({ limits: { contacts: 2 } });
    const b = await workspace({ limits: { contacts: 2 } });
    await customer(a);
    await customer(a);
    await refused(ent.assertCanAdd(a, 'contacts'));
    await expect(ent.assertCanAdd(b, 'contacts')).resolves.toBeUndefined(); // isolation
  });

  it('messages count outbound replies in the billing period only; notes and old messages do not', async () => {
    const ws = await workspace({ limits: { messages: 2 } });
    const ch = await channel(ws);
    const c = await customer(ws);
    const conv = await db.conversation.create({
      data: { workspaceId: ws, channelId: ch.id, customerId: c.id },
    });
    const msg = (kind: 'OUTBOUND' | 'NOTE' | 'INBOUND', createdAt = new Date()) =>
      db.message.create({
        data: { workspaceId: ws, conversationId: conv.id, kind, body: 'x', createdAt },
      });
    await msg('OUTBOUND');
    await msg('NOTE');
    await msg('INBOUND');
    await msg('OUTBOUND', new Date(Date.now() - 40 * 86_400_000)); // before the period: the "monthly reset"
    await expect(ent.assertCanAdd(ws, 'messages')).resolves.toBeUndefined(); // 1 used of 2
    await msg('OUTBOUND');
    await refused(ent.assertCanAdd(ws, 'messages'));
  });

  it('unlimited (null) limits never refuse', async () => {
    const ws = await workspace({ limits: { contacts: null } });
    await customer(ws);
    await expect(ent.assertCanAdd(ws, 'contacts', { adding: 1000 })).resolves.toBeUndefined();
  });

  it('feature entitlements: courier on Growth, brands only on Scale, neither on Starter', async () => {
    const starter = await workspace({ limits: {}, entitlements: [] });
    const growth = await workspace({ limits: {}, entitlements: ['courier'] });
    const scale = await workspace({ limits: {}, entitlements: ['courier', 'brands'] });
    expect([await ent.has(starter, 'courier'), await ent.has(starter, 'brands')]).toEqual([
      false,
      false,
    ]);
    expect([await ent.has(growth, 'courier'), await ent.has(growth, 'brands')]).toEqual([
      true,
      false,
    ]);
    expect([await ent.has(scale, 'courier'), await ent.has(scale, 'brands')]).toEqual([true, true]);
    const r = await refused(ent.assertEntitled(starter, 'courier'));
    expect(r).toMatchObject({ code: 'PLAN_FEATURE', entitlement: 'courier' });
    await expect(ent.assertEntitled(scale, 'brands')).resolves.toBeUndefined();
  });

  it('an expired subscription, or a gateway term past its end, falls back to the free plan', async () => {
    const free = await plans.free();
    const expired = await workspace({ limits: { contacts: 9999 } }, { status: 'EXPIRED' });
    expect((await ent.planFor(expired)).plan.key).toBe(free.key);
    const ended = await workspace(
      { limits: { contacts: 9999 } },
      { source: 'GATEWAY', periodEnd: new Date(Date.now() - 1000) },
    );
    expect((await ent.planFor(ended)).plan.key).toBe(free.key);
    const bare = await workspace(null);
    expect((await ent.planFor(bare)).sub).toBeNull();
  });

  it('a subscriber keeps their snapshot when the catalog plan is edited', async () => {
    const ws = await workspace({ limits: { contacts: 7 } });
    await db.planDefinition
      .update({ where: { key: 'starter' }, data: { limits: { contacts: 1 } } })
      .catch(() => null);
    expect((await ent.planFor(ws)).plan.limits.contacts).toBe(7);
  });

  it('applyOfficialPlans: dry run writes nothing, apply is idempotent, subscribers are snapshotted first', async () => {
    await plans.seed();
    await expect(
      db.$transaction(async (tx) => {
        const t = tx as unknown as PrismaClient;
        // a subscriber on the old Starter with no snapshot (as old rows are)
        const ws = await db.workspace.create({ data: { name: 'Old', slug: `old-${sfx}` } });
        await tx.planDefinition.update({
          where: { key: 'starter' },
          data: {
            limits: { members: 5, channels: 2, contacts: 2000, messages: 5000 },
            monthlyMinor: 150_000,
            entitlements: [],
          },
        });
        await tx.subscription.create({
          data: {
            workspaceId: ws.id,
            planKey: 'starter',
            interval: 'MONTH',
            status: 'ACTIVE',
            providerSubscriptionId: `manual_${randomUUID()}`,
            lastEventAt: new Date(),
          },
        });
        const dry = await applyOfficialPlans(t, { dryRun: true });
        expect(dry.dryRun).toBe(true);
        expect(dry.updated.map((u) => u.key)).toContain('starter');
        expect(
          (await tx.planDefinition.findUniqueOrThrow({ where: { key: 'starter' } })).monthlyMinor,
        ).toBe(150_000);
        const real = await applyOfficialPlans(t, { dryRun: false });
        expect(real.snapshotted).toBeGreaterThanOrEqual(1);
        const starter = await tx.planDefinition.findUniqueOrThrow({ where: { key: 'starter' } });
        expect([starter.monthlyMinor, starter.yearlyMinor]).toEqual([50_000, 600_000]);
        // the old subscriber still holds the old price and limits
        const sub = await tx.subscription.findUniqueOrThrow({ where: { workspaceId: ws.id } });
        expect(sub.planSnapshot).toMatchObject({ monthlyMinor: 150_000, limits: { members: 5 } });
        // running it again changes nothing and creates no duplicates
        const again = await applyOfficialPlans(t, { dryRun: false });
        expect(again.updated).toEqual([]);
        expect(again.created).toEqual([]);
        expect(
          await tx.planDefinition.count({ where: { key: { in: ['starter', 'growth', 'scale'] } } }),
        ).toBe(3);
        throw ROLLBACK; // leave the shared test database as it was
      }),
    ).rejects.toBe(ROLLBACK);
  });
});
