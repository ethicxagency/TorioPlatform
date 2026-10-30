import { describe, expect, it } from 'vitest';
import { applyCustomerMapping, guessCustomerMapping } from './csv';

describe('customer import mapping', () => {
  it('guesses columns by header alias', () => {
    const m = guessCustomerMapping(['Customer', 'E-mail', 'Mobile', 'Extra']);
    expect([m.name, m.email, m.phone, m.company]).toEqual([0, 1, 2, -1]);
  });
  it('maps rows, skipping unmapped fields', () => {
    expect(
      applyCustomerMapping([['Ann', 'a@b.co']], guessCustomerMapping(['name', 'email'])),
    ).toEqual([{ name: 'Ann', email: 'a@b.co' }]);
  });
});
