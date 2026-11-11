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
