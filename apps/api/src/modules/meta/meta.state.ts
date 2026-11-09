import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface OAuthStatePayload {
  /** workspace id */
  w: string;
  /** user id */
  u: string;
  /** provider */
  p: 'MESSENGER' | 'INSTAGRAM';
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
): string {
  const body = b64(
    JSON.stringify({ ...p, n: randomBytes(12).toString('base64url'), e: now + STATE_TTL_MS }),
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
    if (p.p !== 'MESSENGER' && p.p !== 'INSTAGRAM') return null;
    return p;
  } catch {
    return null;
  }
}
