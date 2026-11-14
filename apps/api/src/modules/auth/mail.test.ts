/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory stand-ins for Prisma rows */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprintOf, type Stored } from '../admin/integrations/state';
import { EmailEventsService } from '../email/email-events.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { renderMail, SAMPLE_VARS, TEMPLATE_KEYS, TORIO_BRAND } from './mail-templates';
import { MailService } from './mail.service';

const crypto = new ChannelCryptoService({
  CHANNEL_ENCRYPTION_KEY: 'test-encryption-key-for-mail-tests-32+',
} as never);

function world(
  opts: { mailgun?: 'live' | 'disabled' | 'none'; resend?: boolean; logFails?: boolean } = {},
) {
  const settings = new Map<string, unknown>();
  if (opts.mailgun && opts.mailgun !== 'none') {
    const s: Stored = {
      values: {
        region: 'US',
        domain: 'mg.example.com',
        fromName: 'Torio',
        fromEmail: 'no-reply@mg.example.com',
      },
      secrets: {
        apiKey: crypto.encrypt('key-secret-000000'),
        webhookSigningKey: crypto.encrypt('whsec-signing'),
      },
      secretVersions: { apiKey: 1, webhookSigningKey: 1 },
      enabled: opts.mailgun === 'live',
    };
    s.verification = {
      status: 'VERIFIED',
      at: new Date().toISOString(),
      fingerprint: fingerprintOf('mailgun', s),
      error: null,
    };
    settings.set('integration.mailgun', s);
  }
  const logs = new Map<string, Record<string, any>>();
  const seen = new Set<string>();
  const prisma = {
    client: {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          settings.has(where.key)
            ? { value: structuredClone(settings.get(where.key)), updatedAt: new Date() }
            : null,
      },
      emailDeliveryLog: {
        create: async ({ data }: { data: Record<string, any> }) => {
          if (opts.logFails) throw new Error('db down');
          logs.set(data.id, {
            status: 'QUEUED',
            attempts: 1,
            acceptedAt: null,
            deliveredAt: null,
            error: null,
            providerMessageId: null,
            ...data,
          });
          return logs.get(data.id);
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
          Object.assign(logs.get(where.id)!, data);
        },
        findUnique: async ({ where }: { where: { id: string } }) => logs.get(where.id) ?? null,
        findFirst: async ({ where }: { where: { providerMessageId?: string } }) =>
          [...logs.values()].find((l) => l.providerMessageId === where.providerMessageId) ?? null,
      },
      integrationWebhookEvent: {
        createMany: async ({ data }: { data: { eventId: string }[] }) => {
          const fresh = data.filter((d) => !seen.has(d.eventId));
          fresh.forEach((d) => seen.add(d.eventId));
          return { count: fresh.length };
        },
      },
    },
  };
  const mail = new MailService(
    {
      WEB_URL: 'https://app.test',
      RESEND_API_KEY: opts.resend ? 're_key' : undefined,
      MAIL_FROM: opts.resend ? 'Torio <hi@torio.test>' : undefined,
    } as never,
    prisma as never,
    crypto,
  );
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: (url: string) => Response | Promise<Response> = () =>
    new Response('{}', { status: 200 });
  mail.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply(String(url));
  }) as never;
  const events = new EmailEventsService(prisma as never, mail);
  return { mail, events, logs, calls, on: (f: typeof reply) => (reply = f) };
}
const J = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('email sender', () => {
  it('uses Mailgun when it is on and verified, recording ACCEPTED (not delivered) with the provider message id', async () => {
    const w = world({ mailgun: 'live', resend: true });
    w.on(() => J({ id: '<20260101.abc@mg.example.com>', message: 'Queued' }));
    expect(
      await w.mail.sendTemplate('verify_email', 'Alex@Example.com', {
        name: 'Alex',
        link: 'https://app.test/v?t=1',
      }),
    ).toBe(true);
    const call = w.calls[0]!;
    expect(call.url).toBe('https://api.mailgun.net/v3/mg.example.com/messages');
    const body = new URLSearchParams(String(call.init.body));
    expect(body.get('to')).toBe('Alex@Example.com');
    expect(body.get('from')).toBe('Torio <no-reply@mg.example.com>');
    expect(body.get('html')).toContain('https://app.test/v?t=1');
    expect(body.get('text')).toContain('https://app.test/v?t=1');
    const log = [...w.logs.values()][0]!;
    expect(body.get('v:log_id')).toBe(log.id);
    expect(log).toMatchObject({
      provider: 'mailgun',
      kind: 'verify_email',
      toAddress: 'alex@example.com',
      status: 'ACCEPTED',
      providerMessageId: '20260101.abc@mg.example.com',
    });
    expect(log.deliveredAt).toBeNull();
    expect(JSON.stringify(log)).not.toContain('app.test/v?t=1'); // the body (one-time link) is never stored
    expect(JSON.stringify(log)).not.toContain('key-secret');
  });

  it('falls back to Resend until Mailgun is switched on, and stays unconfigured with neither', async () => {
    const off = world({ mailgun: 'disabled', resend: true });
    await off.mail.refresh();
    expect(off.mail.provider).toBe('resend');
    expect(await off.mail.send('a@b.co', 's', 't')).toBe(true);
    expect(off.calls[0]!.url).toBe('https://api.resend.com/emails');
    expect([...off.logs.values()][0]).toMatchObject({ provider: 'resend', status: 'ACCEPTED' });
    const none = world({ mailgun: 'none' });
    await none.mail.refresh();
    expect([
      none.mail.configured,
      await none.mail.send('a@b.co', 's', 't'),
      none.logs.size,
    ]).toEqual([false, false, 0]);
  });

  it('records a refusal as FAILED with the reason, retries a 5xx once, and never retries a refusal', async () => {
    const w = world({ mailgun: 'live' });
    w.on(() => J({ message: 'Forbidden' }, 403));
    expect(await w.mail.send('a@b.co', 's', 't')).toBe(false);
    expect(w.calls).toHaveLength(1);
    expect([...w.logs.values()][0]).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('403'),
      attempts: 1,
    });
    const flaky = world({ mailgun: 'live' });
    let n = 0;
    flaky.on(() => (n++ === 0 ? J({}, 503) : J({ id: '<x@mg>' })));
    expect(await flaky.mail.send('a@b.co', 's', 't')).toBe(true);
    expect([...flaky.logs.values()][0]).toMatchObject({ status: 'ACCEPTED', attempts: 2 });
  });

  it('an unreachable provider is a failure, and a logging problem never blocks the email', async () => {
    const down = world({ mailgun: 'live' });
    down.on(() => {
      throw new Error('ECONNRESET');
    });
    expect(await down.mail.send('a@b.co', 's', 't')).toBe(false);
    expect([...down.logs.values()][0]).toMatchObject({
      status: 'FAILED',
      error: 'Mailgun could not be reached',
    });
    const nolog = world({ mailgun: 'live', logFails: true });
    nolog.on(() => J({ id: '<y@mg>' }));
    expect(await nolog.mail.send('a@b.co', 's', 't')).toBe(true);
  });

  it('the Mailgun test email can go out while Mailgun is verified but not yet enabled', async () => {
    const w = world({ mailgun: 'disabled', resend: true });
    w.on(() => J({ id: '<z@mg>' }));
    expect(await w.mail.sendTemplate('test', 'me@x.co', {}, { force: 'mailgun' })).toBe(true);
    expect(w.calls[0]!.url).toContain('api.mailgun.net');
  });
});

