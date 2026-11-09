import { GraphError, type Fetch } from '../whatsapp/whatsapp.api';

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}
export interface MetaPhone {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  status?: string;
  platform_type?: string;
  code_verification_status?: string;
  quality_rating?: string;
}
export interface MetaWaba {
  id: string;
  name?: string;
  phone_numbers?: { data?: MetaPhone[] };
}
export interface MetaBusiness {
  id: string;
  name?: string;
  owned_whatsapp_business_accounts?: { data?: MetaWaba[] };
}

type GraphBody = { error?: { message?: string; code?: number; error_subcode?: number } };

/**
 * Server-side client for the Meta Graph API (OAuth, Pages, Instagram, Messenger send, WhatsApp onboarding).
 * `fetchImpl` is injectable so tests never touch the network. Tokens are passed per call and never logged.
 */
export class MetaGraph {
  constructor(
    readonly version: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call<T>(
    path: string,
    opts: {
      token?: string;
      method?: 'GET' | 'POST' | 'DELETE';
      query?: Record<string, string>;
      body?: object;
    } = {},
  ): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${this.version}/${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const res = await this.fetchImpl(url, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.token && { authorization: `Bearer ${opts.token}` }),
        ...(opts.body && { 'content-type': 'application/json' }),
      },
      ...(opts.body && { body: JSON.stringify(opts.body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as GraphBody & T;
    if (!res.ok)
      throw new GraphError(
        body.error?.message ?? `Graph API error ${res.status}`,
        res.status,
        body.error?.code,
      );
    return body;
  }

  /** Authorization code (from the OAuth redirect or Embedded Signup) to a user access token. */
  exchangeCode(a: { appId: string; appSecret: string; redirectUri?: string; code: string }) {
    return this.call<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      query: {
        client_id: a.appId,
        client_secret: a.appSecret,
        code: a.code,
        ...(a.redirectUri && { redirect_uri: a.redirectUri }),
      },
    });
  }

  /** Swap a short-lived user token for a long-lived one (about 60 days). */
  longLivedUserToken(a: { appId: string; appSecret: string; token: string }) {
    return this.call<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: a.appId,
        client_secret: a.appSecret,
        fb_exchange_token: a.token,
      },
    });
  }

  async grantedPermissions(userToken: string) {
    const r = await this.call<{ data?: { permission: string; status: string }[] }>(
      'me/permissions',
      {
        token: userToken,
      },
    );
    return new Set((r.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission));
  }

  /** Pages the user manages, each with its own Page token and any linked Instagram professional account. */
  async pages(userToken: string): Promise<MetaPage[]> {
    const out: MetaPage[] = [];
    let after: string | undefined;
    for (let i = 0; i < 5; i++) {
      const r = await this.call<{
        data?: MetaPage[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>('me/accounts', {
        token: userToken,
        query: {
          fields:
            'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
          limit: '100',
          ...(after && { after }),
        },
      });
      out.push(...(r.data ?? []));
      after = r.paging?.next ? r.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  /** App-level checks (credentials, subscriptions) use the app access token `{app-id}|{app-secret}`. */
  appInfo(appId: string, appSecret: string) {
    return this.call<{ id: string; name?: string }>(appId, {
      query: { fields: 'id,name', access_token: `${appId}|${appSecret}` },
    });
  }

  /** The webhook subscriptions registered for the app at Meta (object, callback URL, fields). */
  async appSubscriptions(appId: string, appSecret: string) {
    const r = await this.call<{
      data?: {
        object: string;
        callback_url?: string;
        active?: boolean;
        fields?: { name: string }[];
      }[];
    }>(`${appId}/subscriptions`, { query: { access_token: `${appId}|${appSecret}` } });
    return r.data ?? [];
  }

  /** Reachability + API version check without credentials: any answer from Graph (even an auth error) means it's reachable. */
  async ping() {
    try {
      await this.call<object>('app');
      return { status: 200, code: null as number | null };
    } catch (e) {
      if (e instanceof GraphError) return { status: e.status, code: e.code ?? null };
      throw e;
    }
  }

  /** Business portfolios the user can see, with their WhatsApp Business Accounts and phone numbers. */
  async whatsappAccounts(userToken: string): Promise<MetaBusiness[]> {
    const r = await this.call<{ data?: MetaBusiness[] }>('me/businesses', {
      token: userToken,
      query: {
        fields:
          'id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,status,platform_type,code_verification_status,quality_rating}}',
        limit: '50',
      },
    });
    return r.data ?? [];
  }

  /** Current registration/verification state of one WhatsApp number. */
  phoneState(phoneNumberId: string, token: string) {
    return this.call<MetaPhone>(phoneNumberId, {
      token,
      query: {
        fields:
          'id,display_phone_number,verified_name,status,platform_type,code_verification_status,quality_rating',
      },
    });
  }

  subscribePage(pageId: string, pageToken: string, fields: string[]) {
    return this.call<{ success?: boolean }>(`${pageId}/subscribed_apps`, {
      token: pageToken,
      method: 'POST',
      query: { subscribed_fields: fields.join(',') },
    });
  }

  unsubscribePage(pageId: string, pageToken: string) {
    return this.call<{ success?: boolean }>(`${pageId}/subscribed_apps`, {
      token: pageToken,
      method: 'DELETE',
    });
  }

  /** Page name check used as the health probe for Messenger / Instagram channels. */
  page(pageId: string, pageToken: string) {
    return this.call<{ id: string; name?: string }>(pageId, {
      token: pageToken,
      query: { fields: 'id,name' },
    });
  }

  /** Reply inside the standard messaging window (RESPONSE). Works for Messenger and Instagram via the connected Page. */
  async sendText(pageId: string, pageToken: string, recipientId: string, text: string) {
    const r = await this.call<{ message_id?: string }>(`${pageId}/messages`, {
      token: pageToken,
      method: 'POST',
      body: { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } },
    });
    if (!r.message_id) throw new GraphError('Meta did not return a message id', 502);
    return r.message_id;
  }

  profile(userId: string, pageToken: string, fields: string) {
    return this.call<{ name?: string; first_name?: string; last_name?: string; username?: string }>(
      userId,
      { token: pageToken, query: { fields } },
    );
  }

  /** Expiry of a token as Meta sees it (needs the app token). `expires_at` 0 means it does not expire. */
  async tokenInfo(appId: string, appSecret: string, token: string) {
    const r = await this.call<{ data?: { is_valid?: boolean; expires_at?: number } }>(
      'debug_token',
      {
        query: { input_token: token, access_token: `${appId}|${appSecret}` },
      },
    );
    return {
      valid: !!r.data?.is_valid,
      expiresAt: r.data?.expires_at ? new Date(r.data.expires_at * 1000) : null,
    };
  }

  /** WhatsApp Embedded Signup: register the number for the Cloud API. `pin` becomes its two-step verification PIN. */
  registerPhone(phoneNumberId: string, token: string, pin: string) {
    return this.call<{ success?: boolean }>(`${phoneNumberId}/register`, {
      token,
      method: 'POST',
      body: { messaging_product: 'whatsapp', pin },
    });
  }

  /** WhatsApp Embedded Signup: subscribe this app to the customer's WhatsApp Business Account. */
  subscribeWaba(wabaId: string, token: string) {
    return this.call<{ success?: boolean }>(`${wabaId}/subscribed_apps`, { token, method: 'POST' });
  }
}
