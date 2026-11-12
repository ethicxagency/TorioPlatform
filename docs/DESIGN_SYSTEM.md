# Design system

Tokens live in `apps/web/src/app/globals.css` under `@theme` (Tailwind v4), so each is both a CSS variable and a
utility (`bg-primary`, `text-muted`, `border-line`, …). Inter (self-hosted via `@fontsource-variable/inter`) with
Geist/system fallback. Icons: Lucide for new UI; the dashboard shell uses the original inline SVG paths to match the design exactly.

| Token                                        | Value                     | Use                          |
| -------------------------------------------- | ------------------------- | ---------------------------- |
| `--color-primary`                            | `#5B5CE2`                 | Primary indigo, links, CTAs  |
| `--color-primary-hover`                      | `#4F50D1`                 | Hover / active nav text      |
| `--color-primary-soft`                       | `#F0F0FF`                 | Soft indigo fills            |
| `--color-canvas`                             | `#F7F8FA`                 | App background               |
| `--color-surface`                            | `#FFFFFF`                 | Cards                        |
| `--color-ink`                                | `#17181C`                 | Primary text                 |
| `--color-muted`                              | `#62656D`                 | Secondary text               |
| `--color-faint`                              | `#8B8E97`                 | Tertiary text, axis labels   |
| `--color-line`                               | `#E5E7EB`                 | Borders                      |
| `--color-line-subtle`                        | `#EEF0F2`                 | Subtle borders, avatar fills |
| `--color-success/danger/warning` (+ `-soft`) | `#16803A/#C53030/#A15C00` | Status and deltas            |

Principles: restrained glass (backdrop blur on top bar, sidebar and popovers only), 12 px card radius, 1 px borders,
minimal shadow (popovers/drawers only), tabular numerals for metrics, visible 2 px indigo focus rings.

Reference implementation: `apps/web/src/features/dashboard` (ported from the "Torio Dashboard" design file) and
`apps/web/src/components/shell`. shadcn/ui is configured (`components.json`, `cn()`, cva `Button`); add components with
`pnpm dlx shadcn@latest add <name>` from `apps/web`.

Placeholder: `components/shell/torio-logo.tsx` is a drawn wordmark; the design referenced `assets/torio-logo.png`, which
was not provided. Swap it in when available.

## AI visual identity

Every AI element uses one shared look, defined once: tokens and animations in `apps/web/src/app/globals.css` ("AI visual
identity") and components in `apps/web/src/components/ui/ai.tsx`.

| Component | Use |
|---|---|
| `AIButton` `variant="primary"` | Main AI actions (AI Assist, Test AI): animated gradient, white text, soft glow |
| `AIButton` `variant="secondary"` | Smaller AI actions in forms, menus and toolbars: light gradient, gradient border and icon |
| `AIIcon` / `AISparkle` | The gradient sparkle; `spin` only while AI work is really running; `AISparkle` fits icon slots (tabs) |
| `AIBadge` | Pill that marks AI-generated content or an AI-powered feature |
| `AIProcessingIndicator` | "Thinking…" / "Generating…" / "Analyzing…" with an optional gradient bar, only while work is running |
| `AIGradientBorder` | A gradient hairline around one element; never whole pages |

- The gradient is indigo → violet → purple (`--ai-1..3`), slightly deeper than a pure pastel so white text stays above 5:1.
- Motion is slow and cheap: a highlight sweep every 7 s (idle), a background drift on hover or while pressed, ≤ 220 ms
  transitions. `prefers-reduced-motion` removes all of it. Disabled AI buttons lose animation and glow.
- Buttons take real state from the caller: `loading` (busy, not clickable), `success`, `disabled`. Nothing fakes progress.
- Ordinary buttons, navigation and standard actions are not changed, and the WhatsApp/Instagram/Messenger colours are untouched.
- Where it is used today: Inbox → AI Assist (composer), the AI Assist panel and customer AI summary placeholder, Brain → Test AI
  button, tab, test notice and playground. The Playground's "Applying your rules…" uses the processing indicator because that
  state is real. There is no AI Reply, Rewrite, Translate or Generate feature in the product yet, so none was styled.
