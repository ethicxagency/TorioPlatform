# Meta channel setup (WhatsApp, Messenger, Instagram)

Torio connects each workspace's own WhatsApp Business number, Facebook Page (Messenger) and Instagram professional
account through official Meta flows. This document is the operator checklist for one Torio deployment. It uses
placeholders only; never commit real credentials.

> **Checked against Meta's docs on 2026-11-09** (Messenger Platform, Instagram Messaging, WhatsApp Embedded Signup,
> Facebook Login, Graph API changelog). Meta changes these often: re-check before go-live. The code is still tested
> only against mocked Meta responses; a real run with your Meta app (development mode first) is required.
>
> What the check found, and what changed in Torio because of it:
> - Latest Graph API is **v27.0**; v21.0 is supported until **2027-01-21**. Torio now defaults to `v27.0`.
> - WhatsApp **Embedded Signup v2/v3 were deprecated on 2026-10-15**: the configuration must be a *Facebook Login for
>   Business* configuration using the **Embedded Signup** variation (v4). The browser call passes only `extras.setup`.
> - Embedded Signup code exchange takes **no `redirect_uri`**, the code lives ~30 seconds, closing the popup on the final
>   screen succeeds *without* a code, and the number must be **registered** (`POST /{phone-number-id}/register` with a
>   PIN). Torio does all of this and keeps the PIN encrypted.
> - A Messenger delivery receipt can arrive **without `mids`** (only a `watermark`); Torio handles both.
> - Meta's docs now list **three** Instagram setups (Unified Login, Instagram Login, Facebook Login). Torio implements the
>   Page-linked one (Messenger API for Instagram). See section 6.

## What exists in Torio

| Capability | How it connects | Status |
|---|---|---|
| WhatsApp Business | Cloud API token + phone number id (manual), or Embedded Signup v4 (needs `META_WA_CONFIG_ID`) | token flow in production use; Embedded Signup follows Meta's current docs but has not been run against live Meta |
| Facebook Messenger | Facebook Login (OAuth) → choose a Page → Torio subscribes the Page to webhooks | built, tested against mocked Meta |
| Instagram Messaging | Facebook Login (OAuth) → choose a Page with a linked professional account | built, tested against mocked Meta |

Not supported yet (and not claimed anywhere in the UI): media (incoming media shows a placeholder), WhatsApp message
templates (needed outside the 24-hour window: `GET /{waba-id}/message_templates`, send `type: "template"`), interactive
messages, **Instagram Login / Unified Login** (separate OAuth, `graph.instagram.com`, Instagram user tokens), the Messenger
human-agent tag beyond the 24-hour window, and WhatsApp users who adopted a **username** (their webhooks can omit the phone
number; Torio records those events as failed with that reason instead of guessing).

## 1. Create the Meta app

1. <https://developers.facebook.com/apps> → **Create app** → use case **Other** → type **Business**.
2. **App settings → Basic**: note the **App ID** (`META_APP_ID`) and **App Secret** (`META_APP_SECRET`).
3. Add products: **Facebook Login** (or *Facebook Login for Business*), **Messenger**, **Instagram** (Instagram API
   with Facebook Login) and **WhatsApp**.

## 2. Environment variables

| Variable | Purpose |
|---|---|
| `META_APP_ID` | Numeric app id (used in OAuth and Embedded Signup) |
| `META_APP_SECRET` | Signs/validates webhooks (`X-Hub-Signature-256`) and OAuth state; exchanges codes. Server only |
| `META_OAUTH_REDIRECT_URI` | `https://<api-host>/api/v1/channels/meta/callback` — must match the app's valid OAuth redirect URIs **exactly** |
| `META_WEBHOOK_VERIFY_TOKEN` | Any random string (>= 8 chars) you also enter in Meta's webhook setup |
| `CHANNEL_ENCRYPTION_KEY` | >= 32 chars; AES-256-GCM key for stored tokens. Keep in a secret manager; rotating it invalidates stored tokens |
| `META_GRAPH_VERSION` | `v27.0` at the time of writing (see the changelog link above) |
| `META_WA_CONFIG_ID` | Optional: WhatsApp Embedded Signup configuration id |
| `WEB_URL` | Where the browser returns after OAuth (`/channels`) |

Without `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN` and
`CHANNEL_ENCRYPTION_KEY`, Messenger and Instagram show as **Unavailable** with the reason; nothing pretends to connect.

## 3. OAuth

