'use client';

import {
  currencyInfo,
  DEFAULT_CURRENCY,
  isoCurrencyCodes,
  timeZoneOffset,
  timeZones,
} from '@torio/contracts';
import { useMemo } from 'react';
import { SearchSelect, type SearchSelectOption } from '@/features/inbox/components/search-select';

/** Shown first, so the usual choices need no typing. */
const PINNED = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'MYR', 'SGD'];
const rank = (c: string) => {
  const i = PINNED.indexOf(c);
  return i === -1 ? PINNED.length : i;
};

const zoneLabel = (z: string) => z.replace(/_/g, ' ');

/** Searchable list of every IANA time zone, each with its current UTC offset. */
export function TimeZoneSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo<SearchSelectOption[]>(() => {
    const now = new Date();
    const list = timeZones().map((z) => {
      const offset = timeZoneOffset(z, now);
      // Matches "dhaka", "Kuala_Lumpur", "utc+6", "asia".
      return { value: z, label: zoneLabel(z), detail: offset, keywords: `${z} ${offset}` };
    });
    return list.some((o) => o.value === value)
      ? list
      : [{ value, label: zoneLabel(value), detail: timeZoneOffset(value, now) }, ...list];
  }, [value]);
  return (
    <SearchSelect
      id={id}
      label="Time Zone"
      hideLabel
      disabled={disabled}
      searchPlaceholder="Search city, region or UTC offset"
      emptyText="No time zones available."
      options={options}
      value={value}
      onChange={onChange}
      limit={60}
    />
  );
}

/**
 * Searchable list of every ISO 4217 currency: code, name and symbol. Currencies that are not written in
 * hundredths (JPY, KWD, …) are listed but can't be chosen yet, because order maths is in two-decimal units.
 */
export function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo<SearchSelectOption[]>(() => {
    const codes = isoCurrencyCodes();
    const all = (codes.includes(value) || !value ? codes : [value, ...codes]).map((code) => {
      const c = currencyInfo(code);
      const unsupported = c.minorDigits !== 2;
      return {
        value: code,
        label: `${code} — ${c.name}`,
        detail: c.symbol !== code ? c.symbol : undefined,
        keywords: `${c.name} ${c.symbol}`,
        disabled: unsupported && code !== value,
        hint: unsupported ? 'Orders can’t be priced in this currency yet' : undefined,
      } satisfies SearchSelectOption;
    });
    return all.sort((a, b) => rank(a.value) - rank(b.value) || a.value.localeCompare(b.value));
  }, [value]);
  return (
    <SearchSelect
      id={id}
      label="Currency"
      hideLabel
      disabled={disabled}
      searchPlaceholder="Search by name, code or symbol"
      emptyText="No currencies available."
      options={options}
      value={value || DEFAULT_CURRENCY}
      onChange={onChange}
      limit={60}
    />
  );
}
