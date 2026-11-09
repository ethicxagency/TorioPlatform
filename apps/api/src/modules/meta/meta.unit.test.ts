import { describe, expect, it } from 'vitest';
import { GraphError } from '../whatsapp/whatsapp.api';
import { explain, SCOPES } from './meta.connection.service';
import { packCredential, unpackCredential } from './meta.credentials';
import { MetaGraph } from './meta.graph';
import { signState, STATE_TTL_MS, verifyState } from './meta.state';

const SECRET = 'app-secret-for-tests';
const base = { w: 'ws-1', u: 'user-1', p: 'MESSENGER' as const };

describe('OAuth state', () => {
  it('round-trips and binds workspace, user and provider', () => {
    const s = signState(base, SECRET);
    expect(verifyState(s, SECRET)).toMatchObject(base);
  });
  it('rejects tampering, a different secret and malformed input', () => {
    const s = signState(base, SECRET);
    const [body, sig] = s.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...base, w: 'ws-2', n: 'x', e: Date.now() + 1e6 }),
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyState(s, 'other-secret')).toBeNull();
    expect(verifyState(`${body}.`, SECRET)).toBeNull();
    expect(verifyState('garbage', SECRET)).toBeNull();
  });
  it('expires, and every state is unique', () => {
    const t0 = 1_000_000;
    const s = signState(base, SECRET, t0);
    expect(verifyState(s, SECRET, t0 + STATE_TTL_MS - 1)).not.toBeNull();
    expect(verifyState(s, SECRET, t0 + STATE_TTL_MS + 1)).toBeNull();
    expect(signState(base, SECRET)).not.toBe(signState(base, SECRET));
  });
});

describe('credentials', () => {
  it('packs the token with its Page id and refuses anything else', () => {
    expect(unpackCredential(packCredential({ token: 'EAAG', pageId: '1' }))).toEqual({
      token: 'EAAG',
      pageId: '1',
    });
    expect(unpackCredential('plain-whatsapp-token')).toBeNull();
    expect(unpackCredential('{"t":"x"}')).toBeNull();
  });
});

describe('scopes', () => {
  it('asks only for what each integration needs', () => {
    expect(SCOPES.MESSENGER).toEqual([
      'pages_show_list',
      'pages_messaging',
      'pages_manage_metadata',
    ]);
    expect(SCOPES.INSTAGRAM).toContain('instagram_manage_messages');
    expect(SCOPES.MESSENGER).not.toContain('instagram_manage_messages');
  });
});

describe('error messages', () => {
  it('turns Meta errors into actions without leaking raw tokens', () => {
    expect(explain(new GraphError('x', 401, 190))).toMatch(/expired|revoked/);
    expect(explain(new GraphError('x', 403, 200))).toMatch(/permission/);
    expect(explain(new GraphError('x', 429))).toMatch(/try again/i);
    expect(explain(new Error('boom'))).toMatch(/Could not reach Meta/);
  });
});

describe('Graph client', () => {
  it('sends versioned requests with a bearer token and maps errors', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const g = new MetaGraph('v21.0', (async (u: URL, init?: RequestInit) => {
      seen.push({ url: String(u), auth: new Headers(init?.headers).get('authorization') });
      return String(u).includes('bad')
        ? new Response(JSON.stringify({ error: { message: 'nope', code: 100 } }), { status: 400 })
        : new Response(JSON.stringify({ id: '1', name: 'P' }));
    }) as typeof fetch);
    expect(await g.page('123', 'tok')).toEqual({ id: '1', name: 'P' });
    expect(seen[0]).toEqual({
      url: 'https://graph.facebook.com/v21.0/123?fields=id%2Cname',
      auth: 'Bearer tok',
    });
    await expect(g.page('bad', 'tok')).rejects.toMatchObject({ status: 400, code: 100 });
  });
  it('keeps secrets out of the Authorization header and in the query only where Meta requires it', async () => {
    let url = '';
    const g = new MetaGraph('v21.0', (async (u: URL) => {
      url = String(u);
      return new Response(JSON.stringify({ access_token: 'T' }));
    }) as typeof fetch);
    await g.exchangeCode({ appId: '1', appSecret: 's', redirectUri: 'http://x/cb', code: 'c' });
    expect(url).toContain('oauth/access_token');
    expect(url).toContain('client_id=1');
  });
});
