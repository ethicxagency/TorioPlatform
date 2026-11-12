import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** CATALOG is the product-catalog import in Brain → Intelligence; it shares the Meta app and redirect, not the channel flow. */
export type MetaProduct = 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP' | 'CATALOG';
const PRODUCTS = new Set<string>(['MESSENGER', 'INSTAGRAM', 'WHATSAPP', 'CATALOG']);

export interface OAuthStatePayload {
  /** workspace id */
  w: string;
  /** user id */
  u: string;
  /** products the user is authorizing */
  p: MetaProduct[];
  /** random nonce */
  n: string;
  /** expiry, epoch ms */
  e: number;
}

export const STATE_TTL_MS = 10 * 60_000;
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

const mac = (secret: string, body: string) =>
  createHmac('sha256', createHmac('sha256', secret).update('torio.meta.oauth.state.v1').digest())
    .update(body)
    .digest();

/** Signed, expiring OAuth `state`: binds the redirect to one workspace, user and provider so a callback can't be forged or replayed elsewhere. */
export function signState(
  p: Omit<OAuthStatePayload, 'n' | 'e'>,
  secret: string,
  now = Date.now(),
  ttlMs = STATE_TTL_MS,
): string {
  const body = b64(
    JSON.stringify({ ...p, n: randomBytes(12).toString('base64url'), e: now + ttlMs }),
  );
  return `${body}.${b64(mac(secret, body))}`;
}

export function verifyState(
  token: string,
  secret: string,
  now = Date.now(),
): OAuthStatePayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = mac(secret, body);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!p.w || !p.u || !p.n || typeof p.e !== 'number' || p.e < now) return null;
    if (!Array.isArray(p.p) || !p.p.length || !p.p.every((x) => PRODUCTS.has(x))) return null;
    return p;
  } catch {
    return null;
  }
}
