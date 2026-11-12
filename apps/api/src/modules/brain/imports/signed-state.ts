import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Signed, expiring OAuth state binding a redirect to one workspace and user, so a callback cannot be forged or replayed elsewhere. */
export interface StatePayload {
  w: string;
  u: string;
  n: string;
  e: number;
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (secret: string, body: string) =>
  createHmac(
    'sha256',
    createHmac('sha256', secret).update('torio.google.merchant.state.v1').digest(),
  )
    .update(body)
    .digest();

export function signState(
  p: { w: string; u: string },
  secret: string,
  ttlMs = 10 * 60_000,
  now = Date.now(),
) {
  const body = b64(
    JSON.stringify({ ...p, n: randomBytes(12).toString('base64url'), e: now + ttlMs }),
  );
  return `${body}.${b64(mac(secret, body))}`;
}

export function verifyState(state: string, secret: string, now = Date.now()): StatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const want = mac(secret, body);
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    return p.e > now && p.w && p.u ? p : null;
  } catch {
    return null;
  }
}
