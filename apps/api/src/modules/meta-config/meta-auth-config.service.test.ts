/* eslint-disable @typescript-eslint/no-explicit-any -- private method and loose details are read directly */
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/config.module';
import { MetaAuthConfigService } from './meta-auth-config.service';
import type { MetaConfigService } from './meta-config.service';

const ROUTE = '/api/v1/auth/oauth/facebook/callback';
const base = {
  NODE_ENV: 'production',
  API_PORT: 4000,
  WEB_URL: 'https://torioplatform.vercel.app', // never a callback base
  META_GRAPH_VERSION: 'v27.0',
} as unknown as AppConfig;
const business = (appId: string | null) => ({ current: { appId } }) as unknown as MetaConfigService;
const svc = (over: Partial<AppConfig> = {}, biz: string | null = '3850545818418490') =>
  new MetaAuthConfigService(
    {} as never,
    { configured: true, decrypt: (x: string) => x } as never,
    {} as never,
    business(biz),
    {} as never,
    { ...base, ...over } as AppConfig,
  );

describe('Torio Auth app configuration', () => {
  it('uses a current environment pair until its own secret is saved', () => {
    const s = svc({ FACEBOOK_APP_ID: '2321020315413901', FACEBOOK_APP_SECRET: 'env-secret-value' });
    expect(s.current).toMatchObject({
      appId: '2321020315413901',
      appSecret: 'env-secret-value',
      credentialsFrom: 'environment',
    });
    expect(s.ready).toBe(true);
  });

  it('never resolves the retired legacy App ID, nor the secret tied to it', () => {
    const s = svc({
      FACEBOOK_APP_ID: '1533990358131449',
      FACEBOOK_APP_SECRET: 'legacy-secret-value',
    });
    expect(s.current).toMatchObject({
      appId: '2321020315413901',
      appSecret: null,
      credentialsFrom: 'none',
      ignoredRetiredAppIds: ['1533990358131449'],
    });
    expect(s.ready).toBe(false);
  });

  it('suggests the Torio Auth app id when nothing is configured and is not ready without a secret', () => {
    const s = svc();
    expect(s.current).toMatchObject({
      appId: '2321020315413901',
      appSecret: null,
      credentialsFrom: 'none',
    });
    expect(s.ready).toBe(false);
    expect(s.validate(s.current).map((p) => p.field)).toContain('appSecret');
  });

  it('refuses to be the Business Messaging app', () => {
    const s = svc(
      { FACEBOOK_APP_ID: '3850545818418490', FACEBOOK_APP_SECRET: 'env-secret-value' },
      '3850545818418490',
    );
    expect(
      s
        .validate(s.current)
        .some((p) => p.field === 'appId' && /separate Torio Auth app/.test(p.message)),
    ).toBe(true);
  });

  it('builds the redirect URI from the API origin and only for its own route', () => {
    const ok = svc({ API_URL: 'https://torio.nextupglobal.net' }).redirect();
    expect(ok).toMatchObject({ uri: `https://torio.nextupglobal.net${ROUTE}`, source: 'derived' });
    expect(svc().redirect().uri).toBeNull(); // production never guesses
    const channel = svc({
      API_URL: 'https://torio.nextupglobal.net',
      FACEBOOK_REDIRECT_URI: 'https://torio.nextupglobal.net/api/v1/channels/meta/callback',
    });
    expect(channel.redirect().uri).toBeNull();
    expect(channel.redirect().problems.join(' ')).toMatch(
      /exactly \/api\/v1\/auth\/oauth\/facebook\/callback/,
    );
  });
});

describe('customer Facebook login checks (beyond the credentials)', () => {
  const mk = (domains: string[] | null | Error, over: Partial<AppConfig> = {}) =>
    new MetaAuthConfigService(
      {} as never,
      { configured: true, decrypt: (x: string) => x } as never,
      {} as never,
      business('3850545818418490'),
      {
        get: () => ({
          appDomains: async () => {
            if (domains instanceof Error) throw domains;
            return domains;
          },
        }),
      } as never,
      {
        ...base,
        JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
        API_URL: 'https://torio.nextupglobal.net',
        FACEBOOK_APP_ID: '2321020315413901',
        FACEBOOK_APP_SECRET: 'env-secret-value',
        ...over,
      } as AppConfig,
    );
  const run = (s: MetaAuthConfigService) => (s as any).loginChecks(s.current);
  const val = (r: any, label: string) => r.details.find((d: any) => d.label === label)?.value;

  it('fails, naming the hostname, when it is not in the app’s App Domains (the Meta "Can’t load URL" error)', async () => {
    const r = await run(mk(['torioplatform.vercel.app']));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('torio.nextupglobal.net is not in the app’s App Domains');
    expect(r.resolution).toMatch(/add torio\.nextupglobal\.net/);
    expect(r.resolution).toMatch(/no https:\/\//);
    expect(val(r, 'OAuth hostname')).toBe('torio.nextupglobal.net');
    expect(val(r, 'Redirect URI sent to Meta')).toBe(`https://torio.nextupglobal.net${ROUTE}`);
    expect(val(r, 'Hostname allowed by App Domains')).toBe('No');
    expect(val(r, 'Active App ID')).toContain('Torio Auth');
  });
  it('passes when the host, or its parent domain, is listed, and still reminds about the redirect URIs Meta does not expose', async () => {
    for (const d of ['torio.nextupglobal.net', 'nextupglobal.net']) {
      const r = await run(mk([d]));
      expect(r.ok).toBe(true);
      expect(val(r, 'Hostname allowed by App Domains')).toBe('Yes');
      expect(r.resolution).toMatch(/Valid OAuth Redirect URIs|registered under Facebook Login/);
    }
    // a lookalike is not a parent domain
    expect((await run(mk(['xnextupglobal.net']))).ok).toBe(false);
  });
  it('does not guess when Meta does not return the domains', async () => {
    for (const d of [null, new Error('boom')]) {
      const r = await run(mk(d));
      expect(r.ok).toBe(true);
      expect(val(r, 'App Domains at Meta')).toBe('Meta did not return them');
      expect(r.resolution).toMatch(/confirm torio\.nextupglobal\.net is listed/);
    }
  });
  it('refuses the Torio Platform app for customer sign-in, and verifies the signed OAuth state', async () => {
    const wrong = await run(
      mk(['torio.nextupglobal.net'], { FACEBOOK_APP_ID: '3850545818418490' }),
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/Torio Platform app/);
    const r = await run(mk(['torio.nextupglobal.net']));
    expect(val(r, 'OAuth state check')).toMatch(/verifies/);
    expect(val(r, 'Callback route')).toBe(ROUTE);
  });
  it('never includes the App Secret in the result', async () => {
    const r = await run(mk(['torioplatform.vercel.app']));
    expect(JSON.stringify(r)).not.toContain('env-secret-value');
  });
});
