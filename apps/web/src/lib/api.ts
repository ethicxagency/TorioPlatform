import { createApiClient, type ApiSchemas } from '@torio/api-client';
import { env } from './env';

/**
 * The access token lives only in module memory (never localStorage). The refresh
 * token is an HttpOnly cookie managed by the API, so a page reload re-authenticates
 * through POST /auth/refresh.
 */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

export const api = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getAccessToken: () => accessToken,
});

type AuthResponse = ApiSchemas['AuthResponseDto'];

// Refresh tokens are single-use. Concurrent callers (strict-mode remounts, parallel 401s,
// the socket) must share ONE in-flight call or the second would replay a rotated token.
let inflight: Promise<AuthResponse | null> | null = null;
export function refreshSession(): Promise<AuthResponse | null> {
  inflight ??= api
    .POST('/api/v1/auth/refresh', { body: {} })
    .then((r) => {
      if (r.data) setAccessToken(r.data.accessToken);
      return r.data ?? null;
    })
    .catch(() => null)
    .finally(() => {
      setTimeout(() => (inflight = null), 0);
    });
  return inflight;
}

let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn;
};

// Transparent access-token renewal: on a 401 from a protected endpoint, refresh once and retry.
const pristine = new WeakMap<Request, Request>();
api.use({
  onRequest({ request }) {
    pristine.set(request, request.clone());
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401 || new URL(request.url).pathname.includes('/auth/'))
      return undefined;
    const original = pristine.get(request);
    const session = await refreshSession();
    if (!session || !original) {
      onSessionLost?.();
      return undefined;
    }
    const retry = new Request(original, { headers: new Headers(original.headers) });
    retry.headers.set('Authorization', `Bearer ${session.accessToken}`);
    return fetch(retry);
  },
});
