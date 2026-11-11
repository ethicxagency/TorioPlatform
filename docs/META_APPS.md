# Two Meta apps

Torio uses two separate Meta Developer apps under Nextup Global Ltd. They are never mixed.

|                                                        | Torio Platform (Business Messaging)                                                                                                                                                                                                   | Torio Auth (Customer Authentication)               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Suggested App ID                                       | `3850545818418490`                                                                                                                                                                                                                    | `2321020315413901`                                 |
| Used for                                               | Connecting Pages, Instagram, WhatsApp; webhooks; sending/receiving messages                                                                                                                                                           | "Continue with Facebook" for customers only        |
| Settings (Super Admin → Integrations → Meta Developer) | **Business Messaging** tab                                                                                                                                                                                                            | **Customer Authentication** tab                    |
| Stored in                                              | `meta_configuration` row `default` (`purpose = BUSINESS_MESSAGING`)                                                                                                                                                                   | `meta_configuration` row `auth` (`purpose = AUTH`) |
| App Secret                                             | encrypted, write-only                                                                                                                                                                                                                 | encrypted, write-only (own secret)                 |
| OAuth callback                                         | `/api/v1/channels/meta/callback`                                                                                                                                                                                                      | `/api/v1/auth/oauth/facebook/callback`             |
| Webhooks                                               | `/api/v1/webhooks/meta`, `/api/v1/webhooks/whatsapp` (signature checked with this app's secret only)                                                                                                                                  | none                                               |
| Permissions                                            | Messenger: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`; Instagram: + `instagram_basic`, `instagram_manage_messages`; WhatsApp: `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging` | `public_profile`, `email`                          |

Saving, testing and status are independent per app. A missing credential in one never affects the other, and the Auth app's
settings refuse the Business app's App ID.

## How the App ID / Secret are chosen

- **Business Messaging:** saved values, else `META_APP_ID` / `META_APP_SECRET` / `META_OAUTH_REDIRECT_URI` / `META_WEBHOOK_VERIFY_TOKEN`; if no App ID is configured anywhere, `3850545818418490` is suggested (it doesn't count as configured). Existing connected channels are untouched.
- **Customer Authentication:** the App ID + Secret are one pair. A saved secret brings the saved (or suggested) App ID with it. With no saved secret, the environment pair `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` (the previous setup) keeps working, so nothing breaks on deploy. Clear the saved secret and it falls back to the environment.

## Environment variables

Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `WEB_URL`, `CORS_ALLOWED_ORIGINS`, `COOKIE_SECURE=true`, `CHANNEL_ENCRYPTION_KEY` (>= 32 chars; seals both apps' secrets), `API_URL` (public API origin; callbacks are built from it, never from `WEB_URL`).
Optional fallbacks (a saved value wins): `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WA_CONFIG_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, `FACEBOOK_LOGIN_CONFIG_ID` (only for a "Facebook Login for Business" Auth app), `GOOGLE_*`, `RESEND_API_KEY`, `MAIL_FROM`.

## Meta Dashboard URLs (production `https://torio.nextupglobal.net`)

**Torio Platform (3850545818418490)**

- Facebook Login for Business → Valid OAuth Redirect URIs: `https://torio.nextupglobal.net/api/v1/channels/meta/callback`
- Webhooks (Messenger, Instagram): `https://torio.nextupglobal.net/api/v1/webhooks/meta` + the verify token shown/generated in Super Admin
- WhatsApp → Configuration → Webhook: `https://torio.nextupglobal.net/api/v1/webhooks/whatsapp` + the same verify token
- App Domains: `torio.nextupglobal.net`; App Secret: set in Super Admin → Business Messaging

**Torio Auth (2321020315413901)**

- Facebook Login → Settings: Client OAuth Login ON, Web OAuth Login ON, Valid OAuth Redirect URIs: `https://torio.nextupglobal.net/api/v1/auth/oauth/facebook/callback`
- Use cases → "Authenticate and request data from users with Facebook Login" → Customize: add `email` and `public_profile`
- App Domains: `torio.nextupglobal.net`; App Secret: set in Super Admin → Customer Authentication

## App Review / access

- **Torio Auth:** `public_profile` and `email` are standard access; no App Review. Switch the app to Live (or add testers) so people other than developers can sign in.
- **Torio Platform:** `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`, `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` need **Advanced Access** (App Review, plus Business Verification for WhatsApp/Business use) before accounts other than your own team can connect. Torio cannot read review status from Meta; confirm it in the dashboard.

## Deployment checklist

1. Check `DATABASE_URL='<direct url>' pnpm db:migrate:status`; if (and only if) migrations are pending, run `DATABASE_URL='<direct url>' pnpm db:deploy` (this release adds `20261113000000_meta_app_purpose`, additive).
2. Vercel env: `API_URL`, `WEB_URL`, `CHANNEL_ENCRYPTION_KEY` present; keep `FACEBOOK_APP_ID/SECRET` until the Auth secret is saved in Super Admin.
3. Deploy. Open Super Admin → Meta Developer: both apps show their own status.
4. Customer Authentication tab → Set the Torio Auth App Secret → Save → **Test credentials with Meta**.
5. Register the callback URLs above in Meta, then run the manual checklist.

**Rollback:** redeploy the previous Vercel deployment. The migration only adds a defaulted column (`ALTER TABLE meta_configuration DROP COLUMN purpose;` removes it); the `auth` row can be deleted (`DELETE FROM meta_configuration WHERE id='auth';`) and customer sign-in falls back to the `FACEBOOK_*` environment pair.

## Manual real-world checklist (not covered by automated tests)

- Auth: sign in/up with Facebook as a Live-mode user and as a user with no email; confirm the account, linking, and `Last successful Facebook login` in Super Admin.
- Business: Channels → Connect Facebook → pick a Page → connected; send a message to the Page and reply from the Inbox; same for Instagram and WhatsApp; confirm webhook verification in Meta and Super Admin → Webhook test.
- Rotate `CHANNEL_ENCRYPTION_KEY` (previous key kept) and run Re-encrypt: both apps' secrets are included.
