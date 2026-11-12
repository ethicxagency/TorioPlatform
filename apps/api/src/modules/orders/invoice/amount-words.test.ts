import { describe, expect, it } from 'vitest';
import { amountInWords, wholeToWords } from './amount-words';

describe('amount in words', () => {
  it('writes taka the South Asian way', () => {
    expect(amountInWords(2_450_000, 'BDT')).toBe('Twenty-Four Thousand Five Hundred Taka Only');
    expect(amountInWords(15_000_000, 'BDT')).toBe('One Lakh Fifty Thousand Taka Only');
    expect(amountInWords(1_000_000_000, 'BDT')).toBe('One Crore Taka Only');
    expect(amountInWords(100, 'BDT')).toBe('One Taka Only');
  });
  it('includes paisa when the amount has them', () => {
    expect(amountInWords(125_050, 'BDT')).toBe(
      'One Thousand Two Hundred Fifty Taka and Fifty Paisa Only',
    );
    expect(amountInWords(5, 'BDT')).toBe('Five Paisa Only');
    expect(amountInWords(0, 'BDT')).toBe('Zero Taka Only');
  });
  it('uses international grouping and unit names for other currencies', () => {
    expect(amountInWords(123_456_789, 'USD')).toBe(
      'One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Dollars and Eighty-Nine Cents Only',
    );
    expect(amountInWords(100, 'USD')).toBe('One Dollar Only');
  });
  it('never guesses unit names for an unknown currency', () => {
    expect(amountInWords(25_000, 'JPY')).toContain('JPY');
  });
  it('handles hundreds and teens', () => {
    expect(wholeToWords(1_115, 'international')).toBe('One Thousand One Hundred Fifteen');
    expect(wholeToWords(100_000, 'south-asian')).toBe('One Lakh');
    expect(wholeToWords(1_00_00_000, 'south-asian')).toBe('One Crore');
  });
});
