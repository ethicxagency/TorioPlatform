import { describe, expect, it } from 'vitest';
import { signState, verifyState } from './signed-state';

describe('signed state', () => {
  it('round-trips for the right secret, and rejects tampering, another secret and expiry', () => {
    const s = signState({ w: 'ws', u: 'user' }, 'secret-secret');
    expect(verifyState(s, 'secret-secret')).toMatchObject({ w: 'ws', u: 'user' });
    expect(verifyState(s, 'other-secret')).toBeNull();
    const [body, sig] = s.split('.');
    const forged = Buffer.from(
      JSON.stringify({ w: 'victim', u: 'user', n: 'x', e: Date.now() + 1e6 }),
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, 'secret-secret')).toBeNull();
    expect(verifyState(`${body}.`, 'secret-secret')).toBeNull();
    expect(verifyState('garbage', 'secret-secret')).toBeNull();
    expect(
      verifyState(
        signState({ w: 'a', u: 'b' }, 'k-k-k-k-k-k', 1000, Date.now() - 5000),
        'k-k-k-k-k-k',
      ),
    ).toBeNull();
  });
});
