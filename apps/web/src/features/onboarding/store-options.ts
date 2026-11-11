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
