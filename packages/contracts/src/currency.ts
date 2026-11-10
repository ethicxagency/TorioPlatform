import { currencyInfo } from './locale';

/**
 * The single currency configuration for Torio. Every amount shown anywhere goes through `formatCurrency`, and every
 * amount is stored as integer minor units next to an ISO 4217 code, so adding a currency means adding an entry here
 * (and enabling it), never touching stored data.
 *
 * Only enabled currencies can be chosen in the customer UI. Others still format correctly, because historical records
 * keep the currency they were created in (an old USD order stays USD; it is never re-read as BDT).
 */
export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
  /** BCP 47 locale the currency belongs to. */
  locale: string;
  /**
   * Locale used for digit grouping. Taka is grouped the South Asian way (1,50,000); not every runtime's ICU data
   * does that for en-BD, so grouping uses en-IN, which does it consistently in Node and browsers.
   */
  numberLocale: string;
  /** Digits in the minor unit (100 paisa = 1 taka). Amounts are stored in minor units. */
  minorDigits: number;
  /** 'auto' hides ".00" on whole amounts (৳1,500); 'always' keeps it ($25.00). */
  decimals: 'auto' | 'always';
  /** Selectable in the customer UI. */
  enabled: boolean;
}

export const CURRENCY_DEFS = {
  BDT: {
    code: 'BDT',
    symbol: '৳',
    name: 'Bangladeshi Taka',
    locale: 'en-BD',
    numberLocale: 'en-IN',
    minorDigits: 2,
    decimals: 'auto',
    enabled: true,
  },
  // Ready for a later phase: flip `enabled` to offer it.
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    numberLocale: 'en-US',
    minorDigits: 2,
    decimals: 'always',
    enabled: false,
  },
} as const satisfies Record<string, CurrencyDef>;

export type CurrencyCode = keyof typeof CURRENCY_DEFS;
export const DEFAULT_CURRENCY: CurrencyCode = 'BDT';
export const ENABLED_CURRENCIES = (Object.values(CURRENCY_DEFS) as CurrencyDef[])
  .filter((c) => c.enabled)
  .map((c) => c.code as CurrencyCode);

export const currencyDef = (code: string | null | undefined): CurrencyDef | null =>
  code && code.toUpperCase() in CURRENCY_DEFS
    ? CURRENCY_DEFS[code.toUpperCase() as CurrencyCode]
    : null;

export interface FormatOptions {
  /** Short form for axes and tight spaces: ৳1.5L, $4.2K. */
  compact?: boolean;
  decimals?: 'auto' | 'always' | 'none';
  /** 'code' writes "BDT 1,500" for outputs that can't draw the symbol (e.g. ASCII-only PDF fonts). */
  display?: 'symbol' | 'code';
}

/**
 * Formats integer minor units. `null`/`undefined` render as an em dash so a missing amount is never shown as zero.
 * Unknown ISO codes (e.g. EUR on an old record) fall back to the platform's Intl formatting, never to a wrong symbol.
 */
export function formatCurrency(
  minor: number | null | undefined,
  code: string | null | undefined = DEFAULT_CURRENCY,
  opts: FormatOptions = {},
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '—';
  const cur = (code || DEFAULT_CURRENCY).toUpperCase();
  const def = currencyDef(cur);
  const scale = 10 ** (def?.minorDigits ?? currencyInfo(cur).minorDigits);
  const major = Math.abs(minor) / scale;
  const sign = minor < 0 ? '-' : '';
  const mark = def ? (opts.display === 'code' ? `${def.code} ` : def.symbol) : '';

  if (!def) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        ...(opts.compact && { notation: 'compact' }),
      }).format(minor / scale);
    } catch {
      return `${sign}${major.toFixed(2)} ${cur}`;
    }
  }

  if (opts.compact) {
    const n = new Intl.NumberFormat(def.numberLocale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(major);
    return `${sign}${mark}${n}`;
  }
  const mode = opts.decimals ?? def.decimals;
  const fraction =
    mode === 'none' ? 0 : mode === 'always' || Math.abs(minor) % scale !== 0 ? def.minorDigits : 0;
  const n = new Intl.NumberFormat(def.numberLocale, {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(major);
  return `${sign}${mark}${n}`;
}

/** For values stored in whole major units (lead deal values, sample data). */
export const formatCurrencyMajor = (
  major: number | null | undefined,
  code: string | null | undefined = DEFAULT_CURRENCY,
  opts?: FormatOptions,
) =>
  formatCurrency(
    major === null || major === undefined
      ? major
      : Math.round(major * 10 ** (currencyDef(code)?.minorDigits ?? 2)),
    code,
    opts,
  );
