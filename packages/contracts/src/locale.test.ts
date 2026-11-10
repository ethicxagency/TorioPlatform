import { describe, expect, it } from 'vitest';
import {
  currencyInfo,
  isIsoCurrency,
  isoCurrencyCodes,
  isTimeZone,
  timeZoneOffset,
  timeZones,
} from './locale';
import { formatCurrency } from './currency';
import { currencySchema, updateWorkspaceSchema } from './index';

describe('locale data', () => {
  it('lists the full IANA zone and ISO 4217 sets', () => {
    expect(timeZones().length).toBeGreaterThan(300);
    for (const z of ['Asia/Dhaka', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'])
      expect(timeZones()).toContain(z);
    expect(isoCurrencyCodes().length).toBeGreaterThan(100);
    for (const c of ['BDT', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'MYR', 'INR', 'SGD'])
      expect(isIsoCurrency(c)).toBe(true);
    expect(isIsoCurrency('XXL')).toBe(false);
  });
  it('describes currencies', () => {
    expect(currencyInfo('USD')).toMatchObject({ name: 'US Dollar', symbol: '$', minorDigits: 2 });
    expect(currencyInfo('BDT').symbol).toBe('৳');
    expect(currencyInfo('JPY').minorDigits).toBe(0);
    expect(currencyInfo('KWD').minorDigits).toBe(3);
  });
  it('shows DST-aware offsets', () => {
    expect(timeZoneOffset('Asia/Dhaka')).toBe('UTC+6');
    expect(timeZoneOffset('Asia/Kolkata')).toBe('UTC+5:30');
    expect(timeZoneOffset('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('UTC-5');
    expect(timeZoneOffset('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe('UTC-4');
    expect(isTimeZone('Mars/Base')).toBe(false);
  });
  it('formats other ISO currencies with their own decimals, never a guessed scale', () => {
    expect(formatCurrency(1500, 'JPY')).toContain('1,500');
    expect(formatCurrency(12345, 'KWD')).toContain('12.345');
  });
  it('validates workspace currency and time zone on the server schema', () => {
    expect(
      updateWorkspaceSchema.safeParse({ defaultCurrency: 'SAR', reportingTimeZone: 'Asia/Dubai' })
        .success,
    ).toBe(true);
    expect(updateWorkspaceSchema.safeParse({ defaultCurrency: 'ZZZ' }).success).toBe(false);
    expect(updateWorkspaceSchema.safeParse({ reportingTimeZone: 'Nope/Zone' }).success).toBe(false);
    expect(currencySchema.safeParse('USD').success).toBe(true);
    expect(currencySchema.safeParse('JPY').success).toBe(false);
  });
});
