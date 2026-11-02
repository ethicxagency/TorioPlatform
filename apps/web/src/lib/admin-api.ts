import { env } from './env';

/**
 * Super Admin requests. Authentication is an HttpOnly session cookie set by the API (never readable by scripts).
 * State-changing calls add a header that browsers can't send cross-site without a CORS preflight.
 */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setAdminUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function adminRequest<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const method = opts.method ?? 'GET';
  const qs = new URLSearchParams(
    Object.entries(opts.query ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/admin${path}${qs ? `?${qs}` : ''}`, {
      method,
      credentials: 'include',
      headers: {
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { 'X-Torio-Admin': '1' }),
      },
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    });
  } catch {
    throw new AdminApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string; details?: { path: string; message: string }[] };
  } | null;
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
  if (!res.ok)
    throw new AdminApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.details ?? [],
    );
  return json as T;
}
