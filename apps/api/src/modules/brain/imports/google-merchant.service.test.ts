import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { emptyBrainConfig, type BrainConfig } from '@torio/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedService } from './feed.service';
import {
  GoogleApiError,
  type GoogleMerchantClient,
  type MerchantProduct,
} from './google-merchant.client';
import { GoogleMerchantService } from './google-merchant.service';
import { MetaCatalogService } from './meta-catalog.service';
import { ScanService } from './scan.service';
import { signState } from './signed-state';
import { fakeDb } from './test-db';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'google-client-secret';
const REFRESH = 'REFRESH-TOKEN-xyz';

const prod = (id: string, title: string, price: number): MerchantProduct => ({
  offerId: id,
  productAttributes: {
    title,
    price: { amountMicros: String(price * 1e6), currencyCode: 'BDT' },
    availability: 'IN_STOCK',
    link: `https://s.test/${id}`,
  },
});

describe('GoogleMerchantService', () => {
  let db: ReturnType<typeof fakeDb>;
  let svc: GoogleMerchantService;
  let scans: ScanService;
  let enabled: boolean;
  let scope: string;
  let refresh: string | undefined;
  let revoked: string[];
  let pages: Record<string, { products: MerchantProduct[]; next: string | null }>;
  let failWith: Error | null;
  let current: BrainConfig;

  const cfg = () => ({
    get GOOGLE_MERCHANT_ENABLED() {
      return enabled;
    },
    GOOGLE_CLIENT_ID: 'cid-1234567890',
    GOOGLE_CLIENT_SECRET: SECRET,
    GOOGLE_MERCHANT_REDIRECT_URI: 'https://api.test/api/v1/brain/imports/google/callback',
    WEB_URL: 'https://web.test/',
  });

  beforeEach(() => {
    db = fakeDb();
    enabled = true;
    scope = 'https://www.googleapis.com/auth/content';
    refresh = REFRESH;
    revoked = [];
    failWith = null;
    current = emptyBrainConfig();
    pages = {
      first: {
        products: [prod('A1', 'Nordic Vase', 1500), prod('B2', 'Linen Cushion', 900)],
        next: 'p2',
      },
      p2: { products: [prod('B2', 'Linen Cushion', 900), prod('C3', 'Lamp', 2500)], next: null },
    };
    const api = {
      authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?scope=content',
      exchangeCode: async () => ({ access_token: 'AT', refresh_token: refresh, scope }),
      accessToken: async (a: { refreshToken: string }) => {
        if (failWith) throw failWith;
        expect(a.refreshToken).toBe(REFRESH);
        return 'AT2';
      },
      revoke: async (t: string) => void revoked.push(t),
      accounts: async () => [{ id: '42', name: 'UrbanNest' }],
      products: async (_t: string, _a: string, next?: string) => pages[next ?? 'first']!,
    } as unknown as GoogleMerchantClient;
    const crypto = {
      configured: true,
      encrypt: (s: string) => `enc:${Buffer.from(s).toString('base64')}`,
      decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString(),
    };
    const prisma = { client: db.client } as never;
    svc = new GoogleMerchantService(prisma, crypto as never, api, cfg() as never);
    const brain = {
      get: async () => ({ config: structuredClone(current), version: 1 }),
      save: async (_w: string, _u: string, c: BrainConfig) => ((current = c), {}),
    };
    scans = new ScanService(
      prisma,
      brain as never,
      new FeedService(prisma),
      {} as unknown as MetaCatalogService,
      svc,
      {} as never,
    );
  });

  const state = (ws = WS) => signState({ w: ws, u: USER }, SECRET);
  const connect = (ws = WS) => svc.callback({ code: 'code', state: state(ws) });
  const ready = async () => {
    await connect();
    await svc.select(WS, '42');
  };

  it('is honestly unavailable until switched on and configured', async () => {
    enabled = false;
    expect((await svc.status(WS)).reason).toMatch(/Merchant API scope/);
    expect(() => svc.connect(WS, USER)).toThrow(ServiceUnavailableException);
    enabled = true;
    expect((await svc.status(WS)).available).toBe(true);
    expect(svc.connect(WS, USER).url).toContain('accounts.google.com');
  });

  it('stores only the encrypted refresh token; a forged state, denial, wrong scope or no refresh token connects nothing', async () => {
    const base = 'https://web.test/brain?tab=intelligence&google_merchant=';
    expect(await svc.callback({ code: 'c', state: 'forged' })).toBe(`${base}invalid_state`);
    expect(await svc.callback({ error: 'access_denied', state: state() })).toBe(`${base}denied`);
    scope = 'openid email';
    expect(await connect()).toBe(`${base}missing_permissions`);
    scope = 'https://www.googleapis.com/auth/content';
    refresh = undefined;
    expect(await connect()).toBe(`${base}no_refresh_token`);
    expect(db.t.secrets).toHaveLength(0);
    refresh = REFRESH;
    expect(await connect()).toBe(`${base}connected`);
    expect(db.t.secrets[0].ciphertext).not.toContain(REFRESH);
    expect(JSON.stringify(await svc.status(WS))).not.toContain(REFRESH);
    expect(await svc.status(WS)).toMatchObject({ connected: true, catalog: null });
  });

  it('only lets the connected account’s Merchant Center accounts be chosen', async () => {
    await connect();
    expect((await svc.accounts(WS)).data[0]).toMatchObject({ id: '42', name: 'UrbanNest' });
    await expect(svc.select(WS, '999')).rejects.toBeInstanceOf(BadRequestException);
    expect((await svc.select(WS, '42')).catalog).toEqual({ id: '42', name: 'UrbanNest' });
  });

  it('previews, then a sync proposes products for review only, ignoring duplicates across pages', async () => {
    await ready();
    expect(await svc.preview(WS)).toMatchObject({
      format: 'google-merchant',
      totalItems: 4,
      valid: 3,
      duplicates: 1,
    });
    const id = await svc.startJob(WS, USER);
    await expect(svc.startJob(WS, USER)).rejects.toBeInstanceOf(ConflictException);
    await svc.step(WS, id);
    const d = await scans.detail(WS, id);
    expect(d.job.status).toBe('NEEDS_REVIEW');
    expect(d.job.stats).toMatchObject({ items: 4, products: 3 });
    const recs = (await scans.records(WS, id)).data;
    expect(recs.map((r) => r.title).sort()).toEqual(['Lamp', 'Linen Cushion', 'Nordic Vase']);
    expect(recs[0]!.data['currency']).toBe('BDT');
    expect(current.products).toHaveLength(0);
  });

  it('a revoked grant ends the sync with a reconnect message and marks the source', async () => {
    await ready();
    failWith = new GoogleApiError('Token has been expired or revoked.', 400, 'invalid_grant');
    const id = await svc.startJob(WS, USER);
    await svc.step(WS, id);
    const d = await scans.detail(WS, id);
    expect(d.job.status).toBe('FAILED');
    expect(d.job.error).toMatch(/expired or was revoked. Reconnect/);
    expect((await svc.status(WS)).status).toBe('ERROR');
  });

  it('stores are isolated; disconnecting revokes at Google and deletes the token but keeps imported knowledge', async () => {
    await ready();
    expect((await svc.status(OTHER)).connected).toBe(false);
    await expect(svc.accounts(OTHER)).rejects.toBeInstanceOf(ConflictException);
    await svc.disconnect(WS);
    expect(revoked).toEqual([REFRESH]);
    expect(db.t.secrets).toHaveLength(0);
    expect(await svc.status(WS)).toMatchObject({ connected: false, status: 'DISCONNECTED' });
  });
});
