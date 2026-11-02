# Torio UI refinement audit

Scope: customer portal (`apps/web/src`), with shared tokens that the Super Admin panel also reads. Measured from
source on 2026-11-01.

## Findings

| Area        | Before                                                                                                                      | Issue                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Card radius | `rounded-card` 12px (64 uses), `rounded-xl` 12px (94), `rounded-[10px]` (94), `rounded-[12px]`/`[14px]`, `rounded-2xl` 16px | Same role drawn with 10/12/14/16px; large panels no rounder than small cards            |
| Controls    | Button `rounded-lg` 8px; Input `rounded-[10px]`                                                                             | Buttons and inputs side by side with different corners; no focus ring on buttons        |
| Weights     | `font-semibold` 264×, `font-medium` 240×, `font-bold` 2× (Inter Variable loaded)                                            | Page titles, card titles and table headers all at 600; inactive labels at 500 read thin |
| Page titles | `text-xl`/`text-2xl`/`[22–30px]` mixed                                                                                      | Inconsistent size and weight across pages                                               |
| Shadows     | one `shadow-popover`, ad-hoc arbitrary shadows                                                                              | No card/hover elevation tokens                                                          |
| Motion      | per-component transitions; no global reduced-motion rule                                                                    | Some animations ignored `prefers-reduced-motion`                                        |

## Changes (shared, so they apply everywhere)

- **Radius scale** (`globals.css` `@theme`): `--radius-lg` 9px (compact rows/menus), `--radius-xl` 14px,
  `--radius-card` 14px (standard cards), new `--radius-panel` 16px (large dashboard panels), `--radius-2xl` 20px
  (dialogs, modals), new `--radius-control` 10px (buttons, inputs). Every existing `rounded-card`, `rounded-xl`,
  `rounded-lg` and `rounded-2xl` picks these up without per-page edits.
- **Weights**: Inter is variable, so the named steps moved: medium 500→520, semibold 600→620, bold 700. Page titles
  (`h1.font-semibold`) render at 680; table headers at 620.
- **Shadows**: `--shadow-card`, `--shadow-card-hover`, refined `--shadow-popover`; `--ease-standard` easing.
- **Button**: control radius, 150 ms colour transitions, visible focus ring, subtle primary shadow, `loading` prop
  (spinner + disabled + `aria-busy`).
- **Input**: control radius, hover border, 3 px soft focus ring, red border when `aria-invalid`.
- **Dashboard**: KPI tabs, chart and breakdown on the card/panel radii; Conversation Overview and Needs Attention on
  `rounded-panel`.
- **Settings cards**: on `rounded-card`.
- **Accessibility**: global `prefers-reduced-motion` rule; balanced heading wrapping.

## Left as is (intentional)

- Component-specific radii that carry meaning (chips `rounded-md`, chart bars, badges).
- Super Admin uses the same tokens; nothing admin-specific changed.
- No new font: Inter Variable already supports the intermediate weights.

## Not verified visually

Every page was not inspected by eye after the token change; the Settings overview and Dashboard were. Remaining
pages are covered by the existing end-to-end suite only.