describe('email templates', () => {
  it('every template has matching text and HTML, escapes variables, and only links http(s)', () => {
    for (const k of TEMPLATE_KEYS) {
      const r = renderMail(k, SAMPLE_VARS[k], TORIO_BRAND('https://app.test'));
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.html).toContain('<!doctype html>');
      expect(r.html).toContain('viewport');
      const link = SAMPLE_VARS[k].link ?? SAMPLE_VARS[k].ctaUrl;
      if (link) {
        expect(r.text).toContain(link);
        expect(r.html).toContain(link);
      }
    }
    const evil = renderMail(
      'verify_email',
      { name: '<script>alert(1)</script>', link: 'javascript:alert(1)' },
      TORIO_BRAND('https://app.test'),
    );
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).toContain('&lt;script&gt;');
    expect(evil.html).not.toContain('javascript:');
    expect(evil.text).not.toContain('javascript:');
  });

  it('customer-facing mail carries the workspace identity, platform mail keeps Torio’s', () => {
    const ws = renderMail('workspace_notice', SAMPLE_VARS.workspace_notice, {
      name: 'Urban Nest',
      logoUrl: 'https://api.test/api/v1/images/abc?w=360',
    });
    expect(ws.html).toContain('alt="Urban Nest"');
    expect(ws.html).toContain('max-width:150px');
    expect(ws.html).not.toContain('Sent by Torio');
    const sec = renderMail(
      'password_reset',
      SAMPLE_VARS.password_reset,
      TORIO_BRAND('https://app.test'),
    );
    expect(sec.html).toContain('Sent by Torio');
    expect(sec.html).toContain('/torio-logo.png');
  });
});

