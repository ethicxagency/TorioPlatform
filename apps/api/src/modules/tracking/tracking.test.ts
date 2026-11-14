/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory stand-ins for Prisma rows */
import { Prisma } from '@torio/database';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprintOf, type Stored } from '../admin/integrations/state';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { buildCapiEvent, hashEmail, hashPhone } from './meta-capi';
import { MetaEventsService } from './meta-events.service';
import { TorioTrackingService } from './torio-tracking.service';

const crypto = new ChannelCryptoService({
  CHANNEL_ENCRYPTION_KEY: 'test-encryption-key-for-tracking-32+',
} as never);
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function world(over: { server?: boolean; browser?: boolean; live?: boolean } = {}) {
  const settings = new Map<string, any>();
  const s: Stored = {
    values: {
      pixelId: '1234567890',
      testEventCode: 'TEST1',
      browserTracking: over.browser ?? true,
      serverTracking: over.server ?? true,
    },
    secrets: { accessToken: crypto.encrypt('EAAB-platform-token') },
    secretVersions: { accessToken: 1 },
    enabled: over.live ?? true,
  };
  s.verification = {
    status: 'VERIFIED',
    at: new Date().toISOString(),
    fingerprint: fingerprintOf('torio_meta_pixel', s),
    error: null,
  };
  settings.set('integration.torio_meta_pixel', s);
  const rows = new Map<string, any>();
  const prisma = {
    client: {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          settings.has(where.key)
            ? { value: structuredClone(settings.get(where.key)), updatedAt: new Date() }
            : null,
      },
      metaTrackingEvent: {
        create: async ({ data }: { data: any }) => {
          if (
            [...rows.values()].some(
              (r) => r.ownerKey === data.ownerKey && r.eventId === data.eventId,
            )
          )
            throw new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'x',
            });
          const id = `id-${rows.size + 1}`;
          rows.set(id, {
            id,
            status: 'PENDING',
            attempts: 0,
            lastError: null,
            sentAt: null,
            nextTryAt: null,
            createdAt: new Date(),
            ...data,
          });
          return { id };
        },
        findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: any }) =>
          void Object.assign(rows.get(where.id), data),
        findMany: async ({ where }: { where: any }) =>
          [...rows.values()].filter(
            (r) =>
              r.ownerKey === where.ownerKey &&
              (!where.status?.in || where.status.in.includes(r.status)) &&
              (!where.eventTime?.gt || r.eventTime > where.eventTime.gt),
          ),
      },
    },
  };
  const events = new MetaEventsService(prisma as never, { META_GRAPH_VERSION: 'v27.0' } as never);
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: () => Response = () =>
    new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  events.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply();
  }) as never;
  const tracking = new TorioTrackingService(prisma as never, crypto, events);
  return { events, tracking, rows, calls, on: (f: () => Response) => (reply = f) };
}

describe('Conversions API payload', () => {
  it('hashes email, phone and external id the way Meta requires, and sends nothing raw', () => {
    const p = buildCapiEvent({
      eventName: 'CompleteRegistration',
      eventId: 'registration-u1',
      eventTime: new Date('2026-11-01T10:00:00Z'),
      actionSource: 'website',
      sourceUrl: 'https://torio.test/signup',
      user: {
        email: '  Alex@Example.COM ',
        phone: '+880 1712-345678',
        externalId: 'U1',
        ip: '203.0.113.9',
        userAgent: 'UA',
        fbp: 'fb.1.2.3',
      },
      custom: { value: 1500, currency: 'bdt', orderId: 'o1' },
    }) as any;
    expect(p.user_data.em).toEqual([sha('alex@example.com')]);
    expect(p.user_data.em).toEqual([hashEmail('alex@example.com')]);
    expect(p.user_data.ph).toEqual([hashPhone('8801712345678')]);
    expect(p.user_data.external_id).toEqual([sha('u1')]);
    expect(p).toMatchObject({
      event_name: 'CompleteRegistration',
      event_id: 'registration-u1',
      event_time: 1793527200,
      action_source: 'website',
      event_source_url: 'https://torio.test/signup',
      custom_data: { value: 1500, currency: 'BDT', order_id: 'o1' },
    });
    expect(p.user_data.client_ip_address).toBe('203.0.113.9');
    const text = JSON.stringify(p);
    for (const raw of ['alex@example.com', 'Alex@Example', '1712', 'password'])
      expect(text.toLowerCase()).not.toContain(raw.toLowerCase());
  });

  it('leaves out what it was not given', () => {
    const p = buildCapiEvent({
      eventName: 'PageView',
      eventId: 'e1',
      eventTime: new Date(),
      actionSource: 'website',
    }) as any;
    expect(p.user_data).toEqual({});
    expect(p.custom_data).toBeUndefined();
  });
});

