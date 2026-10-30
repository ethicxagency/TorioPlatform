import { describe, expect, it } from 'vitest';
import { formatMoney, parseMinor, toMajor } from './money';

describe('money helpers', () => {
  it('parses major-unit input into integer minor units without float drift', () => {
    expect(parseMinor('12.5')).toBe(1250);
    expect(parseMinor('1,250.05')).toBe(125005);
    expect(parseMinor('0.29')).toBe(29);
    expect(parseMinor('19.99')).toBe(1999);
  });
  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1e3', '1.']) expect(parseMinor(bad)).toBeNull();
  });
  it('formats and round-trips', () => {
    expect(formatMoney(125005, 'USD')).toBe('$1,250.05');
    expect(toMajor(1250)).toBe('12.50');
  });
});
