/* eslint-disable @typescript-eslint/no-explicit-any -- the gateway's answers are untrusted JSON, read field by field */
import { createHash, timingSafeEqual } from 'node:crypto';

export type Fetch = typeof fetch;
export interface SslConfig {
  storeId: string;
  password: string;
  environment: 'sandbox' | 'live';
  currencies: string[];
}
export const sslBase = (env: SslConfig['environment']) =>
  env === 'live' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';

const TIMEOUT = 15_000;
async function get(f: Fetch, url: string): Promise<{ ok: boolean; body: any } | null> {
  try {
    const r = await f(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'error' });
    return { ok: r.ok, body: await r.json().catch(() => ({})) };
  } catch {
    return null;
  }
}

export interface SessionInput {
  tranId: string;
  amount: string;
  currency: string;
  product: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postcode?: string;
  };
  urls: { success: string; fail: string; cancel: string; ipn: string };
}
export type SessionResult =
  | { ok: true; sessionKey: string; url: string }
  | { ok: false; reason: string; unreachable?: boolean };

/** Opens a payment session. The amount comes from Torio's own price for the plan, never from the browser. */
export async function createSession(
  f: Fetch,
  c: SslConfig,
  i: SessionInput,
): Promise<SessionResult> {
  const form = new URLSearchParams({
    store_id: c.storeId,
    store_passwd: c.password,
    total_amount: i.amount,
    currency: i.currency,
    tran_id: i.tranId,
    success_url: i.urls.success,
    fail_url: i.urls.fail,
    cancel_url: i.urls.cancel,
    ipn_url: i.urls.ipn,
    cus_name: i.customer.name.slice(0, 50),
    cus_email: i.customer.email,
    cus_add1: i.customer.address.slice(0, 50),
    cus_city: i.customer.city.slice(0, 50),
    cus_postcode: i.customer.postcode ?? '1000',
    cus_country: i.customer.country.slice(0, 50),
    cus_phone: i.customer.phone,
    shipping_method: 'NO',
    num_of_item: '1',
    product_name: i.product.slice(0, 100),
    product_category: 'Subscription',
    product_profile: 'non-physical-goods',
  });
  let r: Response;
  try {
    r = await f(`${sslBase(c.environment)}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: 'error',
    });
  } catch {
    return { ok: false, reason: 'SSLCommerz could not be reached', unreachable: true };
  }
  const b: any = await r.json().catch(() => ({}));
  const url = typeof b.GatewayPageURL === 'string' ? b.GatewayPageURL : '';
  if (!r.ok || String(b.status).toUpperCase() !== 'SUCCESS' || !url.startsWith('https://'))
    return {
      ok: false,
      reason: String(b.failedreason ?? `SSLCommerz refused the session (HTTP ${r.status})`).slice(
        0,
        200,
      ),
    };
  return { ok: true, sessionKey: String(b.sessionkey ?? ''), url };
}

export interface Validation {
  status: string;
  tranId: string | null;
  valId: string | null;
  storeId: string | null;
  /** In the currency the customer was charged, as a decimal string. */
  amount: string | null;
  currency: string | null;
  bankTranId: string | null;
  method: string | null;
  riskLevel: string | null;
  raw: Record<string, string>;
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));
/** Reads the gateway's validation answer. Card numbers and personal fields are dropped from `raw`. */
export function readValidation(b: any): Validation {
  const keep = [
    'status',
    'tran_id',
    'val_id',
    'amount',
    'store_amount',
    'currency',
    'currency_type',
    'currency_amount',
    'bank_tran_id',
    'card_type',
    'card_brand',
    'card_issuer',
    'risk_level',
    'risk_title',
    'tran_date',
  ];
  return {
    status: String(b?.status ?? ''),
    tranId: str(b?.tran_id),
    valId: str(b?.val_id),
    storeId: str(b?.store_id),
    // currency_amount is the amount in the original currency; amount is what was settled in BDT.
    amount: str(b?.currency_amount ?? b?.amount),
    currency: str(b?.currency_type ?? b?.currency ?? 'BDT'),
    bankTranId: str(b?.bank_tran_id),
    method: str(b?.card_type ?? b?.card_brand),
    riskLevel: str(b?.risk_level),
    raw: Object.fromEntries(
      keep.filter((k) => b?.[k] !== undefined).map((k) => [k, String(b[k]).slice(0, 80)]),
    ),
  };
}

/** Asks SSLCommerz whether this validation id is a real, successful payment. */
export async function validate(f: Fetch, c: SslConfig, valId: string): Promise<Validation | null> {
  const q = new URLSearchParams({
    val_id: valId,
    store_id: c.storeId,
    store_passwd: c.password,
    format: 'json',
  });
  const r = await get(f, `${sslBase(c.environment)}/validator/api/validationserverAPI.php?${q}`);
  return r && r.ok ? readValidation(r.body) : null;
}

/** Finds the successful payment for one of our transaction ids, if the gateway has one. */
export async function queryByTran(
  f: Fetch,
  c: SslConfig,
  tranId: string,
): Promise<{ valId: string | null; status: string } | null> {
  const q = new URLSearchParams({
    tran_id: tranId,
    store_id: c.storeId,
    store_passwd: c.password,
    format: 'json',
  });
  const r = await get(
    f,
    `${sslBase(c.environment)}/validator/api/merchantTransIDvalidationAPI.php?${q}`,
  );
  if (!r || !r.ok) return null;
  const rows: any[] = Array.isArray(r.body?.element) ? r.body.element : [];
  const good = rows.find((e) => ['VALID', 'VALIDATED'].includes(String(e?.status).toUpperCase()));
  const any = rows[0];
  return {
    valId: str(good?.val_id ?? any?.val_id),
    status: String((good ?? any)?.status ?? 'NONE').toUpperCase(),
  };
}

/**
 * IPN authenticity (SSLCommerz's documented scheme): `verify_key` lists the fields signed; they are joined as sorted `key=value`
 * pairs with `store_passwd=<md5 of the store password>`, and the MD5 of that string must equal `verify_sign`. This is only a first
 * check: a payment is never accepted from an IPN without the server-side validation call as well.
 */
export function verifyIpnSignature(body: Record<string, string>, storePassword: string): boolean {
  const sign = body.verify_sign;
  const keys = (body.verify_key ?? '').split(',').filter(Boolean);
  if (!sign || keys.length === 0) return false;
  const fields: Record<string, string> = {};
  for (const k of keys) fields[k] = body[k] ?? '';
  fields.store_passwd = createHash('md5').update(storePassword).digest('hex');
  const text = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  const want = createHash('md5').update(text).digest();
  const got = Buffer.from(sign, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface Expected {
  tranId: string;
  amountMinor: number;
  currency: string;
}
export type Verdict =
  { ok: true } | { ok: false; kind: 'invalid' | 'mismatch' | 'risk'; reason: string };

/** Compares the gateway's validation with what Torio created: status, transaction id, store, amount and currency must all agree. */
export function judge(v: Validation, exp: Expected, storeId: string): Verdict {
  if (!['VALID', 'VALIDATED'].includes(v.status.toUpperCase()))
    return {
      ok: false,
      kind: 'invalid',
      reason: `The gateway did not confirm the payment (${v.status || 'no status'})`,
    };
  if (v.tranId !== exp.tranId)
    return {
      ok: false,
      kind: 'mismatch',
      reason: 'The transaction id does not match this payment',
    };
  if (v.storeId && v.storeId !== storeId)
    return { ok: false, kind: 'mismatch', reason: 'The payment belongs to a different store' };
  if ((v.currency ?? '').toUpperCase() !== exp.currency.toUpperCase())
    return {
      ok: false,
      kind: 'mismatch',
      reason: `Paid in ${v.currency ?? 'an unknown currency'}, expected ${exp.currency}`,
    };
  const paid = Math.round(Number(v.amount) * 100);
  if (!Number.isFinite(paid) || paid !== exp.amountMinor)
    return {
      ok: false,
      kind: 'mismatch',
      reason: `Paid ${v.amount ?? 'an unknown amount'}, expected ${(exp.amountMinor / 100).toFixed(2)}`,
    };
  if (v.riskLevel === '1')
    return {
      ok: false,
      kind: 'risk',
      reason: 'The gateway flagged this payment as risky and it needs review',
    };
  return { ok: true };
}
