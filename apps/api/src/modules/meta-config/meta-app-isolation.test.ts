import { describe, expect, it } from 'vitest';
import { META_APP_IDS, RETIRED_META_APP_IDS } from '@torio/contracts';
import type { AppConfig } from '../../config/config.module';
import { MetaAuthConfigService } from './meta-auth-config.service';
import { MetaConfigService } from './meta-config.service';

const LEGACY = '1533990358131449';
const base = {
  NODE_ENV: 'production',
  API_PORT: 4000,
  WEB_URL: 'https://torio.example.com',
  API_URL: 'https://torio.example.com',
  META_GRAPH_VERSION: 'v27.0',
} as unknown as AppConfig;
const crypto = { configured: true, decrypt: (x: string) => x } as never;

const platform = (over: Partial<AppConfig> = {}) =>
  new MetaConfigService({} as never, crypto, {} as never, { ...base, ...over } as AppConfig);
const auth = (
  over: Partial<AppConfig> = {},
  bizId: string | null = META_APP_IDS.BUSINESS_MESSAGING,
) =>
  new MetaAuthConfigService(
    {} as never,
    crypto,
    {} as never,
    { current: { appId: bizId } } as never,
    {} as never,
    { ...base, ...over } as AppConfig,
  );
// Resolve against a saved row, as a database read would.
const platformWith = (row: object, over: Partial<AppConfig> = {}) =>
  (platform(over) as unknown as { build(r: object): { appId: string | null } }).build(row);
const authWith = (row: object, over: Partial<AppConfig> = {}) =>
  (
    auth(over) as unknown as {
      build(r: object): { appId: string | null; appSecret: string | null };
    }
  ).build(row);

describe('Meta app isolation', () => {
  it('the legacy App ID is retired and the two live IDs are distinct', () => {
    expect(RETIRED_META_APP_IDS).toContain(LEGACY);
    expect(Object.values(META_APP_IDS)).not.toContain(LEGACY);
    expect(META_APP_IDS.AUTH).toBe('2321020315413901');
    expect(META_APP_IDS.BUSINESS_MESSAGING).toBe('3850545818418490');
    expect(META_APP_IDS.AUTH).not.toBe(META_APP_IDS.BUSINESS_MESSAGING);
  });

  it('Torio Platform resolves to its own App ID by default', () => {
    expect(platform().current.appId).toBe('3850545818418490');
  });

  it('Torio Auth resolves to its own App ID by default', () => {
    expect(auth().current.appId).toBe('2321020315413901');
  });

  it('Torio Platform skips a legacy App ID in the environment or the database', () => {
    expect(platform({ META_APP_ID: LEGACY }).current).toMatchObject({
      appId: '3850545818418490',
      ignoredRetiredAppIds: [LEGACY],
    });
    expect(platformWith({ appId: LEGACY }).appId).toBe('3850545818418490');
    expect(platformWith({ appId: LEGACY }, { META_APP_ID: LEGACY }).appId).toBe('3850545818418490');
  });

  it('Torio Auth skips a legacy App ID in the environment or the database', () => {
    expect(auth({ FACEBOOK_APP_ID: LEGACY }).current.appId).toBe('2321020315413901');
    expect(authWith({ appId: LEGACY }).appId).toBe('2321020315413901');
    expect(
      authWith({ appId: LEGACY, appSecretCiphertext: 'saved-secret' }, { FACEBOOK_APP_ID: LEGACY }),
    ).toMatchObject({ appId: '2321020315413901', appSecret: 'saved-secret' });
  });

  it('a saved App ID wins, and each app reads only its own environment variable', () => {
    expect(platformWith({ appId: '999999999' }).appId).toBe('999999999');
    // FACEBOOK_APP_ID is for Torio Auth only; META_APP_ID for Torio Platform only.
    expect(platform({ FACEBOOK_APP_ID: '2321020315413901' }).current.appId).toBe(
      '3850545818418490',
    );
    expect(auth({ META_APP_ID: '3850545818418490' }).current.appId).toBe('2321020315413901');
  });

  it('Torio Auth warns, and refuses the Business Messaging App ID', () => {
    const a = auth({ FACEBOOK_APP_ID: LEGACY });
    expect(
      a.validate(a.current).some((p) => p.severity === 'warning' && /retired/.test(p.message)),
    ).toBe(true);
    const b = auth({
      FACEBOOK_APP_ID: '3850545818418490',
      FACEBOOK_APP_SECRET: 'env-secret-value',
    });
    expect(b.validate(b.current).some((p) => p.field === 'appId' && p.severity === 'error')).toBe(
      true,
    );
  });
});

describe('App Domain normalization', () => {
  it('reduces a pasted URL to its hostname', async () => {
    const { normalizeAppDomain } = await import('@torio/contracts');
    expect(normalizeAppDomain('https://torio.nextupglobal.net')).toBe('torio.nextupglobal.net');
    expect(normalizeAppDomain('https://Torio.Nextupglobal.net/path?x=1')).toBe(
      'torio.nextupglobal.net',
    );
    expect(normalizeAppDomain('torio.nextupglobal.net:8080/')).toBe('torio.nextupglobal.net');
    expect(normalizeAppDomain('torio.nextupglobal.net')).toBe('torio.nextupglobal.net');
  });
});
