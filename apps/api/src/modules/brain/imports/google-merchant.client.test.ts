import { describe, expect, it } from 'vitest';
import {
  explainGoogle,
  GoogleApiError,
  GoogleMerchantClient,
  toRaw,
} from './google-merchant.client';

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('GoogleMerchantClient', () => {
  it('builds an offline, consent-forcing authorization URL with only the Merchant scope', () => {
    const u = new URL(
      new GoogleMerchantClient().authUrl({
        clientId: 'cid',
        redirectUri: 'https://api.test/cb',
        state: 's1',
      }),
    );
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/content');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('s1');
  });

  it('exchanges codes and refresh tokens server-side, and lists accounts and products with paging', async () => {
    const calls: { url: string; auth?: string; body?: string }[] = [];
    const c = new GoogleMerchantClient(async (url, init) => {
      calls.push({
        url,
        auth: (init?.headers as Record<string, string> | undefined)?.authorization,
        body: String(init?.body ?? ''),
      });
      if (url.includes('oauth2.googleapis.com/token'))
        return res(200, {
          access_token: 'AT',
          refresh_token: 'RT',
          scope: 'https://www.googleapis.com/auth/content',
        });
      if (url.includes('/accounts/v1/accounts'))
        return res(200, {
          accounts: [{ name: 'accounts/42', accountId: '42', accountName: 'UrbanNest' }],
        });
      if (url.includes('pageToken=p2')) return res(200, { products: [{ offerId: 'B2' }] });
      return res(200, { products: [{ offerId: 'A1' }], nextPageToken: 'p2' });
    });
    const t = await c.exchangeCode({
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'https://api.test/cb',
      code: 'code1',
    });
    expect(t.refresh_token).toBe('RT');
    expect(calls[0]!.body).toContain('grant_type=authorization_code');
    expect(await c.accessToken({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'RT' })).toBe(
      'AT',
    );
    expect(await c.accounts('AT')).toEqual([{ id: '42', name: 'UrbanNest' }]);
    expect(calls.at(-1)!.auth).toBe('Bearer AT');
    const p1 = await c.products('AT', '42');
    expect(p1).toMatchObject({ next: 'p2' });
    expect((await c.products('AT', '42', 'p2')).next).toBeNull();
  });

  it('turns Google failures into actionable messages', async () => {
    const c = new GoogleMerchantClient(async () =>
      res(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    );
    const e = await c
      .accessToken({ clientId: 'a', clientSecret: 'b', refreshToken: 'c' })
      .catch((x) => x);
    expect(e).toBeInstanceOf(GoogleApiError);
    expect(e.reconnect).toBe(true);
    expect(explainGoogle(e)).toMatch(/expired or was revoked. Reconnect/);
    expect(explainGoogle(new GoogleApiError('x', 403))).toMatch(/Merchant API scope/);
    expect(explainGoogle(new GoogleApiError('x', 429))).toMatch(/rate-limiting/);
    expect(explainGoogle(new Error('boom'))).toMatch(/Could not reach Google/);
  });

  it('maps a product to the shared field names, converting micros to a price', () => {
    const r = toRaw({
      offerId: 'A1',
      productAttributes: {
        title: 'Vase',
        price: { amountMicros: '1500000000', currencyCode: 'BDT' },
        availability: 'IN_STOCK',
        link: 'https://s.test/a1',
        productTypes: ['Home > Vases'],
        sizes: ['S', 'M'],
      },
    });
    expect(r).toMatchObject({
      id: 'A1',
      title: 'Vase',
      price: '1500 BDT',
      availability: 'IN_STOCK',
      link: 'https://s.test/a1',
      product_type: 'Home > Vases',
      size: 'S, M',
    });
  });
});
