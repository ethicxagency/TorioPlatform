import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/config.module';
import type { MetaConfigService } from '../meta-config/meta-config.service';
import { SocialAuthError, SocialProviders } from './social.providers';

const PROD_URI = 'https://torio.nextupglobal.net/api/v1/auth/oauth/google/callback';
const base = {
  NODE_ENV: 'production',
  API_PORT: 4000,
  WEB_URL: 'https://torioplatform.vercel.app', // the web app's address: must never leak into the Google callback
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret-value',
  META_GRAPH_VERSION: 'v27.0',
} as unknown as AppConfig;

const make = (over: Partial<AppConfig> = {}) =>
  new SocialProviders({ ...base, ...over } as AppConfig, {} as MetaConfigService);
const authUrl = (p: SocialProviders, redirectUri: string) =>
  new URL(p.authorizeUrl('google', { state: 's', nonce: 'n', challenge: 'c', redirectUri }));

describe('Google redirect URI', () => {
  it('is built from the public API origin, never from the web app address', async () => {
    const p = make({ API_URL: 'https://torio.nextupglobal.net' });
    const uri = await p.redirectUri('google');
    expect(uri).toBe(PROD_URI);
    expect(authUrl(p, uri).searchParams.get('redirect_uri')).toBe(PROD_URI); // exactly what Google receives
    expect(uri).not.toContain('torioplatform.vercel.app');
  });

  it('an explicit GOOGLE_REDIRECT_URI wins over API_URL', async () => {
    const p = make({ API_URL: 'https://other.example.com', GOOGLE_REDIRECT_URI: PROD_URI });
    expect(await p.redirectUri('google')).toBe(PROD_URI);
  });

  it('production with neither value refuses to guess (no silent fallback to WEB_URL or localhost)', async () => {
    const p = make();
    await expect(p.redirectUri('google')).rejects.toMatchObject({
      code: 'redirect_uri_not_configured',
    });
    expect(p.diagnostics().google.problems.join(' ')).toMatch(/GOOGLE_REDIRECT_URI/);
  });

  it('outside production it falls back to the local API', async () => {
    expect(await make({ NODE_ENV: 'development' }).redirectUri('google')).toBe(
      'http://localhost:4000/api/v1/auth/oauth/google/callback',
    );
  });

  it('refuses a configured value that is not Google’s callback route or not https in production', async () => {
    for (const bad of [
      'https://torio.nextupglobal.net/api/v1/channels/meta/callback',
      'https://torio.nextupglobal.net/api/v1/auth/oauth/facebook/callback',
      'http://torio.nextupglobal.net/api/v1/auth/oauth/google/callback',
      `${PROD_URI}?x=1`,
    ])
      await expect(make({ GOOGLE_REDIRECT_URI: bad }).redirectUri('google')).rejects.toBeInstanceOf(
        SocialAuthError,
      );
  });

  it('the token exchange repeats the redirect URI the authorization used', async () => {
    const p = make({ API_URL: 'https://torio.nextupglobal.net' });
    const sent: URLSearchParams[] = [];
    p.fetch = (async (_u: unknown, init?: RequestInit) => {
      sent.push(init?.body as URLSearchParams);
      return new Response('{}', { status: 400 }); // stop after capturing the request
    }) as typeof fetch;
    const uri = await p.redirectUri('google');
    await expect(
      p.exchange('google', 'code', { verifier: 'v', nonce: 'n', redirectUri: uri }),
    ).rejects.toBeInstanceOf(SocialAuthError);
    expect(sent[0]!.get('redirect_uri')).toBe(PROD_URI);
    expect(sent[0]!.get('redirect_uri')).toBe(authUrl(p, uri).searchParams.get('redirect_uri'));
    expect(sent[0]!.get('code_verifier')).toBe('v');
  });
});
