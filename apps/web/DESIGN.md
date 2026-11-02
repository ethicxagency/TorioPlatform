---
version: alpha
name: Torio
description: Torio's customer-portal design language, adapted from the Stripe-style reference in /DESIGN-stripe.md. Deep navy ink on white and cool off-white surfaces, Torio indigo (#5B5CE2) as the single action colour, pill-shaped buttons, light-weight display type with negative tracking, tabular figures wherever money or counts appear, and soft blue-tinted elevation. Operate-mode product UI first; the atmospheric mesh is reserved for brand moments such as sign-in.

colors:
  primary: '#5b5ce2'
  primary-hover: '#4f50d1'
  primary-press: '#3f40b8'
  primary-soft: '#f0f0ff'
  primary-tint: '#f7f7ff'
  ink: '#0d253d'
  ink-secondary: '#273951'
  muted: '#5a6a82'
  faint: '#66778e'
  canvas: '#f6f9fc'
  surface: '#ffffff'
  line: '#e3e8ee'
  line-subtle: '#edf1f5'
  line-input: '#c4d3e3'
  wash: '#f4f6fa'
  success: '#16803a'
  warning: '#a15c00'
  danger: '#c53030'

typography:
  font: 'Inter Variable (cv11 single-storey a; tabular figures for numbers)'
  page-title:
    { size: 26px, weight: 700, lineHeight: 1.2, letterSpacing: -0.02em, utility: font-page-title }
  section-title:
    {
      size: 17px,
      weight: 650,
      lineHeight: 1.3,
      letterSpacing: -0.01em,
      utility: font-section-title,
    }
  card-title: { size: 15px, weight: 600, lineHeight: 1.35, utility: font-card-title }
  metric: { weight: 700, letterSpacing: -0.02em, numerals: tabular, utility: font-metric }
  label: { size: 13px, weight: 560, utility: font-label }
  body: { size: 14px, weight: 400, lineHeight: 1.55, utility: font-body }
  caption: { size: 12.5px, weight: 400, utility: font-caption }
  metadata: { size: 12px, weight: 400, colour: faint, numerals: tabular, utility: font-metadata }
  weights: '400 text · 500 navigation and values · 560 labels · 600 titles, active nav, table headers, buttons · 650 sections · 700 page titles and metrics'

rounded:
  sm: 6px # inputs
  control: 8px # selects, filters, icon buttons
  card: 12px
  panel: 16px
  dialog: 16px
  pill: 9999px # every text button

shadow:
  level-1: '0 1px 3px rgba(0,55,112,0.08)'
  level-2: '0 8px 24px rgba(0,55,112,0.08), 0 2px 6px rgba(0,55,112,0.04)'
---

## Overview

Torio is an Operate-mode product: sellers answer chats, take orders and read their business all day. The language is
quiet and precise. Navy ink (`ink`) carries text instead of black; Torio indigo is the one action colour and appears
sparingly, mostly as the filled pill button and the active state. Surfaces are white cards on a cool off-white
canvas, separated by 1px hairlines and, where something floats, a soft blue-tinted shadow.

## Rules

- **Indigo is for action.** Filled pill buttons, links, selected states, focus rings. Never body text.
- **Buttons are pills.** Text buttons use `rounded.pill`. Square icon buttons, selects and filters use
  `rounded.control`; inputs use `rounded.sm`.
- **Bold means important.** Page titles and metrics are 700, section titles 650, card titles, table headers and
  buttons 600, labels 560, navigation 500 (600 when active), body and metadata 400. Use the `font-*` role utilities
  instead of ad-hoc size and weight pairs. (Changed 2026-11-02 at the user's request: this replaces the reference's
  light 300 display tier.)
- **Numbers are tabular.** Any money, count or date uses `tabular-nums`.
- **Depth is shadow-light.** Cards are flat with a hairline; `level-1` on hover or lift; `level-2` for popovers,
  drawers and dialogs.
- **Single-storey a.** `cv11` is enabled on the body (Inter's equivalent of the reference's `ss01`).
- **Brand moments only.** The gradient mesh belongs to brand surfaces (sign-in panel), never to working screens.
- **Channels** always use their official brand icons.

## Source

Adapted from `/DESIGN-stripe.md` at the user's request (2026-11-01), keeping Torio's binding primary #5B5CE2, its logo
and its product principles from `PRODUCT.md`. Tokens live in `src/app/globals.css`.
