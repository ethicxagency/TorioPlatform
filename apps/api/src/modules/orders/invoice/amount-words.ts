import { currencyDef } from '@torio/contracts';

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–999 in words ("One Hundred Twenty-Five"). */
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r)
    parts.push(r < 20 ? ONES[r]! : TENS[Math.floor(r / 10)]! + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
}

/**
 * A whole number in English words. `system` picks the grouping people read the amount in: South Asian (Thousand, Lakh,
 * Crore) for taka and rupees, international (Thousand, Million, Billion, Trillion) otherwise.
 */
export function wholeToWords(n: number, system: 'south-asian' | 'international'): string {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError('A non-negative whole number is required');
  if (n === 0) return 'Zero';
  const out: string[] = [];
  if (system === 'south-asian') {
    let rest = n;
    const crore = Math.floor(rest / 10_000_000);
    rest %= 10_000_000;
    const lakh = Math.floor(rest / 100_000);
    rest %= 100_000;
    const thousand = Math.floor(rest / 1000);
    rest %= 1000;
    // Crores may themselves exceed 99 (1,00,00,00,000 = 100 Crore); the number before "Crore" is spoken in full.
    if (crore) out.push(`${wholeToWords(crore, system)} Crore`);
    if (lakh) out.push(`${below1000(lakh)} Lakh`);
    if (thousand) out.push(`${below1000(thousand)} Thousand`);
    if (rest) out.push(below1000(rest));
    return out.join(' ');
  }
  const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  let rest = n;
  let i = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) out.unshift(`${below1000(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ''}`);
    rest = Math.floor(rest / 1000);
    i += 1;
  }
  return out.join(' ');
}

const UNITS: Record<string, { major: [string, string]; minor: [string, string] }> = {
  BDT: { major: ['Taka', 'Taka'], minor: ['Paisa', 'Paisa'] },
  INR: { major: ['Rupee', 'Rupees'], minor: ['Paisa', 'Paise'] },
  USD: { major: ['Dollar', 'Dollars'], minor: ['Cent', 'Cents'] },
  EUR: { major: ['Euro', 'Euros'], minor: ['Cent', 'Cents'] },
  GBP: { major: ['Pound', 'Pounds'], minor: ['Penny', 'Pence'] },
};

/**
 * "Twenty-Four Thousand Five Hundred Taka Only" for an amount in integer minor units. Currencies without known unit names
 * are written with their ISO code ("... 250 JPY Only"), never with a guessed name.
 */
export function amountInWords(minor: number, currency: string): string {
  const code = currency.toUpperCase();
  const def = currencyDef(code);
  const digits = def?.minorDigits ?? 2;
  const scale = 10 ** digits;
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / scale);
  const sub = abs % scale;
  const system = def?.numberLocale === 'en-IN' || code === 'INR' ? 'south-asian' : 'international';
  const u = UNITS[code];
  const unit = (n: number, k: 'major' | 'minor') => {
    if (!u) return k === 'major' ? code : '';
    return u[k][n === 1 ? 0 : 1];
  };
  const parts: string[] = [];
  if (major > 0 || sub === 0) {
    parts.push(
      `${wholeToWords(major, system)}${unit(major, 'major') ? ` ${unit(major, 'major')}` : ''}`,
    );
  }
  if (sub > 0) {
    const label = unit(sub, 'minor');
    parts.push(
      u
        ? `${wholeToWords(sub, system)} ${label}`
        : `${wholeToWords(sub, system)} / ${scale} ${code}`,
    );
  }
  return `${minor < 0 ? 'Minus ' : ''}${parts.join(' and ')} Only`;
}
