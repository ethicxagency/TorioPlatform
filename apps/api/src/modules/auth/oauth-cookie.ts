import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring payloads carried in short-lived HttpOnly cookies during a social sign-in: the OAuth state (so a
 * callback can only complete the flow this browser started: CSRF protection) and the pending-identity hand-off.
 * HMAC-SHA256 under a key derived from the server secret and a purpose label, so a token for one purpose can never
 * be replayed as another, nor as an access token.
 */
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const key = (secret: string, purpose: string) =>
  createHmac('sha256', secret).update(`torio.auth.${purpose}.v1`).digest();

export function signCookie<T extends object>(
  purpose: string,
  payload: T,
  secret: string,
  ttlMs: number,
  now = Date.now(),
): string {
  const body = b64(JSON.stringify({ ...payload, e: now + ttlMs }));
  return `${body}.${b64(createHmac('sha256', key(secret, purpose)).update(body).digest())}`;
}

export function verifyCookie<T extends object>(
  purpose: string,
  token: string | undefined,
  secret: string,
  now = Date.now(),
): (T & { e: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = createHmac('sha256', key(secret, purpose)).update(body).digest();
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { e: number };
    return typeof p.e === 'number' && p.e >= now ? p : null;
  } catch {
    return null;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Only same-site relative paths are ever used after sign-in, so a crafted link can't bounce a customer to another site. */
export function safeReturnTo(value: string | undefined | null): string {
  if (!value || value.length > 300) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  for (const ch of value) if (ch.charCodeAt(0) < 32) return '/';
  // Never land a customer in the platform admin area or back on an auth page.
  if (
    /^\/(admin|login|signup|auth|forgot-password|reset-password|verify-email)(\/|\?|$)/.test(value)
  )
    return '/';
  return value;
}
