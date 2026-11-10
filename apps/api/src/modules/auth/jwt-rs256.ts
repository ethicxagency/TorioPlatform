import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

export interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  [k: string]: unknown;
}

export class JwtInvalid extends Error {}

const decode = <T>(part: string): T =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;

/**
 * Verifies an RS256 JWT against a JWKS: signature (by `kid`), expiry, issuer and audience. Throws JwtInvalid with a
 * reason that is safe to log (never the token itself).
 */
export function verifyRs256(
  token: string,
  jwks: { keys: (JsonWebKey & { kid?: string })[] },
  opts: { issuers: string[]; audience: string; now?: number; skewSeconds?: number },
): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtInvalid('malformed token');
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: JwtClaims;
  try {
    header = decode(h);
    claims = decode(p);
  } catch {
    throw new JwtInvalid('malformed token');
  }
  if (header.alg !== 'RS256') throw new JwtInvalid('unexpected algorithm');
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new JwtInvalid('unknown signing key');
  const ok = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new JwtInvalid('bad signature');
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + (opts.skewSeconds ?? 30) < now)
    throw new JwtInvalid('token expired');
  if (!claims.iss || !opts.issuers.includes(claims.iss)) throw new JwtInvalid('wrong issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.audience)) throw new JwtInvalid('wrong audience');
  return claims;
}