describe('delivery', () => {
  const target = { ownerKey: 'platform', pixelId: '1234567890', token: 'EAAB-platform-token' };
  const ev = (id = 'registration-u1', time = new Date()) => ({
    eventName: 'CompleteRegistration',
    eventId: id,
    eventTime: time,
    actionSource: 'website' as const,
    user: { email: 'a@b.co' },
  });

  it('stores then sends once, with the token in a header, and a repeated event id is not recorded or sent again', async () => {
    const w = world();
    expect(await w.events.track(target, ev(), { wait: true })).toBe(true);
    expect(await w.events.track(target, ev(), { wait: true })).toBe(false);
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]!.url).toBe('https://graph.facebook.com/v27.0/1234567890/events');
    expect((w.calls[0]!.init.headers as any).authorization).toBe('Bearer EAAB-platform-token');
    expect(w.calls[0]!.url).not.toContain('EAAB');
    const body = JSON.parse(String(w.calls[0]!.init.body));
    expect(body.test_event_code).toBeUndefined(); // real events never carry the test code
    expect(body.data[0].event_id).toBe('registration-u1');
    const row = [...w.rows.values()][0]!;
    expect([row.status, row.attempts]).toEqual(['SENT', 1]);
    expect(JSON.stringify(row)).not.toContain('a@b.co');
  });

  it('a refusal is dead, a server error is retried with backoff and a manual retry can resend it', async () => {
    const dead = world();
    dead.on(
      () =>
        new Response(JSON.stringify({ error: { message: 'Invalid parameter', code: 100 } }), {
          status: 400,
        }),
    );
    await dead.events.track(target, ev('a'), { wait: true });
    expect([...dead.rows.values()][0]).toMatchObject({
      status: 'DEAD',
      attempts: 1,
      lastError: expect.stringContaining('code 100'),
    });

    const flaky = world();
    flaky.on(() => new Response('{}', { status: 503 }));
    await flaky.events.track(target, ev('b'), { wait: true });
    const row = [...flaky.rows.values()][0]!;
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(row.nextTryAt.getTime()).toBeGreaterThan(Date.now());
    flaky.on(() => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    expect(await flaky.events.retry(target)).toEqual({ retried: 1 });
    expect(row).toMatchObject({ status: 'SENT', lastError: null });
  });

  it('an unreachable Meta is retryable, and an event older than seven days is dead without a request', async () => {
    const w = world();
    w.on(() => {
      throw new Error('ECONNRESET');
    });
    await w.events.track(target, ev('c'), { wait: true });
    expect([...w.rows.values()][0]).toMatchObject({
      status: 'FAILED',
      lastError: 'Meta could not be reached',
    });
    const old = world();
    await old.events.track(target, ev('d', new Date(Date.now() - 8 * 86_400_000)), { wait: true });
    expect([...old.rows.values()][0]).toMatchObject({
      status: 'DEAD',
      lastError: expect.stringContaining('seven days'),
    });
    expect(old.calls).toHaveLength(0);
  });

  it('events of different owners never share ids: the same event id can exist for a workspace and for Torio', async () => {
    const w = world();
    expect(await w.events.track(target, ev('same'), { wait: true })).toBe(true);
    expect(
      await w.events.track({ ...target, ownerKey: 'workspace-1' }, ev('same'), { wait: true }),
    ).toBe(true);
    expect([...w.rows.values()].map((r) => r.ownerKey).sort()).toEqual(['platform', 'workspace-1']);
  });
});

describe('Torio platform tracking', () => {
  it('records server events only while the integration is verified, on, and server tracking is enabled', async () => {
    const on = world();
    await on.tracking.track({
      eventName: 'CompleteRegistration',
      eventId: 'r1',
      eventTime: new Date(),
      actionSource: 'website',
      user: { email: 'a@b.co' },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(on.rows.size).toBe(1);
    for (const off of [world({ server: false }), world({ live: false })]) {
      await off.tracking.track({
        eventName: 'CompleteRegistration',
        eventId: 'r1',
        eventTime: new Date(),
        actionSource: 'website',
      });
      expect(off.rows.size).toBe(0);
      expect(off.calls).toHaveLength(0);
    }
  });

  it('exposes only the Pixel id to the website, and only while browser tracking is on', async () => {
    expect(await world().tracking.publicConfig()).toEqual({ metaPixelId: '1234567890' });
    expect(await world({ browser: false }).tracking.publicConfig()).toEqual({ metaPixelId: null });
    expect(await world({ live: false }).tracking.publicConfig()).toEqual({ metaPixelId: null });
    expect(JSON.stringify(await world().tracking.publicConfig())).not.toContain('EAAB');
  });

  it('never throws into the caller, even when the database fails', async () => {
    const w = world();
    (w.tracking as any).serverTarget = async () => {
      throw new Error('db down');
    };
    await expect(
      w.tracking.track({
        eventName: 'X',
        eventId: 'x',
        eventTime: new Date(),
        actionSource: 'website',
      }),
    ).resolves.toBeUndefined();
  });
});
