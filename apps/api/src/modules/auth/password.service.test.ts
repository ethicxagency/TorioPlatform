import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const h = await svc.hash('CorrectHorse9Battery');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await svc.verify(h, 'CorrectHorse9Battery')).toBe(true);
    expect(await svc.verify(h, 'wrong')).toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    expect(await svc.verify('not-a-hash', 'x')).toBe(false);
  });
});
