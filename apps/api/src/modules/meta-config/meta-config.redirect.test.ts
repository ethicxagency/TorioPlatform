import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/config.module';
import { MetaConfigService } from './meta-config.service';

const base = {
  NODE_ENV: 'production',
  API_PORT: 4000,
  WEB_URL: 'https://torioplatform.vercel.app', // the web app's address: never a callback base
  META_GRAPH_VERSION: 'v27.0',
  FACEBOOK_APP_ID: '1533990358131449',
  FACEBOOK_APP_SECRET: 'facebook-secret',
} as unknown as AppConfig;
const svc = (over: Partial<AppConfig> = {}) =>
  new MetaConfigService({} as never, {} as never, {} as never, { ...base, ...over } as AppConfig);

const ROUTE = '/api/v1/auth/oauth/facebook/callback';

describe('customer Facebook redirect URI', () => {
  it('defaults to the API origin + the Facebook sign-in route, never the web app address', () => {
    const s = svc({ API_URL: 'https://torio.nextupglobal.net' });
    const r = s.customerFacebookRedirect();
    expect(r.uri).toBe(`https://torio.nextupglobal.net${ROUTE}`);
    expect(r.source).toBe('derived');
    expect(r.uri).not.toContain('torioplatform.vercel.app');
    const d = s.customerAuthDiagnostic();
    expect(d).toMatchObject({
      generatedUri: `https://torio.nextupglobal.net${ROUTE}`,
      expectedPath: ROUTE,
      matchesRoute: true,
      registerInMeta: `https://torio.nextupglobal.net${ROUTE}`,
      facebookAppId: '1533990358131449',
    });
  });

  it('production with no API_URL and nothing saved refuses to guess', () => {
    const r = svc().customerFacebookRedirect();
    expect(r.uri).toBeNull();
    expect(r.problems.join(' ')).toMatch(/API_URL/);
    expect(svc().customerAuthDiagnostic().matchesRoute).toBe(false);
  });

  it('outside production it falls back to the local API', () => {
    expect(svc({ NODE_ENV: 'development' }).customerFacebookRedirect().uri).toBe(
      `http://localhost:4000${ROUTE}`,
    );
  });

  it('the channel callback route is refused for this flow', () => {
    const s = svc({
      API_URL: 'https://torio.nextupglobal.net',
      FACEBOOK_REDIRECT_URI: 'https://torio.nextupglobal.net/api/v1/channels/meta/callback',
    });
    const r = s.customerFacebookRedirect();
    expect(r.uri).toBeNull();
    expect(r.problems.join(' ')).toMatch(/exactly \/api\/v1\/auth\/oauth\/facebook\/callback/);
  });
});
