import { COUNTRY_CODES, DEFAULT_CURRENCY, DIAL_CODES, type CurrencyCode } from '@torio/contracts';

/** Country names from the runtime's own data, in the person's language. */
export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const countryOptions = (locale = 'en') =>
  COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c, locale) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

export const dialOptions = (locale = 'en') =>
  DIAL_CODES.map((d) => ({
    value: d.code,
    label: `${countryName(d.code, locale)} (+${d.dial})`,
    detail: `+${d.dial}`,
    keywords: `${d.code} ${d.dial}`,
  }));

export const dialFor = (country: string) =>
  DIAL_CODES.find((d) => d.code === country)?.dial ?? null;

/** A starting guess only; Torio prices orders in BDT and USD today, and the person can change it. */
const CURRENCY_BY_COUNTRY: Record<string, CurrencyCode> = { BD: 'BDT', US: 'USD' };
export const currencyGuess = (country: string): string =>
  CURRENCY_BY_COUNTRY[country] ?? DEFAULT_CURRENCY;

/** The browser's region ("en-BD" → BD) when it names one we offer, else ''. */
export function localeCountry(): string {
  try {
    const r = new Intl.Locale(navigator.language).region;
    return r && (COUNTRY_CODES as string[]).includes(r) ? r : '';
  } catch {
    return '';
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "Digonto Store" → "digonto-store". */
export const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** Countries with a single main time zone; others fall back to the browser's. A suggestion only. */
const TZ_BY_COUNTRY: Record<string, string> = {
  BD: 'Asia/Dhaka',
  IN: 'Asia/Kolkata',
  PK: 'Asia/Karachi',
  LK: 'Asia/Colombo',
  NP: 'Asia/Kathmandu',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  QA: 'Asia/Qatar',
  KW: 'Asia/Kuwait',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  NL: 'Europe/Amsterdam',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  TR: 'Europe/Istanbul',
  EG: 'Africa/Cairo',
  NG: 'Africa/Lagos',
  KE: 'Africa/Nairobi',
};
export const timeZoneGuess = (country: string): string =>
  TZ_BY_COUNTRY[country] ?? browserTimeZone();

/** "+8801712345678" → { dial: 'BD', national: '1712345678' } using the longest matching calling code. */
export function splitPhone(e164: string | null | undefined): { dial: string; national: string } {
  const digits = (e164 ?? '').replace(/[^\d]/g, '');
  if (!digits) return { dial: '', national: '' };
  const hit = [...DIAL_CODES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((d) => digits.startsWith(d.dial));
  return hit
    ? { dial: hit.code, national: digits.slice(hit.dial.length) }
    : { dial: '', national: digits };
}

/** Dial selector value + national digits → E.164 (or null when empty). */
export function joinPhone(dialCountry: string, national: string): string | null {
  const digits = national.replace(/[^\d]/g, '').replace(/^0+/, '');
  if (!digits) return null;
  const dial = dialFor(dialCountry);
  return `+${dial ?? ''}${digits}`;
}
