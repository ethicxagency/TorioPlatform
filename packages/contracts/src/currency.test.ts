import { describe, expect, it } from 'vitest';
import {
  CURRENCY_DEFS,
  DEFAULT_CURRENCY,
  ENABLED_CURRENCIES,
  formatCurrency,
  formatCurrencyMajor,
} from './currency';
import { formatMoney } from './orders';

describe('currency configuration', () => {
  it('defaults to BDT and only BDT is enabled for customers', () => {
    expect(DEFAULT_CURRENCY).toBe('BDT');
    expect(ENABLED_CURRENCIES).toEqual(['BDT']);
    expect(CURRENCY_DEFS.USD.enabled).toBe(false);
    expect(CURRENCY_DEFS.BDT).toMatchObject({ symbol: '৳', locale: 'en-BD', minorDigits: 2 });
  });
});

describe('formatCurrency', () => {
  it('formats taka with South Asian grouping and no needless decimals', () => {
    expect(formatCurrency(150_000, 'BDT')).toBe('৳1,500');
    expect(formatCurrency(1_250_000, 'BDT')).toBe('৳12,500');
    expect(formatCurrency(15_000_000, 'BDT')).toBe('৳1,50,000');
    expect(formatCurrency(1_234_567_800, 'BDT')).toBe('৳1,23,45,678');
  });
  it('keeps paisa when present', () => {
    expect(formatCurrency(150_050, 'BDT')).toBe('৳1,500.50');
    expect(formatCurrency(5, 'BDT')).toBe('৳0.05');
  });
  it('handles zero, negatives and missing values', () => {
    expect(formatCurrency(0, 'BDT')).toBe('৳0');
    expect(formatCurrency(-150_000, 'BDT')).toBe('-৳1,500');
    expect(formatCurrency(null, 'BDT')).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });
  it('defaults to BDT when no currency is given', () => {
    expect(formatCurrency(150_000)).toBe('৳1,500');
    expect(formatCurrency(150_000, '')).toBe('৳1,500');
  });
  it('formats USD (ready for later) with cents', () => {
    expect(formatCurrency(2_500, 'USD')).toBe('$25.00');
    expect(formatCurrency(3_650_000, 'USD')).toBe('$36,500.00');
    expect(formatCurrency(-2_500, 'usd')).toBe('-$25.00');
  });
  it('keeps the original currency of historical records it has no config for', () => {
    expect(formatCurrency(500, 'EUR')).toBe('€5.00');
    expect(formatCurrency(500, 'XYZ')).toMatch(/5\.00/);
  });
  it('never doubles symbols and supports a compact form', () => {
    expect(formatCurrency(15_000_000, 'BDT', { compact: true })).toBe('৳1.5L');
    expect(formatCurrency(420_000, 'USD', { compact: true })).toBe('$4.2K');
    expect(formatCurrency(150_000, 'BDT').match(/৳/g)).toHaveLength(1);
  });
  it('can write the code instead of the symbol for ASCII-only outputs', () => {
    expect(formatCurrency(15_000_000, 'BDT', { display: 'code' })).toBe('BDT 1,50,000');
    expect(formatCurrency(-2_500, 'USD', { display: 'code' })).toBe('-USD 25.00');
  });
  it('formats whole-unit values', () => {
    expect(formatCurrencyMajor(853_500, 'BDT')).toBe('৳8,53,500');
    expect(formatCurrencyMajor(null)).toBe('—');
  });
  it('formatMoney is the same formatter (one implementation)', () => {
    expect(formatMoney(150_000, 'BDT')).toBe('৳1,500');
    expect(formatMoney(2_500, 'USD')).toBe('$25.00');
  });
});