describe('Mailgun webhook', () => {
  const sign = (
    key: string,
    ts = String(Math.floor(Date.now() / 1000)),
    token = 'tok-' + Math.random(),
  ) => ({
    timestamp: ts,
    token,
    signature: createHmac('sha256', key)
      .update(ts + token)
      .digest('hex'),
  });
  const payload = (key: string, ev: Record<string, unknown>, sig = sign(key)) => ({
    signature: sig,
    'event-data': { id: 'evt-' + Math.random(), timestamp: Date.now() / 1000, ...ev },
  });
  const sent = async (w: ReturnType<typeof world>) => {
    w.on(() => J({ id: '<m1@mg.example.com>' }));
    await w.mail.send('a@b.co', 's', 't', { kind: 'verify_email' });
    return [...w.logs.values()][0]!;
  };

  it('moves an accepted email to delivered only when Mailgun says so, and records when', async () => {
    const w = world({ mailgun: 'live' });
    const log = await sent(w);
    expect(log.status).toBe('ACCEPTED');
    const r = await w.events.handleMailgun(
      payload('whsec-signing', { event: 'delivered', 'user-variables': { log_id: log.id } }),
    );
    expect(r).toEqual({ ok: true });
    expect(log).toMatchObject({ status: 'DELIVERED', lastEvent: 'delivered' });
    expect(log.deliveredAt).toBeInstanceOf(Date);
  });

  it('refuses a wrong signature, a stale one, a malformed payload, and everything when no signing key is saved', async () => {
    const w = world({ mailgun: 'live' });
    const log = await sent(w);
    const ev = { event: 'delivered', 'user-variables': { log_id: log.id } };
    await expect(w.events.handleMailgun(payload('wrong-key', ev))).rejects.toThrow(
      /Invalid signature/,
    );
    const old = sign('whsec-signing', String(Math.floor(Date.now() / 1000) - 3600));
    await expect(w.events.handleMailgun(payload('whsec-signing', ev, old))).rejects.toThrow(
      /Stale/,
    );
    await expect(w.events.handleMailgun({ nope: 1 })).rejects.toThrow(/Unrecognised/);
    expect(log.status).toBe('ACCEPTED'); // none of those changed anything
    const noKey = world({ mailgun: 'none' });
    await expect(noKey.events.handleMailgun(payload('x', ev))).rejects.toThrow(/not set up/);
  });

  it('applies a repeated event once, and never moves an email backwards when events arrive out of order', async () => {
    const w = world({ mailgun: 'live' });
    const log = await sent(w);
    const base = { 'user-variables': { log_id: log.id } };
    const dup = payload('whsec-signing', { event: 'delivered', id: 'same-id', ...base });
    await w.events.handleMailgun(dup);
    expect(await w.events.handleMailgun(dup)).toEqual({ ok: true, duplicate: true });
    await w.events.handleMailgun(payload('whsec-signing', { event: 'opened', ...base }));
    expect(log.status).toBe('OPENED');
    await w.events.handleMailgun(payload('whsec-signing', { event: 'accepted', ...base })); // late and older
    await w.events.handleMailgun(payload('whsec-signing', { event: 'delivered', ...base }));
    expect(log.status).toBe('OPENED');
    expect(log.lastEvent).toBe('delivered'); // the latest event is still recorded
  });

  it('records a permanent failure with its reason and a temporary one as retrying, matching by Message-Id when needed', async () => {
    const w = world({ mailgun: 'live' });
    const log = await sent(w);
    await w.events.handleMailgun(
      payload('whsec-signing', {
        event: 'failed',
        severity: 'temporary',
        message: { headers: { 'message-id': 'm1@mg.example.com' } },
        reason: 'greylisted',
      }),
    );
    expect(log.status).toBe('TEMP_FAILED');
    await w.events.handleMailgun(
      payload('whsec-signing', {
        event: 'failed',
        severity: 'permanent',
        reason: 'bounce',
        'delivery-status': { description: 'Mailbox does not exist' },
        'user-variables': { log_id: log.id },
      }),
    );
    expect(log).toMatchObject({ status: 'FAILED', error: 'bounce: Mailbox does not exist' });
    expect(log.deliveredAt).toBeNull(); // a failure is never reported as delivered
  });

  it('acknowledges events for messages it did not send, and event types it does not track', async () => {
    const w = world({ mailgun: 'live' });
    await sent(w);
    expect(
      await w.events.handleMailgun(
        payload('whsec-signing', {
          event: 'delivered',
          'user-variables': { log_id: '11111111-1111-4111-8111-111111111111' },
        }),
      ),
    ).toEqual({ ok: true, ignored: true });
    expect(await w.events.handleMailgun(payload('whsec-signing', { event: 'stored' }))).toEqual({
      ok: true,
      ignored: true,
    });
  });
});
