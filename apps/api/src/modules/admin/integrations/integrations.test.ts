import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ChannelCryptoService } from '../../whatsapp/channel-crypto.service';
import type { AdminContext } from '../admin-auth';
import { IntegrationsService } from './integrations.service';

const admin: AdminContext = {
  id: 'a1',
  email: 'root@torio.test',
  name: 'Root',
  role: 'SUPER_ADMIN',
  sessionId: 's',
};

function setup(over: { key?: boolean } = {}) {
  const rows = new Map<string, { value: unknown; updatedAt: Date }>();
  const audits: Record<string, unknown>[] = [];
  const prisma = {
    client: {
      platformSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          const r = rows.get(where.key);
          return r ? { ...r, value: structuredClone(r.value) } : null; // a real database returns a fresh copy
        },
        upsert: async ({
          where,
          create,
        }: {
          where: { key: string };
          create: { value: unknown };
        }) => {
          rows.set(where.key, { value: create.value, updatedAt: new Date() });
        },
      },
    },
  };
  const crypto = new ChannelCryptoService({
    CHANNEL_ENCRYPTION_KEY:
      over.key === false ? undefined : 'test-encryption-key-for-integrations-32+',
  } as never);
  const audit = { log: async (e: Record<string, unknown>) => void audits.push(e) };
  const mails: { key: string; to: string; opts: unknown }[] = [];
  const mailState = { accept: true };
  const mail = {
    sendTemplate: async (key: string, to: string, _v: unknown, opts: unknown) => {
      mails.push({ key, to, opts });
      return mailState.accept;
    },
  };
  const svc = new IntegrationsService(
    prisma as never,
    crypto,
    audit as never,
    mail as never,
    {
      WEB_URL: 'https://app.test',
      API_URL: 'https://api.test/',
      META_GRAPH_VERSION: 'v27.0',
    } as never,
  );
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: (url: string, init: RequestInit) => Response | Promise<Response> = () =>
    new Response('{}', { status: 200 });
  svc.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return reply(String(url), init);
  }) as never;
  return { svc, rows, audits, calls, mails, mailState, on: (f: typeof reply) => (reply = f) };
}
const J = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const mailgun = async (t: ReturnType<typeof setup>) => {
  await t.svc.save(admin, 'mailgun', {
    values: {
      region: 'US',
      domain: 'mg.example.com',
      fromName: 'Torio',
      fromEmail: 'no-reply@mg.example.com',
    },
  });
  await t.svc.setSecret(admin, 'mailgun', 'apiKey', 'key-0123456789abcdef');
};

describe('integration settings', () => {
  it('starts not configured, and the saved secret is never in any view', async () => {
    const t = setup();
    expect((await t.svc.list()).data.map((d) => d.status)).toEqual([
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
    ]);
    await mailgun(t);
    const v = await t.svc.view('mailgun');
    expect(v.status).toBe('UNVERIFIED'); // saving credentials never makes it connected
    expect(v.secrets.find((s) => s.key === 'apiKey')?.set).toBe(true);
    expect(JSON.stringify(v)).not.toContain('key-0123456789abcdef');
    expect(JSON.stringify([...t.rows.values()])).not.toContain('key-0123456789abcdef'); // stored encrypted
    expect(JSON.stringify(t.audits)).not.toContain('key-0123456789abcdef');
  });

  it('validates what is saved and refuses an unknown integration or setting', async () => {
    const t = setup();
    await expect(t.svc.view('nope')).rejects.toThrow(/Unknown integration/);
    await expect(
      t.svc.save(admin, 'mailgun', { values: { domain: 'not a domain' } }),
    ).rejects.toThrow(/domain such as/);
    await expect(t.svc.save(admin, 'mailgun', { values: { fromEmail: 'nope' } })).rejects.toThrow(
      /email address/,
    );
    await expect(t.svc.save(admin, 'mailgun', { values: { bogus: 'x' } })).rejects.toThrow(
      /Unknown setting/,
    );
    await expect(
      t.svc.save(admin, 'torio_meta_pixel', { values: { pixelId: 'abc' } }),
    ).rejects.toThrow(/8 to 20 digits/);
    await expect(
      t.svc.save(admin, 'mailgun', {
        values: { domain: 'mg.example.com', fromName: 'T', fromEmail: 'x@other.com' },
      }),
    ).rejects.toThrow(/belong to the sending domain/);
    await expect(t.svc.setSecret(admin, 'mailgun', 'nope', 'abcdefgh')).rejects.toThrow(
      /Unknown secret/,
    );
  });

  it('cannot store a secret without the encryption key', async () => {
    const t = setup({ key: false });
    await expect(t.svc.setSecret(admin, 'mailgun', 'apiKey', 'key-0123456789')).rejects.toThrow(
      /CHANNEL_ENCRYPTION_KEY/,
    );
  });
});

