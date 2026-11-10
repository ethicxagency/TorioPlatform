/**
 * Locale metadata shared by the API (validation) and the web app (pickers, formatting): the complete IANA time zone
 * list and the complete ISO 4217 currency list, both read from the platform's ICU data, never hand-maintained.
 */

type IntlWithValues = typeof Intl & { supportedValuesOf?: (key: string) => string[] };

let zones: string[] | null = null;
/** Every IANA time zone the runtime supports (plus UTC), sorted. */
export function timeZones(): string[] {
  if (zones) return zones;
  let list: string[] = [];
  try {
    list = (Intl as IntlWithValues).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    list = [];
  }
  zones = list.includes('UTC') ? list : ['UTC', ...list];
  return zones;
}

export function isTimeZone(v: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/** "UTC+6", "UTC-5", "UTC+5:30" for a zone at a moment (DST-aware: pass the date you are showing). */
export function timeZoneOffset(zone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part ?? '');
    if (!m) return 'UTC';
    const mins = m[3] && m[3] !== '00' ? `:${m[3]}` : '';
    return `UTC${m[1]}${Number(m[2])}${mins}`;
  } catch {
    return '';
  }
}

export interface CurrencyInfo {
  code: string;
  name: string;
  /** Short symbol where one exists ("$", "৳", "S$"); otherwise the code. */
  symbol: string;
  /** Digits after the decimal point in ISO 4217 (JPY 0, USD 2, KWD 3). */
  minorDigits: number;
}

let codes: string[] | null = null;
/** Every ISO 4217 code the runtime knows. */
export function isoCurrencyCodes(): string[] {
  if (codes) return codes;
  let list: string[] = [];
  try {
    list = (Intl as IntlWithValues).supportedValuesOf?.('currency') ?? [];
  } catch {
    list = [];
  }
  codes = list.filter((c) => /^[A-Z]{3}$/.test(c));
  return codes;
}

export const isIsoCurrency = (code: string): boolean => isoCurrencyCodes().includes(code);

const infoCache = new Map<string, CurrencyInfo>();
export function currencyInfo(code: string): CurrencyInfo {
  const hit = infoCache.get(code);
  if (hit) return hit;
  let name = code;
  let symbol = code;
  let minorDigits = 2;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    /* keep the code */
  }
  try {
    const nf = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    });
    symbol = nf.formatToParts(1).find((p) => p.type === 'currency')?.value ?? code;
    minorDigits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    /* keep defaults */
  }
  const info = { code, name, symbol, minorDigits };
  infoCache.set(code, info);
  return info;
}