- Facebook Login → Settings → **Valid OAuth Redirect URIs**: add `META_OAUTH_REDIRECT_URI`.
- Keep **Client OAuth login** and **Web OAuth login** on; keep **Enforce HTTPS** on in production.
- Torio requests the least permissions per channel:
  - Messenger: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
  - Instagram: `pages_show_list`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`
- The authorization `state` is HMAC-signed, expires after 10 minutes and binds workspace, user and provider. The code is
  exchanged on the server; tokens never reach the browser and are never logged.

## 4. Webhooks

Callback URLs (the same verify token for each):

| Product | Callback URL | Fields to subscribe |
|---|---|---|
| WhatsApp Business Account | `https://<api-host>/api/v1/webhooks/whatsapp` | `messages` |
| Page (Messenger) | `https://<api-host>/api/v1/webhooks/meta` | `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads` |
| Instagram | `https://<api-host>/api/v1/webhooks/meta` | `messages`, `messaging_postbacks`, `messaging_seen` |

- Torio verifies the challenge (`hub.verify_token`) and the **signature of the raw body** on every POST.
- Events are stored under a unique key *before* Meta is acknowledged, so redeliveries are ignored and nothing is lost;
  the work runs right after the response. Events left `RECEIVED` or `FAILED` are retried every minute (up to 5
  attempts). This runs inside the API process: Torio's BullMQ worker (`apps/worker`) currently has no database or
  realtime access, so moving webhook handling there is a separate refactor.
- Also subscribe the WhatsApp app to `account_update` (Embedded Signup sends it on completion).
- When a user picks a Page, Torio subscribes the Page to the fields above (`POST /{page-id}/subscribed_apps`). If Meta
  rejects it nothing is saved and the user sees the reason.

## 5. WhatsApp

- Manual: in WhatsApp Manager / the app dashboard create a **system user** token with `whatsapp_business_messaging`
  and `whatsapp_business_management`, copy the **phone number id**, and paste both in Torio (Channels → Connect).
- Embedded Signup (optional): create a Facebook Login for Business **configuration** with the *Embedded Signup* login
  variation (selecting the WhatsApp products makes it v4), set its id as `META_WA_CONFIG_ID`. In Facebook Login for
  Business → Settings, turn on Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Strict
  Mode for redirect URIs and Login with the JavaScript SDK, and add your **HTTPS** web origin to both *Allowed domains* and
  *Valid OAuth redirect URIs*. Torio exchanges the returned code on the server, validates the number with Meta, subscribes
  the WABA and registers the number (PIN stored encrypted). A business token normally doesn't expire; Torio reads the
  real expiry from Meta and shows it. Until Advanced Access/Business Verification, Meta limits onboarding to 10 new
  customers per rolling 7 days.
- Messages outside the 24-hour customer service window need an approved template; Torio blocks free-form replies there
  and says why. Templates aren't supported in Torio yet.

## 6. Messenger and Instagram requirements

- Messenger: a Facebook Page you administer. Replies are allowed within 24 hours of the customer's last message.
- Instagram (Page-linked, "Messenger API for Instagram"): a **professional** account linked to a Facebook Page, with
  Instagram *Settings → Messages and story replies → Message controls → Connected tools → Allow access to messages* on.
  Torio asks for `pages_show_list`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`; replies use
  the Page token. Webhooks arrive as `object: "instagram"` with the Instagram professional account id in `entry[].id`.
  Meta recommends *Unified Login* for new Instagram integrations; that flow is not built (see the table above).

## 7. Development vs production

- **Development mode:** only app admins/developers/testers (and test accounts) can authorize and message. Add testers
  under App roles. Advanced permissions work for them without review.
- **Production:** requires **Business Verification**, **App Review** for `pages_messaging`, `pages_manage_metadata`,
  `pages_show_list`, `instagram_basic`, `instagram_manage_messages` (and WhatsApp permissions), a privacy policy URL, and
  switching the app to **Live**. Submit screen recordings of the Torio connect flow and an inbound/outbound reply.

## 8. Operating notes

- **Disconnect** removes Torio's webhook subscription from the Page on Meta (`DELETE /{page-id}/subscribed_apps`, best
  effort, recorded in the channel activity), deletes the stored token and keeps all conversations. If Meta can't be
  reached the activity says so and the Page owner can remove Torio under Business integrations. WhatsApp numbers keep
  their WABA subscription (Torio doesn't store the WABA id).
- **Reconnect** reuses the same channel when the same account is selected, so history stays attached.
- **Health:** *Check connection* calls Meta; an invalid token marks the channel *Authorization expired* and blocks sends
  until reauthorized.
- Tokens are AES-256-GCM encrypted in `channel_credentials`; the Page id needed for sending is stored inside the same
  encrypted blob. Short-lived OAuth selections (`channel_oauth_sessions`) hold encrypted Page tokens for 15 minutes and
  are single-use.
