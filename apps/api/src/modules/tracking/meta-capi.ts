import { createHash } from 'node:crypto';

export type ActionSource = 'website' | 'system_generated' | 'chat' | 'email' | 'other';

/** What the caller knows about the person. Raw values only live in memory: they are hashed before anything is stored or sent. */
export interface CapiUser {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Meta's browser cookie and click id, when the browser supplied them. */
  fbp?: string | null;
  fbc?: string | null;
}
export interface CapiEvent {
  eventName: string;
  /** Identifies the real-world occurrence. The same id from the browser Pixel makes Meta count it once. */
  eventId: string;
  eventTime: Date;
  actionSource: ActionSource;
  sourceUrl?: string;
  user?: CapiUser;
  custom?: {
    value?: number;
    currency?: string;
    orderId?: string;
    contentIds?: string[];
    contentName?: string;
  };
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
/** Meta wants lower-cased, trimmed values hashed with SHA-256; phone numbers as digits only. */
export const hashEmail = (e: string) => sha(e.trim().toLowerCase());
export const hashPhone = (p: string) => sha(p.replace(/\D/g, ''));
export const hashId = (v: string) => sha(v.trim().toLowerCase());

/**
 * The event in the Conversions API's data format. Identifiers are hashed here; the browser identifiers (ip, user agent, fbp, fbc)
 * are sent as Meta requires them, unhashed, and only when the caller has them. Nothing else about the person is included.
 */
export function buildCapiEvent(e: CapiEvent): Record<string, unknown> {
  const u = e.user ?? {};
  const userData: Record<string, unknown> = {};
  if (u.email) userData.em = [hashEmail(u.email)];
  if (u.phone && u.phone.replace(/\D/g, '').length >= 6) userData.ph = [hashPhone(u.phone)];
  if (u.externalId) userData.external_id = [hashId(u.externalId)];
  if (u.ip) userData.client_ip_address = u.ip;
  if (u.userAgent) userData.client_user_agent = u.userAgent.slice(0, 400);
  if (u.fbp) userData.fbp = u.fbp;
  if (u.fbc) userData.fbc = u.fbc;
  const c = e.custom;
  const customData: Record<string, unknown> = {};
  if (c?.value !== undefined) customData.value = c.value;
  if (c?.currency) customData.currency = c.currency.toUpperCase();
  if (c?.orderId) customData.order_id = c.orderId;
  if (c?.contentIds?.length) customData.content_ids = c.contentIds;
  if (c?.contentName) customData.content_name = c.contentName;
  return {
    event_name: e.eventName,
    event_time: Math.floor(e.eventTime.getTime() / 1000),
    event_id: e.eventId,
    action_source: e.actionSource,
    ...(e.sourceUrl ? { event_source_url: e.sourceUrl } : {}),
    user_data: userData,
    ...(Object.keys(customData).length ? { custom_data: customData } : {}),
  };
}

/** Meta accepts events up to seven days old. */
export const MAX_EVENT_AGE_MS = 7 * 86_400_000;

export interface SendResult {
  outcome: 'sent' | 'retry' | 'dead';
  message: string | null;
}

/** Sends one stored event. 2xx with at least one event received is sent; 429, 5xx and network errors can be retried; other 4xx never will be. */
export async function sendCapi(
  f: typeof fetch,
  graphVersion: string,
  pixelId: string,
  token: string,
  item: Record<string, unknown>,
  testEventCode?: string,
): Promise<SendResult> {
  let r: Response;
  try {
    r = await f(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pixelId)}/events`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          data: [item],
          ...(testEventCode ? { test_event_code: testEventCode } : {}),
        }),
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      },
    );
  } catch {
    return { outcome: 'retry', message: 'Meta could not be reached' };
  }
  const body = (await r.json().catch(() => ({}))) as {
    events_received?: number;
    error?: { message?: string; code?: number };
  };
  if (r.ok) {
    return Number(body.events_received ?? 0) > 0
      ? { outcome: 'sent', message: null }
      : { outcome: 'retry', message: 'Meta reported no events received' };
  }
  const why = `Meta refused it (HTTP ${r.status}${body.error?.code ? `, code ${body.error.code}` : ''}): ${String(body.error?.message ?? '').slice(0, 160)}`;
  return r.status === 429 || r.status >= 500
    ? { outcome: 'retry', message: why }
    : { outcome: 'dead', message: why };
}