describe('Mailgun', () => {
  it('is verified only when Mailgun accepts the key and the domain is active, and says what it checked', async () => {
    const t = setup();
    await mailgun(t);
    t.on(() => J({ domain: { state: 'active' }, sending_dns_records: [{ valid: 'valid' }] }));
    const r = await t.svc.test(admin, 'mailgun');
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(t.calls[0]!.url).toBe('https://api.mailgun.net/v3/domains/mg.example.com');
    expect((t.calls[0]!.init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
    expect((await t.svc.view('mailgun')).status).toBe('VERIFIED');
  });

  it('rejects a bad key, an unknown domain and an inactive domain, and each is FAILED', async () => {
    for (const [status, body, msg] of [
      [401, {}, /rejected the API key/],
      [404, {}, /no domain/],
      [200, { domain: { state: 'unverified' }, sending_dns_records: [] }, /not active/],
    ] as const) {
      const t = setup();
      await mailgun(t);
      t.on(() => J(body, status));
      const r = await t.svc.test(admin, 'mailgun');
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(msg);
      const v = await t.svc.view('mailgun');
      expect([v.status, v.lastError]).toEqual(['FAILED', expect.stringMatching(msg)]);
    }
  });

  it('reports an unreachable provider as that, not as a bad credential', async () => {
    const t = setup();
    await mailgun(t);
    t.on(() => {
      throw new Error('ECONNRESET');
    });
    expect((await t.svc.test(admin, 'mailgun')).message).toMatch(/Could not reach Mailgun/);
  });

  it('uses the EU endpoint for the EU region', async () => {
    const t = setup();
    await t.svc.save(admin, 'mailgun', {
      values: {
        region: 'EU',
        domain: 'mg.example.com',
        fromName: 'T',
        fromEmail: 'a@mg.example.com',
      },
    });
    await t.svc.setSecret(admin, 'mailgun', 'apiKey', 'key-0123456789abcdef');
    t.on(() => J({ domain: { state: 'active' } }));
    await t.svc.test(admin, 'mailgun');
    expect(t.calls[0]!.url).toContain('api.eu.mailgun.net');
  });

  it('enabling needs a passing test, and changing the domain or key afterwards switches it off and unverifies it', async () => {
    const t = setup();
    await mailgun(t);
    await expect(t.svc.setEnabled(admin, 'mailgun', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    t.on(() => J({ domain: { state: 'active' }, sending_dns_records: [{ valid: 'valid' }] }));
    await t.svc.test(admin, 'mailgun');
    expect((await t.svc.setEnabled(admin, 'mailgun', true)).enabled).toBe(true);
    await t.svc.save(admin, 'mailgun', { values: { replyTo: 'help@example.com' } }); // changes the settings...
    const afterSave = await t.svc.view('mailgun');
    expect([afterSave.enabled, afterSave.status]).toEqual([false, 'UNVERIFIED']);
    await t.svc.test(admin, 'mailgun');
    await t.svc.setEnabled(admin, 'mailgun', true);
    await t.svc.setSecret(admin, 'mailgun', 'apiKey', 'key-replaced-0123456789'); // ...or the key
    const afterKey = await t.svc.view('mailgun');
    expect([afterKey.enabled, afterKey.status]).toEqual([false, 'UNVERIFIED']);
    expect(t.audits.map((a) => a.action)).toContain('integration.secret_replaced');
  });

  it('a test email goes through the shared sender, and says accepted, never delivered', async () => {
    const t = setup();
    await mailgun(t);
    await expect(t.svc.sendTestEmail(admin, 'me@example.com')).rejects.toThrow(
      /Test the Mailgun connection/,
    );
    t.on(() => J({ domain: { state: 'active' } }));
    await t.svc.test(admin, 'mailgun');
    const r = await t.svc.sendTestEmail(admin, 'me@example.com');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/accepted the message/);
    expect(r.message).toMatch(/not by this request/);
    expect(r.message).not.toMatch(/delivered successfully/i);
    expect(t.mails).toEqual([{ key: 'test', to: 'me@example.com', opts: { force: 'mailgun' } }]);
    t.mailState.accept = false;
    expect((await t.svc.sendTestEmail(admin, 'me@example.com')).ok).toBe(false);
  });
});

describe('Torio Meta Pixel', () => {
  const pixel = async (t: ReturnType<typeof setup>) => {
    await t.svc.save(admin, 'torio_meta_pixel', {
      values: { pixelId: '1234567890', testEventCode: 'TEST123' },
    });
    await t.svc.setSecret(admin, 'torio_meta_pixel', 'accessToken', 'EAAB-secret-token-123456');
  };

  it('checks the token against the Pixel and keeps the token out of the URL and the audit log', async () => {
    const t = setup();
    await pixel(t);
    t.on(() => J({ id: '1234567890', name: 'Torio Pixel' }));
    const r = await t.svc.test(admin, 'torio_meta_pixel');
    expect(r.ok).toBe(true);
    expect(t.calls[0]!.url).toBe('https://graph.facebook.com/v27.0/1234567890?fields=id,name');
    expect(t.calls[0]!.url).not.toContain('EAAB');
    expect((t.calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer EAAB-secret-token-123456',
    );
    expect(JSON.stringify(t.audits)).not.toContain('EAAB');
  });

  it('refuses an invalid token and a Pixel the token cannot see', async () => {
    const t = setup();
    await pixel(t);
    t.on(() => J({ error: { code: 190, message: 'Invalid OAuth access token' } }, 400));
    expect((await t.svc.test(admin, 'torio_meta_pixel')).message).toMatch(/invalid or expired/);
    t.on(() => J({ error: { code: 100, message: 'Unsupported get request' } }, 400));
    expect((await t.svc.test(admin, 'torio_meta_pixel')).message).toMatch(
      /could not find that Pixel/,
    );
  });

  it('a test event needs a verified connection and a test code, and sends it with that code', async () => {
    const t = setup();
    await t.svc.save(admin, 'torio_meta_pixel', { values: { pixelId: '1234567890' } });
    await t.svc.setSecret(admin, 'torio_meta_pixel', 'accessToken', 'EAAB-secret-token-123456');
    await expect(t.svc.sendTestEvent(admin)).rejects.toThrow(/Test the Pixel connection/);
    t.on(() => J({ id: '1234567890' }));
    await t.svc.test(admin, 'torio_meta_pixel');
    await expect(t.svc.sendTestEvent(admin)).rejects.toThrow(/test event code/);
    await t.svc.save(admin, 'torio_meta_pixel', { values: { testEventCode: 'TEST123' } });
    t.on((url) => (url.endsWith('/events') ? J({ events_received: 1 }) : J({ id: '1234567890' })));
    await t.svc.test(admin, 'torio_meta_pixel');
    const r = await t.svc.sendTestEvent(admin);
    expect(r.ok).toBe(true);
    const body = JSON.parse(String(t.calls.at(-1)!.init.body));
    expect(body.test_event_code).toBe('TEST123');
    expect(body.data[0]).toMatchObject({ event_name: 'PageView', action_source: 'website' });
    expect(typeof body.data[0].event_id).toBe('string');
    expect(JSON.stringify(body)).not.toContain('EAAB'); // the token is a header, not payload
  });

  it('toggling the tracking switches does not undo a verified connection', async () => {
    const t = setup();
    await pixel(t);
    t.on(() => J({ id: '1234567890' }));
    await t.svc.test(admin, 'torio_meta_pixel');
    await t.svc.save(admin, 'torio_meta_pixel', { values: { browserTracking: true } });
    expect((await t.svc.view('torio_meta_pixel')).status).toBe('VERIFIED');
  });
});

describe('SSLCommerz', () => {
  const ssl = async (t: ReturnType<typeof setup>, env = 'sandbox') => {
    await t.svc.save(admin, 'sslcommerz', {
      values: { environment: env, storeId: 'torio5f1a', currencies: 'BDT,USD' },
      confirmLive: true,
    });
    await t.svc.setSecret(admin, 'sslcommerz', 'storePassword', 'torio5f1a@ssl');
  };

  it('verifies sandbox credentials by opening a session, without a payment, and never sends the password to the audit log', async () => {
    const t = setup();
    await ssl(t);
    t.on(() => J({ status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/x' }));
    const r = await t.svc.test(admin, 'sslcommerz');
    expect(r.ok).toBe(true);
    expect(t.calls[0]!.url).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php');
    const body = new URLSearchParams(String(t.calls[0]!.init.body));
    expect(body.get('store_id')).toBe('torio5f1a');
    expect(body.get('total_amount')).toBe('10.00');
    expect(body.get('currency')).toBe('BDT');
    expect(body.get('tran_id')).toMatch(/^TORIO-TEST-/);
    expect(body.get('success_url')).toBe('https://api.test/api/v1/payments/sslcommerz/success');
    expect(JSON.stringify(t.audits)).not.toContain('torio5f1a@ssl');
    expect(JSON.stringify(await t.svc.view('sslcommerz'))).not.toContain('torio5f1a@ssl');
  });

  it('rejects wrong credentials with the gateway’s reason, and fails closed', async () => {
    const t = setup();
    await ssl(t);
    t.on(() =>
      J({ status: 'FAILED', failedreason: 'Store Credential Error Or Store is De-active' }),
    );
    const r = await t.svc.test(admin, 'sslcommerz');
    expect([r.ok, r.status]).toEqual([false, 'FAILED']);
    expect(r.message).toMatch(/Store Credential Error/);
    await expect(t.svc.setEnabled(admin, 'sslcommerz', true)).rejects.toThrow(
      /Test the connection/,
    );
  });

  it('never switches to live without explicit confirmation, drops verification when it does, and uses the live host', async () => {
    const t = setup();
    await ssl(t);
    t.on(() => J({ status: 'SUCCESS' }));
    await t.svc.test(admin, 'sslcommerz');
    await t.svc.setEnabled(admin, 'sslcommerz', true);
    await expect(
      t.svc.save(admin, 'sslcommerz', { values: { environment: 'live' } }),
    ).rejects.toThrow(/Confirm it explicitly/);
    expect((await t.svc.view('sslcommerz')).values.environment).toBe('sandbox');
    const v = await t.svc.save(admin, 'sslcommerz', {
      values: { environment: 'live' },
      confirmLive: true,
    });
    expect([v.enabled, v.status]).toEqual([false, 'UNVERIFIED']); // sandbox proof does not carry over to live
    await t.svc.test(admin, 'sslcommerz');
    expect(t.calls.at(-1)!.url).toBe('https://securepay.sslcommerz.com/gwprocess/v4/api.php');
    expect(t.audits.map((a) => a.action)).toContain('integration.live_confirmed');
  });

  it('shows the callback addresses SSLCommerz needs', async () => {
    const t = setup();
    const v = await t.svc.view('sslcommerz');
    expect(v.readOnly.map((r) => r.label)).toEqual([
      'Success URL',
      'Fail URL',
      'Cancel URL',
      'IPN URL',
    ]);
    expect(v.readOnly[0]!.hint).toMatch(/Give SSLCommerz this address/);
  });
});
