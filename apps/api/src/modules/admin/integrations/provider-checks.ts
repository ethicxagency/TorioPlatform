/* eslint-disable @typescript-eslint/no-explicit-any -- provider responses are untrusted JSON, read defensively field by field */
import { randomUUID } from 'node:crypto';

export type Fetch = typeof fetch;
export interface Check {
  label: string;
  ok: boolean;
  detail: string | null;
}
export interface CheckResult {
  ok: boolean;
  message: string;
  checks: Check[];
}
type Vals = Record<string, string | boolean | null | undefined>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');

const TIMEOUT_MS = 12_000;
/** Every provider call has a timeout, and a network failure is reported as such, never as a bad credential. */
async function call(f: Fetch, url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
  } catch {
    return null;
  }
}
const unreachable = (name: string): CheckResult => ({
  ok: false,
  message: `Could not reach ${name}. Check the connection and try again.`,
  checks: [{ label: `${name} reachable`, ok: false, detail: null }],
});
const json = async (r: Response): Promise<Record<string, any>> => {
  try {
    return (await r.json()) as Record<string, any>;
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------- Mailgun

export const mailgunBase = (region: unknown) =>
  region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
const basic = (key: string) => `Basic ${Buffer.from(`api:${key}`).toString('base64')}`;

/** Asks Mailgun for the sending domain with the API key: proves the key, the region and the domain together. */
export async function checkMailgun(f: Fetch, v: Vals, apiKey: string): Promise<CheckResult> {
  const domain = s(v.domain);
  const r = await call(f, `${mailgunBase(v.region)}/v3/domains/${encodeURIComponent(domain)}`, {
    headers: { authorization: basic(apiKey) },
  });
  if (!r) return unreachable('Mailgun');
  if (r.status === 401 || r.status === 403)
    return {
      ok: false,
      message: 'Mailgun rejected the API key. Use a private API key for the selected region.',
      checks: [{ label: 'API key accepted', ok: false, detail: `HTTP ${r.status}` }],
    };
  if (r.status === 404)
    return {
      ok: false,
      message: `Mailgun has no domain “${domain}” for this key and region.`,
      checks: [
        { label: 'API key accepted', ok: true, detail: null },
        { label: 'Domain found', ok: false, detail: 'Check the domain and the API region.' },
      ],
    };
  if (!r.ok)
    return {
      ok: false,
      message: `Mailgun answered with an error (HTTP ${r.status}).`,
      checks: [{ label: 'Mailgun answered', ok: false, detail: `HTTP ${r.status}` }],
    };
  const body = await json(r);
  const state = String(body.domain?.state ?? 'unknown');
  const recs = [...(body.sending_dns_records ?? [])] as { valid?: string }[];
  const dnsOk = recs.length > 0 && recs.every((x) => x.valid === 'valid');
  const checks: Check[] = [
    { label: 'API key accepted', ok: true, detail: null },
    { label: 'Domain found', ok: true, detail: domain },
    {
      label: 'Domain active',
      ok: state === 'active',
      detail: state === 'active' ? null : `State: ${state}. Finish DNS verification in Mailgun.`,
    },
    {
      label: 'Sending DNS records valid',
      ok: dnsOk,
      detail: dnsOk ? null : 'Some sending records are not valid yet.',
    },
  ];
  const ok = state === 'active';
  return {
    ok,
    message: ok
      ? dnsOk
        ? 'Mailgun accepted the API key and the domain is active.'
        : 'Mailgun accepted the API key and the domain is active, but some DNS records are not valid yet.'
      : 'The domain is not active in Mailgun yet, so email cannot be sent.',
    checks,
  };
}

// ---------------------------------------------------------------- Meta Pixel

const GRAPH = 'https://graph.facebook.com';

/** Reads the Pixel with the access token: proves the token can see this Pixel. The token goes in a header, never in the URL. */
export async function checkMetaPixel(
  f: Fetch,
  graphVersion: string,
  v: Vals,
  token: string,
): Promise<CheckResult> {
  const id = s(v.pixelId);
  const r = await call(f, `${GRAPH}/${graphVersion}/${encodeURIComponent(id)}?fields=id,name`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r) return unreachable('Meta');
  const body = await json(r);
  if (!r.ok) {
    const code = Number(body.error?.code);
    const msg =
      code === 190
        ? 'Meta rejected the access token (invalid or expired).'
        : code === 100 || r.status === 400
          ? 'Meta could not find that Pixel, or the token cannot access it.'
          : `Meta answered with an error (HTTP ${r.status}).`;
    return {
      ok: false,
      message: msg,
      checks: [
        {
          label: 'Pixel readable with this token',
          ok: false,
          detail: String(body.error?.message ?? '').slice(0, 160) || null,
        },
      ],
    };
  }
  const found = String(body.id ?? '') === id;
  return {
    ok: found,
    message: found
      ? `Meta accepted the token and found the Pixel${body.name ? ` “${String(body.name)}”` : ''}.`
      : 'Meta returned a different Pixel than the one entered.',
    checks: [
      { label: 'Access token accepted', ok: true, detail: null },
      { label: 'Pixel found', ok: found, detail: body.name ? String(body.name) : null },
    ],
  };
}

/** One server-side test event with the test code, so it appears in Events Manager → Test events and nowhere else. */
export async function sendMetaTestEvent(
  f: Fetch,
  graphVersion: string,
  v: Vals,
  token: string,
  sourceUrl: string,
): Promise<{ ok: boolean; message: string; eventId: string }> {
  const eventId = randomUUID();
  const r = await call(f, `${GRAPH}/${graphVersion}/${encodeURIComponent(s(v.pixelId))}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      data: [
        {
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: sourceUrl,
          user_data: { client_user_agent: 'Torio Super Admin connection test' },
        },
      ],
      test_event_code: s(v.testEventCode),
    }),
  });
  if (!r) return { ok: false, message: 'Could not reach Meta.', eventId };
  const body = await json(r);
  if (!r.ok)
    return {
      ok: false,
      message: `Meta refused the test event (HTTP ${r.status}): ${String(body.error?.message ?? 'no reason given').slice(0, 200)}`,
      eventId,
    };
  const received = Number(body.events_received ?? 0);
  return {
    ok: received > 0,
    message:
      received > 0
        ? 'Meta received the test event. Find it in Events Manager → Test events.'
        : 'Meta answered but reported no events received.',
    eventId,
  };
}

// ---------------------------------------------------------------- SSLCommerz

export const sslBase = (env: unknown) =>
  env === 'live' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';

/**
 * Opens a payment session for the smallest amount and does not follow it. SSLCommerz checks the store ID and password
 * when a session is created, so a SUCCESS answer proves the credentials; no payment exists until someone pays on the
 * returned page, which this never visits.
 */
export async function checkSslcommerz(
  f: Fetch,
  v: Vals,
  password: string,
  urls: { success: string; fail: string; cancel: string; ipn: string },
): Promise<CheckResult> {
  const currency = s(v.currencies).split(',')[0]?.trim() || 'BDT';
  const form = new URLSearchParams({
    store_id: s(v.storeId),
    store_passwd: password,
    total_amount: '10.00',
    currency,
    tran_id: `TORIO-TEST-${Date.now()}`,
    success_url: urls.success,
    fail_url: urls.fail,
    cancel_url: urls.cancel,
    ipn_url: urls.ipn,
    cus_name: 'Torio connection test',
    cus_email: 'test@torio.invalid',
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: '01700000000',
    shipping_method: 'NO',
    product_name: 'Connection test',
    product_category: 'Test',
    product_profile: 'non-physical-goods',
  });
  const r = await call(f, `${sslBase(v.environment)}/gwprocess/v4/api.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!r) return unreachable('SSLCommerz');
  const body = await json(r);
  if (!r.ok)
    return {
      ok: false,
      message: `SSLCommerz answered with an error (HTTP ${r.status}).`,
      checks: [{ label: 'SSLCommerz answered', ok: false, detail: `HTTP ${r.status}` }],
    };
  const ok = String(body.status ?? '').toUpperCase() === 'SUCCESS';
  return {
    ok,
    message: ok
      ? `SSLCommerz accepted the store credentials (${s(v.environment) === 'live' ? 'live' : 'sandbox'}). No payment was made.`
      : `SSLCommerz rejected the session: ${String(body.failedreason ?? 'no reason given').slice(0, 200)}`,
    checks: [
      {
        label: 'Store ID and password accepted',
        ok,
        detail: ok ? null : String(body.failedreason ?? '').slice(0, 160) || null,
      },
      { label: `Currency ${currency} accepted`, ok, detail: null },
    ],
  };
}
