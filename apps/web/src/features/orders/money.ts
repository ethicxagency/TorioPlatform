import { formatMoney } from '@torio/contracts';

export { formatMoney };

/** Parses a user-typed amount in major units ("1,250.5") into integer minor units, or null when invalid. */
export function parseMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Integer minor units to an editable major-units string ("12.50"). */
export const toMajor = (minor: number) => (minor / 100).toFixed(2);

export const moneyList = (rows: { currency: string; amountMinor: number }[]) =>
  rows.map((r) => formatMoney(r.amountMinor, r.currency)).join(' · ');
