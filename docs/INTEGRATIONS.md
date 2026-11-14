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

- Real connectivity to Mailgun, Meta and SSLCommerz has not been exercised: tests use mocked providers. Verify with real sandbox
  credentials before relying on any of it.

## Phase 2: Mailgun email

- **One sender.** `MailService` is the only place email leaves Torio (`send` and `sendTemplate`). It uses Mailgun when Super Admin has it
  enabled and verified, and otherwise the Resend variables from the environment (`RESEND_API_KEY`, `MAIL_FROM`), so nothing changes
  until Mailgun is switched on. With neither, nothing is sent and callers say so. Migrated to templates: email verification, password reset,
  first-password code, social sign-in confirmation, account-deletion confirmation. The account-deleted notice still goes through `send` with a label.
- **Templates** (`mail-templates.ts`): subject, plain text and responsive HTML from the same variables, HTML-escaped, links limited to
  http(s). Platform/security emails carry Torio's identity; `workspace_notice` carries the store's name and logo (already in place for
  the order and payment emails of later phases). The Mailgun page previews every template with sample data.
- **Delivery log** (`email_delivery_logs`): one row per message with the provider's message id and a status. `ACCEPTED` means the provider
  took it, nothing more. Message bodies are never stored (they contain one-time links), so there is no stored message to resend: a failed
  email is sent again when the person repeats the action. A send is retried once for a network error or a 5xx; a refusal is final.
- **Webhook** `POST /api/v1/webhooks/mailgun`: set it up in Mailgun → Webhooks for accepted, delivered, temporary and permanent failure,
  opened, clicked, complained and unsubscribed, using the same URL shown on the Mailgun page. The HMAC-SHA256 signature (timestamp + token,
  with the saved webhook signing key) and a 15 minute timestamp window are checked before anything is read; an event id seen before is
  acknowledged and not applied again (`integration_webhook_events`); a state only moves forward, so a late older event never undoes a
  newer one. Without a saved signing key the endpoint answers 503 and the page says delivery tracking is off.
- **Super Admin** Mailgun page: recent emails with status, reason and last event, last delivery reported, last failure, and counts for the last 24 hours.

### Migration

