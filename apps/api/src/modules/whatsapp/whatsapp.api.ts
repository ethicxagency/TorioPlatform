import { createHmac, timingSafeEqual } from 'node:crypto';

/** `X-Hub-Signature-256: sha256=<hex>` over the exact raw body, keyed with the Meta app secret. */
export function verifyMetaSignature(raw: Buffer, header: string | undefined, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice(7), 'hex');
  const want = createHmac('sha256', secret).update(raw).digest();
  return given.length === want.length && timingSafeEqual(given, want);
}

export type Fetch = typeof fetch;

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
  }
  /** Meta code 190 = the token is invalid or expired; the channel needs to be reconnected. */
  get tokenExpired() {
    return this.code === 190 || this.status === 401;
  }
  /** Worth retrying later: rate limits (4, 80007, 130429) and provider outages. */
  get transient() {
    return (
      this.status >= 500 ||
      this.status === 429 ||
      [4, 17, 80007, 130429, 131056].includes(this.code ?? 0)
    );
  }
}

/** Minimal WhatsApp Cloud API client. `fetchImpl` is injectable so tests never touch the network. */
export class WhatsAppGraph {
  constructor(
    readonly version: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`https://graph.facebook.com/${this.version}/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
    } & T;
    if (!res.ok)
      throw new GraphError(
        body.error?.message ?? `Graph API error ${res.status}`,
        res.status,
        body.error?.code,
      );
    return body;
  }

  phoneNumber(phoneNumberId: string, token: string) {
    return this.call<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    }>(token, `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  }

  async sendText(phoneNumberId: string, token: string, to: string, body: string) {
    const r = await this.call<{ messages?: { id: string }[] }>(token, `${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    });
    const id = r.messages?.[0]?.id;
    if (!id) throw new GraphError('WhatsApp did not return a message id', 502);
    return id;
  }
}
