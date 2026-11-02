# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owners and small support/sales teams of social-commerce and eCommerce shops in Bangladesh: businesses that sell
through Facebook, Instagram and WhatsApp, take cash-on-delivery and bKash payments, and price in BDT. They answer a
high volume of customer messages through the whole day, on desktop and on their phones, often switching between
replying, taking orders and following up leads in the same few minutes.

Roles inside a workspace: Owner, Admin, Manager, Agent. A separate Super Admin panel serves Torio's own platform
operators.

## Product Purpose

Torio puts a shop's customer conversations, leads, orders and revenue in one place, so a small team can reply faster,
sell more from chat and see how the business is doing. Success is: no customer left waiting, every chat that turns
into a sale captured as an order, and an owner who can read the state of the business at a glance.

## Positioning

One shared inbox for WhatsApp, Instagram and Messenger that is tied directly to leads, orders and revenue, with an AI
Brain trained on the shop's own catalogue, policies and voice. The inbox is not a standalone helpdesk and the CRM is not
a standalone pipeline: the value is the loop from message to lead to order to revenue.

## Operating Context

- Customers write in English, Bangla and Banglish; the Brain's sample answers are in Banglish.
- Orders are mostly cash on delivery or bKash; money is stored in minor units with an ISO currency per record, BDT by
  default. Historical records keep their original currency.
- Analytics use a per-workspace reporting time zone (Asia/Dhaka for Bangladeshi workspaces).
- The web app is the product today; Android and iOS apps come later as clients of the same API.

## Capabilities and Constraints

- Built: dashboard analytics from real data (date range, channel filter, KPI breakdown), shared inbox, leads,
  customers, orders, team and roles, channels, automation, Brain configuration, billing with Stripe, settings, Super
  Admin, and the WhatsApp Cloud API foundation (webhooks, sending, 24-hour window, opt-out).
- Not built yet: live Meta connections (credentials and app review pending), Messenger/Instagram sending, AI-generated
  replies (no model provider connected), notifications, password reset, public sign-up (access is by invitation),
  phone login, two-factor sign-in, help/support destinations, Terms and Privacy pages.
- Some dashboard widgets (channel performance, AI performance, funnel, team activity) still show sample figures.
- Never present an unbuilt capability as working; label it honestly instead.

## Brand Commitments

- Name: Torio. Official logo `public/torio-logo.png` (wordmark) and `public/torio-icon.png` (mark).
- Primary brand colour #5B5CE2 is binding.
- Channels are always shown with their official brand icons.
- Default currency BDT (৳), South Asian digit grouping.

## Evidence on Hand

- Logo assets above. Seeded demo workspace "UrbanNest" (fictional; demo only).
- No verified customer testimonials, customer logos, case studies, benchmarks or press. Do not invent any.
- No product photography or approved imagery; the sign-in brand panel uses the brand mesh instead.

## Product Principles

1. The loop is the product: every surface should make the path from conversation to order to revenue shorter.
2. Speed under volume: the busiest moment of a seller's day is the design target, on desktop and phone.
3. Honest state: real data or a clear "not built yet", never a fabricated number, link or capability.
4. Respect the local reality: BDT, COD and bKash, Bangla/Banglish, Asia/Dhaka time.
5. Owners must read the business at a glance; agents must act without hunting.

## Accessibility & Inclusion

WCAG 2.2 AA across the customer portal: contrast, keyboard access, visible focus, labelled controls, adequate touch
targets on phones, and reduced-motion support.
