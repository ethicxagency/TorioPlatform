# Platform integrations (Super Admin)

Phase 1 of the integrations work: the framework, secure configuration and real connection tests for **Mailgun**, **Torio Meta Pixel**
and **SSLCommerz**. Nothing here sends customer email, tracks events or takes payments yet; those are phases 2 to 5.

## What exists

- Super Admin → Integrations: `Mailgun (Email)`, `Torio Meta Pixel`, `SSLCommerz (Payments)` (`/admin/integrations/...`), next to the existing
  Meta Developer and AI Management pages. Workspace admins have no access to any of it: every route is behind `AdminGuard`.
- API: `GET/PUT /admin/integrations/platform[/:key[/config|/secrets/:name|/enabled]]`, `POST .../:key/test`,
  `POST .../mailgun/test-email`, `POST .../torio_meta_pixel/test-event`. Secret routes and tests are rate limited.
- Storage: one `platform_settings` row per integration (`integration.<key>`), so **no migration**. Plain settings, encrypted secrets, the
  last test result, and a "secret version" per secret live in that row.
- Encryption: the existing `ChannelCryptoService` (AES-256-GCM, `CHANNEL_ENCRYPTION_KEY`). Without the key secrets cannot be saved.
  Secrets are write-only: no route returns one, and the UI shows only "Saved (hidden)".
- Audit: changes go to the existing `admin_audit_logs` (`integration.config_saved`, `secret_set|replaced|removed`, `enabled|disabled`,
  `test_passed|failed`, `test_email`, `test_event`, `live_confirmed`). Entries name the fields that changed, never values.

## Status means something

`NOT_CONFIGURED` (missing required settings or secrets) → `UNVERIFIED` (saved, not tested) → `VERIFIED` (the provider accepted exactly
what is saved) or `FAILED`. Verification is tied to a fingerprint of the settings and secret versions: changing any setting that affects
the connection (not the on/off switches) or replacing a secret drops it back to `UNVERIFIED` and switches the integration off. An
integration can only be enabled while `VERIFIED`. "Connected" is never shown because credentials were merely saved.

## The three tests

| Integration      | Test                                                                   | What it proves                                               |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Mailgun          | `GET /v3/domains/{domain}` with the API key, region-aware              | key valid, domain exists, domain `active`, sending DNS valid |
| Torio Meta Pixel | `GET /{version}/{pixelId}` with the token in an `Authorization` header | token valid and can see this Pixel                           |
| SSLCommerz       | opens a 10.00 payment session (sandbox or live) and does not follow it | store ID and password valid; no payment is created           |

A test email says Mailgun **accepted** the message; delivery is only known from Mailgun's webhook (phase 2). A Meta test event is sent with
the test event code, so it appears under Events Manager → Test events. Switching SSLCommerz to Live needs an explicit confirmation, and
sandbox verification never carries over to live.

## Setup (Super Admin)

1. Make sure `CHANNEL_ENCRYPTION_KEY` is set on the API (Vercel environment). Do not change it later without a rotation plan.
2. **Mailgun**: add your sending domain in Mailgun and finish DNS; create a private API key; paste the key, set region, domain, From name and
   From email (must be on the domain). Test connection, then Enable. Save the webhook signing key for phase 2.
3. **Torio Meta Pixel**: create a Pixel owned by Torio and a Conversions API token in Events Manager; add a test event code. Test, then send a test event.
4. **SSLCommerz**: use a sandbox store first. Test, then Enable. Do not switch to Live until sandbox payments have been tested end to end (phase 5).

## Not done yet (later phases)

- Phase 2: Mailgun as the single sender for every transactional email (today the app still sends through Resend via `MailService`), templates,
  webhook endpoint with signature check, delivery log, retries.
- Phase 3/4: Meta browser pixel on the public marketing site, server events with deduplication, workspace pixels, Inbox/manual purchases.
- Phase 5: SSLCommerz checkout, success/fail/cancel/IPN routes and server-side validation. The addresses shown on the SSLCommerz page
  are labelled "Not active yet" because those routes do not exist until then.
- Real connectivity to Mailgun, Meta and SSLCommerz has not been exercised: tests use mocked providers. Verify with real sandbox
  credentials before relying on any of it.
