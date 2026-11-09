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

## How onboarding works now (one Facebook login)

1. **Channels → Connect Channel → Continue with Facebook.** The server signs a short-lived `state` (workspace, user,
   products) and returns the Facebook dialog URL. The dialog asks for the permissions below.
2. Facebook redirects to `META_OAUTH_REDIRECT_URI`. The server verifies the state, exchanges the code, swaps it for a
   long-lived user token and **discovers** what the user can reach:
   - **Pages** (`/me/accounts`, each with its own Page token) → Messenger candidates.
   - **Instagram professional accounts** linked to those Pages → Instagram candidates (personal accounts never appear).
   - **WhatsApp** (only with `META_DISCOVER_WHATSAPP=true`): `/me/businesses` → owned WhatsApp Business Accounts → phone
     numbers. A number is *eligible* only if Meta reports it registered for the Cloud API (`status = CONNECTED`);
     otherwise the screen says it needs Embedded Signup. Ordinary Facebook login does **not** register new numbers.
3. Everything discovered is parked server-side for 15 minutes (tokens encrypted). The browser gets only a session id.
4. The user ticks any combination ("Select all eligible" available) and clicks **Connect**. Each asset is provisioned
   **independently** (verify token → subscribe webhooks → save encrypted credential → record `Connected`). A failure
   shows its own reason and can be retried alone; successes are never redone. Choosing a number that is already
   connected here returns the existing channel (no duplicate). Cancel deletes the parked tokens immediately.
5. Declining some permissions doesn't fail the rest: those products are listed as "permissions weren't granted".

Permissions requested (each is shown to the user with its reason before they continue):

