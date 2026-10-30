import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';

export type { components, paths };
export type ApiSchemas = components['schemas'];

export interface ApiClientOptions {
  /** Origin of the Torio API, e.g. http://localhost:4000 (paths already carry the /api/v1 prefix). */
  baseUrl: string;
  /** Returns the in-memory access token, if any. Never persist it to localStorage. */
  getAccessToken?: () => string | null | undefined;
  fetch?: typeof fetch;
}

/**
 * Typed REST client generated from the API's OpenAPI document.
 * Regenerate types with `pnpm api:openapi` after changing API contracts.
 * Requests include credentials so the HttpOnly refresh cookie is sent to /auth/*.
 */
export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    credentials: 'include',
    ...(options.fetch && { fetch: options.fetch }),
  });
  const auth: Middleware = {
    onRequest({ request }) {
      const token = options.getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
