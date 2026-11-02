# Currency

## Model

- Every amount is stored as **integer minor units** next to an **ISO 4217 code** (`Order.currency`,
  `Invoice.currency`, `Subscription.currency`, `PlanDefinition.currency`). No float arithmetic is used for money;
  division happens only when formatting for display.
- Records keep the currency they were created in. Nothing is converted, and an old USD record is never re-read as BDT.
- `packages/contracts/src/currency.ts` is the single configuration and formatter:
  - `CURRENCY_DEFS` — code, symbol, name, locale, digit grouping, minor digits, decimal rule, `enabled`.
  - `DEFAULT_CURRENCY = 'BDT'`; `ENABLED_CURRENCIES = ['BDT']` (USD is configured but disabled).
  - `formatCurrency(minor, code, { compact?, decimals?, display? })` — `৳1,500`, `৳1,50,000`, `৳1,500.50`, `$25.00`,
    `-৳1,500`, `—` for null. Unknown codes on historical records fall back to Intl formatting with their own symbol.
  - `formatMoney` (existing callers) is the same function.
- Taka uses South Asian grouping (`1,50,000`). Grouping is computed with `en-IN` because not every runtime's ICU data
  groups `en-BD` that way; the currency's locale is still recorded as `en-BD`.
- The invoice PDF font is ASCII-only, so PDFs write the code (`BDT 1,50,000`) instead of `৳`.

## What the customer sees now

- New orders, the workspace default currency and dashboard fallbacks use BDT. Only enabled currencies can be picked.
- Existing data is shown in its stored currency. In the local demo database the 6 seeded orders are USD and keep
  showing `$`; a freshly seeded database creates BDT demo orders.
- Lead deal values have no currency column; they are whole units of the workspace currency and were always shown
  as ৳, so they now go through the formatter as BDT. Adding `Lead.dealCurrency` is the step if leads ever need
  per-record currency.

## Needs a decision (not changed)

- **Plan prices are BDT placeholders**: Starter ৳1,500, Growth ৳4,500, Scale ৳12,000 a month (yearly = 10 months),
  still marked `placeholderPricing`. They replaced the earlier USD placeholders and are not a conversion of them. Set
  final prices in Super Admin → Plans with matching Stripe price ids before selling.
- **Payments**: amounts are always the Stripe price. Whether your Stripe account can settle BDT depends on the account's
  country and Stripe's supported currencies; this was not verified, and Torio does not fake BDT processing.

## Enabling USD later

Set `CURRENCY_DEFS.USD.enabled = true`. Pickers (order currency, workspace default) then offer it automatically. A
visible currency switcher, per-workspace billing currency and exchange-rate handling are not built; conversion must be
an explicit, recorded process, never automatic.
