import type { RawItem } from './xml';

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Google's error reason, e.g. `invalid_grant`. */
    readonly reason?: string,
  ) {
    super(message);
  }
  /** The refresh token is no longer accepted: the person revoked access, or it expired. They must reconnect. */
  get reconnect() {
    return this.reason === 'invalid_grant' || this.status === 401;
  }
  get transient() {
    return this.status === 429 || this.status >= 500;
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const MERCHANT_SCOPE = 'https://www.googleapis.com/auth/content';
const API = 'https://merchantapi.googleapis.com';

/** Plain-language reason for a failed call. Raw Google responses are logged by the caller, never shown. */
export function explainGoogle(e: unknown): string {
  if (e instanceof GoogleApiError) {
    if (e.reconnect) return 'Google authorization expired or was revoked. Reconnect to continue.';
    if (e.status === 403)
      return 'Google denied access. The Google account needs access to the Merchant Center account, and the Torio Google app must be approved for the Merchant API scope.';
    if (e.status === 404)
      return 'That Merchant Center account was not found for the connected Google account.';
    if (e.transient)
      return 'Google is rate-limiting or temporarily unavailable. Try again shortly.';
    return `Google rejected the request: ${e.message}`.slice(0, 300);
  }
  return 'Could not reach Google. Try again.';
}

/** The Merchant API fields we use, flattened to the names the shared product mapping expects. */
export interface MerchantProduct {
  name?: string;
  offerId?: string;
  productAttributes?: {
    title?: string;
    description?: string;
    link?: string;
    imageLink?: string;
    price?: { amountMicros?: string; currencyCode?: string };
    availability?: string;
    productTypes?: string[];
    color?: string;
    sizes?: string[];
    brand?: string;
  };
}

export function toRaw(p: MerchantProduct): RawItem {
  const a = p.productAttributes ?? {};
  const out: RawItem = {};
  const set = (k: string, v: string | undefined) => v && (out[k] = v);
  set('id', p.offerId ?? p.name?.split('~').pop());
  set('title', a.title);
  set('description', a.description);
  if (a.price?.amountMicros) {
    const amount = Number(a.price.amountMicros) / 1_000_000;
    if (Number.isFinite(amount)) set('price', `${amount} ${a.price.currencyCode ?? ''}`.trim());
  }
  set('availability', a.availability);
  set('link', a.link);
  set('image_link', a.imageLink);
  set('product_type', a.productTypes?.[0]);
  set('color', a.color);
  set('size', a.sizes?.join(', '));
  return out;
}

/** Server-side client for Google OAuth and the Merchant API. `fetchImpl` is injectable so tests never touch the network. */
export class GoogleMerchantClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string } | string;
      error_description?: string;
    };
    if (!res.ok) {
      const reason = typeof body.error === 'string' ? body.error : body.error?.status;
      const message =
        body.error_description ??
        (typeof body.error === 'object' ? body.error?.message : body.error) ??
        `HTTP ${res.status}`;
      throw new GoogleApiError(message, res.status, reason?.toLowerCase());
    }
    return body as T;
  }

  authUrl(a: { clientId: string; redirectUri: string; state: string }) {
    const q = new URLSearchParams({
      client_id: a.clientId,
      redirect_uri: a.redirectUri,
      response_type: 'code',
      scope: MERCHANT_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: a.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  private token(params: Record<string, string>) {
    return this.json<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  }
  exchangeCode(a: { clientId: string; clientSecret: string; redirectUri: string; code: string }) {
    return this.token({
      client_id: a.clientId,
      client_secret: a.clientSecret,
      redirect_uri: a.redirectUri,
      code: a.code,
      grant_type: 'authorization_code',
    });
  }
  async accessToken(a: { clientId: string; clientSecret: string; refreshToken: string }) {
    return (
      await this.token({
        client_id: a.clientId,
        client_secret: a.clientSecret,
        refresh_token: a.refreshToken,
        grant_type: 'refresh_token',
      })
    ).access_token;
  }
  async revoke(token: string) {
    await this.fetchImpl('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }

  async accounts(accessToken: string): Promise<{ id: string; name: string }[]> {
    const r = await this.json<{
      accounts?: { name?: string; accountId?: string; accountName?: string }[];
    }>(`${API}/accounts/v1/accounts?pageSize=250`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return (r.accounts ?? [])
      .map((a) => ({
        id: a.accountId ?? a.name?.split('/').pop() ?? '',
        name: a.accountName ?? a.accountId ?? a.name ?? '',
      }))
      .filter((a) => a.id);
  }

  async products(accessToken: string, accountId: string, pageToken?: string) {
    const q = new URLSearchParams({ pageSize: '250', ...(pageToken && { pageToken }) });
    const r = await this.json<{ products?: MerchantProduct[]; nextPageToken?: string }>(
      `${API}/products/v1/accounts/${encodeURIComponent(accountId)}/products?${q}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    return { products: r.products ?? [], next: r.nextPageToken ?? null };
  }
}
