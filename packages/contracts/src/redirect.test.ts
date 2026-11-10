import { describe, expect, it } from 'vitest';
import { checkRedirectUri, FACEBOOK_LOGIN_CALLBACK_PATH, META_CALLBACK_PATH } from './meta-admin';

const trusted = { trustedHosts: ['app.example.com'], production: true };

describe('checkRedirectUri', () => {
  it('accepts each flow on its own route only', () => {
    expect(
      checkRedirectUri(`https://app.example.com${META_CALLBACK_PATH}`, META_CALLBACK_PATH, trusted),
    ).toEqual([]);
    expect(
      checkRedirectUri(
        `https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}`,
        FACEBOOK_LOGIN_CALLBACK_PATH,
        trusted,
      ),
    ).toEqual([]);
    // each route is wrong for the other flow
    expect(
      checkRedirectUri(
        `https://app.example.com${META_CALLBACK_PATH}`,
        FACEBOOK_LOGIN_CALLBACK_PATH,
        trusted,
      ).join(),
    ).toMatch(/path must be exactly/);
    expect(
      checkRedirectUri(
        `https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}`,
        META_CALLBACK_PATH,
        trusted,
      ).join(),
    ).toMatch(/path must be exactly/);
  });
  it('refuses other hosts, http, queries, fragments, credentials and junk', () => {
    const f = (u: string) => checkRedirectUri(u, FACEBOOK_LOGIN_CALLBACK_PATH, trusted);
    expect(f(`https://evil.example.org${FACEBOOK_LOGIN_CALLBACK_PATH}`).join()).toMatch(/trusted/);
    expect(f(`http://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}`).join()).toMatch(/HTTPS/);
    expect(f(`https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}?next=x`).join()).toMatch(
      /query/,
    );
    expect(f(`https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}#x`).join()).toMatch(
      /fragment/,
    );
    expect(f(`https://u:p@app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}`).join()).toMatch(
      /Credentials/,
    );
    expect(f(`https://app.example.com.evil.org${FACEBOOK_LOGIN_CALLBACK_PATH}`).join()).toMatch(
      /trusted/,
    );
    expect(f('not a url')).toEqual(['Not a valid URL.']);
  });
  it('allows plain http on localhost only outside production', () => {
    const u = `http://localhost:4000${FACEBOOK_LOGIN_CALLBACK_PATH}`;
    expect(
      checkRedirectUri(u, FACEBOOK_LOGIN_CALLBACK_PATH, { trustedHosts: [], production: false }),
    ).toEqual([]);
    expect(
      checkRedirectUri(u, FACEBOOK_LOGIN_CALLBACK_PATH, {
        trustedHosts: [],
        production: true,
      }).join(),
    ).toMatch(/HTTPS/);
  });
  it('tolerates one trailing slash but is otherwise exact', () => {
    expect(
      checkRedirectUri(
        `https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}/`,
        FACEBOOK_LOGIN_CALLBACK_PATH,
        trusted,
      ),
    ).toEqual([]);
    expect(
      checkRedirectUri(
        `https://app.example.com${FACEBOOK_LOGIN_CALLBACK_PATH}/x`,
        FACEBOOK_LOGIN_CALLBACK_PATH,
        trusted,
      ).length,
    ).toBeGreaterThan(0);
  });
});
