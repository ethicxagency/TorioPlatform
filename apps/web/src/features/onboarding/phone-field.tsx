'use client';

import { controlCls } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/features/inbox/components/search-select';

/**
 * The shared international phone field: a searchable country-code selector beside the national number. The selector shows
 * the flag, the country name and its dialing code in full (`Bangladesh (+880)`), and the number gets all the remaining
 * width. On narrow screens the two stack, each full width. The value stays split (country + national digits) so callers
 * build the E.164 number with `joinPhone` exactly as before.
 */
export function PhoneField({
  id,
  codeLabel,
  options,
  dial,
  onDial,
  national,
  onNational,
  autoComplete,
  invalid,
}: {
  id: string;
  codeLabel: string;
  options: SearchSelectOption[];
  dial: string;
  onDial: (country: string) => void;
  national: string;
  onNational: (digits: string) => void;
  autoComplete: string;
  invalid?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
      <SearchSelect
        label={codeLabel}
        hideLabel
        searchPlaceholder="Search country or code"
        emptyText="No codes."
        options={options}
        value={dial}
        onChange={onDial}
        anyLabel="Select country"
        limit={80}
      />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        className={controlCls}
        autoComplete={autoComplete}
        placeholder="1712 345678"
        value={national}
        aria-invalid={invalid || undefined}
        onChange={(e) => onNational(e.target.value)}
      />
    </div>
  );
}