`20261126000000_email_delivery` adds `email_delivery_logs` and `integration_webhook_events` (additive). Apply with `pnpm db:deploy` before
deploying: the sender writes to the log table (a failure to log never blocks an email, but the Mailgun page's list needs the tables).

### Not done in phase 2

- Workspace-level email features (notification preferences, order emails, template choice per store) have no sender yet: the shared
  sender and the branded template exist, but no workspace flow calls them, and the workspace UI is not built.
- Invitations, order, payment and billing emails are not sent by Torio today (invitations are shared as a link); they will use `sendTemplate`
  when those flows send email.
- Retries are an inline single retry, not a queue with backoff and a dead-letter state; the delivery log shows failures.
- Real Mailgun connectivity and webhook delivery have not been exercised against a live account.

## Phase 3: Torio Meta Pixel and Conversions API

- **Separate from workspaces.** Torio's Pixel has its own credentials (Integrations → Torio Meta Pixel), its own `platform` owner key in
  `meta_tracking_events`, and shares nothing with any store's Pixel. It is used only while the integration is verified, switched on, and the
  relevant switch (browser or server tracking) is on.
- **Server events** (`MetaEventsService`): an event is stored first, then sent; the caller never waits for Meta and a failure never
  affects the action it describes. `(owner, event_id)` is unique, so a repeated action cannot create a second event. 2xx with an event
  received is `SENT`; 429, 5xx and network errors are `FAILED` and retried in-process with growing delays (2s, 10s, 1m, 5m, up to five
  attempts); other 4xx, an event older than seven days, or running out of attempts is `DEAD`. Super Admin can retry from the page.
  The stored payload holds only hashed identifiers (SHA-256 of normalised email, phone, external id) plus the browser identifiers Meta
  requires unhashed when the caller has them. The access token is sent in an `Authorization` header and never logged or stored in events.
- **What fires today:** `CompleteRegistration` when an email address is verified for the first time (event id `registration-<userId>`),
  from the verified server action, not from the browser. `Lead`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase` and `Subscribe` need the
  lead form, checkout and payment records that come with SSLCommerz (phase 5): `TorioTrackingService.track` is the single entry point they
  will call, with an event id tied to the payment record so a retried callback cannot count twice.
- **Browser Pixel** (`PublicTracking`): only on the public marketing pages (`/` and `/brain`; never the app, admin, account or privacy
  pages), only when Super Admin turned browser tracking on, only after the visitor presses Accept (nothing loads from Meta before that),
  never when the browser sends Global Privacy Control or Do Not Track, and the choice can be reopened from the "Analytics choice" button.
  It sends `PageView` and, on `/brain`, `ViewContent`. The Pixel id is public by nature (`GET /api/v1/public/tracking`); the token never is.
- **Deduplication:** every event has an `event_id`. Browser-only events (`PageView`, `ViewContent`) have no server twin. For an event the
  browser and the server both report (Purchase, in phase 5) the success page will fire the same id the server used, so Meta counts it once.
- **Not done:** browser/server `CompleteRegistration` pairing (the verify page is outside the public marketing site, so it is server-only), consent
  captured at sign-up for server events (they carry hashed email and the request IP only), and a queue that survives a restart (retry timers
  are in-process; after a restart the events stay `FAILED` for the manual retry).

### Migration

`20261127000000_meta_tracking_events` (additive). Apply with `pnpm db:deploy` before deploying.

## Phase 5: SSLCommerz subscription payments

**Model.** SSLCommerz takes one-time payments, so a payment buys a fixed **term** (one month or one year) of a plan. The workspace's
subscription gets `source = GATEWAY`, `cancelAtPeriodEnd = true` (shown as "access until") and a `currentPeriodEnd`; Torio never charges again by
itself, and a term that has ended becomes `EXPIRED` (marked by a 15-minute sweep, before billing reads, and ignored by the AI plan lookup
the moment it passes). Paying again for the same plan before it ends adds a term after the current one; paying for a different plan, or
after expiry, starts a term now (unused time on another plan is not credited). A workspace with a Stripe or manually granted subscription
cannot pay here (409). It reuses the existing `subscriptions`, `invoices` and plan snapshot; there is no second subscription system.

**Flow.**

1. `POST /workspaces/:id/billing/sslcommerz/checkout` (`billing:manage`, rate limited; body `{planKey, interval}` only): needs the
   gateway verified and on, complete billing details, a plan with a price in a configured currency (a placeholder price is only charged in
   sandbox). Torio creates a `payment_gateway_transactions` row (unique `TORIO-…` id, plan, term, **amount and currency fixed by Torio**) and
   opens an SSLCommerz session; the browser is sent to the gateway's page.
2. The browser returns to `/api/v1/payments/sslcommerz/{success,fail,cancel}` and SSLCommerz also calls `/ipn`. None of that is trusted.
   Torio asks the gateway (`validationserverAPI`, or `merchantTransIDvalidationAPI` when no validation id arrived) and starts the plan only when
   the answer is VALID/VALIDATED **and** the transaction id, store id, currency and amount (to the cent) equal what Torio created and the
   risk level is not flagged. Anything else is `REJECTED` (mismatch) or `REVIEW` (risky), visible to Super Admin with the reason.
3. Starting the plan, the invoice (`sslcommerz:<tranId>`, status PAID) and the audit entry happen in one transaction guarded by
   `appliedAt`, so a repeated success callback, an IPN replay or a reconciliation changes nothing. Afterwards a confirmation email and a
   `Purchase` event (server-side, event id `purchase-<tranId>`) are sent best-effort; neither can undo the payment.
4. IPNs must carry a valid `verify_sign` (MD5 scheme from SSLCommerz's docs) **and** pass the same server-side validation. Fail and cancel
   callbacks only change attempts that are still open; a payment already confirmed is never undone by a late failure.
5. The return page (`/billing/subscription?tran=…`) asks `GET …/sslcommerz/transactions/:tranId`, which re-checks a pending payment with
   the gateway, and shows only what the server found ("Payment confirmed" only for `PAID`).

**Statuses:** INITIATED, PENDING, PAID, FAILED, CANCELLED, REFUNDED (reserved), REJECTED, REVIEW.
**Other endpoints:** `GET …/transactions` (workspace's own, `billing:read`); Super Admin `GET /admin/integrations/platform/sslcommerz/transactions`
and `POST …/transactions/:tranId/reconcile`. Workspace isolation: every workspace route filters by the caller's workspace; a transaction
of another workspace is a 404.

### Migration

`20261128000000_sslcommerz_payments` adds the `GATEWAY` subscription source and `payment_gateway_transactions` (additive).

### Sandbox testing

1. Create an SSLCommerz sandbox store; in Super Admin → SSLCommerz save the store ID/password with Environment = Sandbox, run **Test connection**, **Enable**.
2. In the SSLCommerz merchant panel set the IPN listener to the IPN URL shown on the page (needed for payments that finish after the browser closes).
3. As a workspace owner with billing details filled in (Settings → General: name, email, country), open Subscription → plans and press **Pay with SSLCommerz**; pay with SSLCommerz's published sandbox credentials.
4. Check: the plan is active "until" the term end, an invoice exists, the payment shows under Billing → SSLCommerz payments and in Super Admin → Recent payments. Cancel at the payment page and confirm nothing changes.

### Production checklist

- Real prices: switch the plans' pricing off "placeholder" in Plans & Pricing (live mode refuses placeholder prices); currency must be one of the store's configured currencies.
- Live credentials in a separate save with Environment = Live and the explicit confirmation; **Test connection** and enable again (sandbox verification does not carry over).
- IPN URL set in the live merchant panel; `API_URL` set so the callback addresses are your public API origin; `CHANNEL_ENCRYPTION_KEY` set.
- Apply the three pending migrations before deploying (custom roles, email delivery, meta tracking events) plus this one.

### Known limitations

- Refunds are not automated: a refund done in the SSLCommerz panel does not change the subscription or invoice (the REFUNDED status is reserved).
- No automatic renewal or reminder emails: a term simply ends; a renewal reminder needs a scheduled job that does not exist yet.
- Only the currencies configured for the store are accepted; amounts are in the plan's currency (BDT today), and prices are the plan catalog's, not negotiated per customer.
- Never exercised against the real gateway: automated tests mock SSLCommerz. Verify with sandbox credentials, then a small live payment, before announcing it.

## Phase 4: a workspace's own Meta Pixel and purchase events

- **Where:** Settings → Integrations (Owner and Admin, permission `workspace:update`; everyone else sees a notice). Per workspace: Pixel ID, test
  event code, a Conversions API switch and a write-only access token, with Test connection, Send test event, Turn on/off, Disconnect and an event
  log with Retry failed. API: `/workspaces/:id/integrations/meta-pixel` (`GET`, `PUT`, `DELETE`, `PUT token|enabled`, `POST test|test-event|events/retry`,
  `GET events`).
- **Isolation:** stored in `workspace_integrations` (one row per workspace and integration, secrets encrypted with the same service), events are
  keyed by the workspace id as owner in `meta_tracking_events`, and every route is workspace-guarded: another workspace gets 404. It shares nothing with
  Torio's own Pixel.
- **Verified means verified:** same rules as platform integrations: a real call to Meta with the saved Pixel and token; any change to the Pixel, test code or
  token switches it off and needs a new test.
- **Purchase events:** `WorkspacePixelService.trackOrderPaid` runs when a payment is recorded that brings an order to fully paid (the only place an order
  becomes paid). It sends one `Purchase` per order, ever (event id `purchase-order-<orderId>`), so editing, reopening, repeated status changes, a retried request
  or a second trigger cannot repeat it. Unpaid, part-paid, cancelled and sample orders never produce one. Orders created from a conversation use action source
  `chat`; orders entered by hand use `system_generated`. User data is hashed email, phone and customer id; custom data is value, currency and the order number.
  A failing Meta never affects the payment: the event is stored, retried with backoff, and can be retried by hand from the log.
- **Not done:** browser tracking (Torio hosts no customer-facing store pages that could carry a workspace's Pixel), `_fbp`/`_fbc` and click attribution (Torio
  does not collect them), refund events (not part of Meta's Purchase model; not sent), and events other than `Purchase` (`Lead`, `Contact`, `InitiateCheckout`,
  `AddToCart` have no server-side source records yet).

### Migration

`20261129000000_workspace_integrations` (additive).
