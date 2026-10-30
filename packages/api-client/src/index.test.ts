import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

describe('createApiClient', () => {
  it('prefixes /api/v1 and attaches the bearer token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const api = createApiClient({
      baseUrl: 'http://api.test/',
      getAccessToken: () => 'tok',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const { data } = await api.GET('/api/v1/health');
    expect(data?.status).toBe('ok');
    const req = (fetchMock.mock.calls[0] as unknown as [Request])[0];
    expect(req.url).toBe('http://api.test/api/v1/health');
    expect(req.headers.get('authorization')).toBe('Bearer tok');
  });
});