| Product | Permissions |
|---|---|
| Messenger | `pages_show_list`, `pages_messaging`, `pages_manage_metadata` |
| Instagram | `pages_show_list`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages` |
| WhatsApp discovery | `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging` |

WhatsApp numbers connected this way use the long-lived **user** token (about 60 days; Torio stores and shows its
expiry and asks to reauthorize). Numbers set up through **Embedded Signup** use a business token that normally doesn't
expire. Manual token + phone number ID remains available as a fallback.

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

## 0. Where Meta settings live now

Super Admin → **Integrations → Meta Developer** (`/admin/integrations/meta`) is the control centre. Values saved there
override the server environment and take effect **without a redeploy** (every Meta call re-reads them; other API instances
pick changes up within about 5 seconds). Anything not saved there falls back to the environment variables below, so existing
deployments keep working unchanged.

| Setting | Where | Takes effect |
|---|---|---|
| App name/ID, API version, Business ID, app mode, domains, website URL | Dashboard (falls back to env) | immediately |
| App Secret, webhook verify token | Dashboard, **write-only**, encrypted with the master key | immediately |
| OAuth redirect URIs, state expiry, trusted domains, success/failure URLs | Dashboard | immediately |
| Webhook base URL, enabled flag, per-product on/off | Dashboard | immediately |
| Embedded Signup configuration ID, WhatsApp discovery | Dashboard | immediately |
| `CHANNEL_ENCRYPTION_KEY` (+ `_PREVIOUS` during rotation) | **Deployment environment only** | after redeploy |
| `DATABASE_URL`, `JWT_ACCESS_SECRET`, `WEB_URL`, `CORS_ALLOWED_ORIGINS` | **Deployment environment only** | after redeploy |

**Changes that can require customers to reconnect** (the page shows this and asks for confirmation before saving): switching
to a different **App ID**, replacing the **App Secret** with another app's secret (inbound webhooks are signed with it),
disabling webhooks, or switching a product off. Existing connections are never disconnected by saving.

**Safety rails:** every save is validated first; a failed save changes nothing; the success/failure redirect can only point
at a host listed under *Trusted application domains* (or the web app's own host); the redirect URI must end with the
callback route the API actually serves (`/api/v1/channels/meta/callback`); HTTPS is required in production. Secrets are never
returned by any API, logged, or written to the audit log. **Rollback:** the activity log lists each changed field with its
before/after (non-secret) values: put the previous value back and save again.

**Key rotation (real, not cosmetic):** set the new key as `CHANNEL_ENCRYPTION_KEY`, keep the old one as
`CHANNEL_ENCRYPTION_KEY_PREVIOUS`, redeploy (everything keeps working: both keys decrypt), then press **Re-encrypt stored
secrets** in the Security tab. It re-seals channel tokens, WhatsApp registration PINs, the saved App Secret / verify token
and parked login sessions row by row; anything unreadable with either key is reported and left untouched. Remove the
previous key only when nothing is sealed with it, and keep an offline backup of the old key until then. **Backup/recovery:**
keep the master key(s) in your secret manager: without them stored tokens and secrets can't be decrypted and channels must
be reconnected. The database alone is not enough to recover them.

**Using the page, step by step**
1. *App Configuration*: enter App ID, name, API version (see Meta's changelog), app mode; **Replace** the App Secret; run **Test Meta App Credentials** (asks Meta whether the pair is valid).
2. *OAuth & Redirect URLs*: add the redirect URI (it must be registered at Meta exactly as shown, copy it from the page); add your web host under Trusted application domains; run **Test OAuth Configuration**.
3. *Webhook Configuration*: copy the two callback URLs into Meta; **Generate new** verify token (shown once) and enter it in Meta; run **Test Webhook Verification** (reads the callback URLs Meta has registered for the app and compares them with Torio's).
4. *Permissions & Products*: switch products on/off, set the Embedded Signup configuration ID, decide on WhatsApp discovery. *App Review status is shown as unknown on purpose*: Meta doesn't expose approval through its API.
5. *Connection Diagnostics*: refresh the checks and review webhook health (last verified by Meta, last event, 24h processed/failed).

Official Meta documentation: [create an app](https://developers.facebook.com/docs/development/create-an-app) ·
[Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business) ·
[Messenger webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks) ·
[Instagram messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started) ·
[WhatsApp Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview) ·
[App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review) ·
[Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog). Where this page and Meta disagree, Meta wins.

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
| `CHANNEL_ENCRYPTION_KEY_PREVIOUS` | Only during a key rotation (see section 0) |
| `CHANNEL_ENCRYPTION_KEY` | >= 32 chars; AES-256-GCM key for stored tokens. Keep in a secret manager; rotating it invalidates stored tokens |
| `META_GRAPH_VERSION` | `v27.0` at the time of writing (see the changelog link above) |
| `META_WA_CONFIG_ID` | Optional: WhatsApp Embedded Signup configuration id |
| `META_DISCOVER_WHATSAPP` | `true` to also request WhatsApp permissions in the Facebook login and list existing numbers. Leave `false` until those permissions are approved for production |
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

## 9. Environment by deployment target

**API service (Render)** — all secrets live here only: `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`,
`META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_WA_CONFIG_ID`, `META_DISCOVER_WHATSAPP`,
`CHANNEL_ENCRYPTION_KEY`, `WEB_URL`. With the single-domain Render service these are set on that one service.

**Web (Vercel, if the web is deployed separately)** — no Meta secrets and no `NEXT_PUBLIC_META_*` values. The browser
reads the app id, Graph version, Embedded Signup configuration id and permission list from the authenticated
`GET /workspaces/:id/channels/meta/config` endpoint, which never returns a secret. Only `NEXT_PUBLIC_API_URL` is needed.

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Unavailable — Meta isn't configured" | one of the five required API variables is missing |
| Facebook shows "URL blocked" / redirect error | `META_OAUTH_REDIRECT_URI` isn't in *Valid OAuth Redirect URIs* exactly |
| Back on Torio with "invalid or expired" | the 10-minute state expired or the link was reused; start again |
| "Permissions for … weren't granted" | the user unticked permissions, or the app lacks Advanced Access in production |
| No Pages listed | the user has no Page role, or didn't select the Page in Facebook's asset step |
| No Instagram account listed | not a professional account, not linked to a Page, or *Allow access to messages* is off |
| WhatsApp number listed but not selectable | not registered for the Cloud API: use Embedded Signup |
| Connected but no events | webhook callback URL/verify token wrong, app not Live, or fields not subscribed (see the channel's health panel) |
| Channel shows "Authorization expired" | token expired/revoked: use **Reconnect** |

For the real-Meta verification checklist see `docs/META_STAGING_TESTS.md`.
