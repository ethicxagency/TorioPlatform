# Customer authentication

Torio customers sign in with email and password, Google, or Facebook. This is separate from the Super Admin sign-in
(`/admin/login`, its own cookie and tables); a customer session is never accepted by the admin API.

## What exists

| Flow | Where |
|---|---|
| Sign up, sign in, refresh, sign out | `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout` (refresh token in an HttpOnly cookie, access token in memory) |
| Forgot / reset password | `POST /api/v1/auth/forgot-password`, `/reset-password` |
| Email verification | `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification` (signed in, 60 s cooldown) |
| What the pages may offer | `GET /api/v1/auth/config` → `{ google, facebook, email, registrationOpen }` |
| Google / Facebook | `GET /api/v1/auth/oauth/{google,facebook}/start` and `/callback`, `POST /api/v1/auth/oauth/email`, `POST /api/v1/auth/oauth/complete` |

Web pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, `/auth/complete`.

## Redirect / callback URLs (exact)

Register these with the providers. The path is fixed by the implementation; only the host changes.

| Provider | Production | Local |
|---|---|---|
| Google (Authorized redirect URI) | `https://torio.nextupglobal.net/api/v1/auth/oauth/google/callback` | `http://localhost:4000/api/v1/auth/oauth/google/callback` |
| Facebook (Valid OAuth Redirect URI) | `https://torio.nextupglobal.net/api/v1/auth/oauth/facebook/callback` | `http://localhost:4000/api/v1/auth/oauth/facebook/callback` |

The production domain is `https://torio.nextupglobal.net`. For the callbacks (and the email links) to use it, the Vercel project must serve that domain and `WEB_URL` and `CORS_ALLOWED_ORIGINS` must be set to `https://torio.nextupglobal.net`.

Google's redirect URI is `GOOGLE_REDIRECT_URI` if set, otherwise `<API_URL>/api/v1/auth/oauth/google/callback`: it is never derived from `WEB_URL`, and in production there is no fallback (a missing value makes Google sign-in refuse to start with a `redirect_uri_not_configured` message and an error in the server log; at startup the log prints the exact URI to register). Locally it falls back to `http://localhost:<API_PORT>/...`. The value in the env
var, the value in the provider console and the URL actually used must match exactly.

### Customer Facebook sign-in runs on its own Meta app

Facebook sign-in for customers uses the **Torio Auth** Meta app, configured in Super Admin → Integrations → Meta Developer →
*Customer Authentication* (App ID, encrypted App Secret, callback override, allowed redirect URIs, Test). It is separate from the
Torio Platform (Business Messaging) app; see `docs/META_APPS.md`. Redirect URI resolution: the saved override, then
`FACEBOOK_REDIRECT_URI`, then `<API_URL>/api/v1/auth/oauth/facebook/callback`. The route accepted for it is only
`/api/v1/auth/oauth/facebook/callback` (never the channel callback), HTTPS (http only for localhost outside production), no query,
fragment or credentials, on a trusted host. The redirect URI a sign-in starts with is carried in the signed state and must still be
allowed, and be repeated exactly, at the code exchange. Registering a URL in Torio does not register it with Meta.

## Environment variables (server only)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` · `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
`FACEBOOK_REDIRECT_URI` · `RESEND_API_KEY`, `MAIL_FROM`. Secrets never reach the browser. A provider without both its
id and secret is shown disabled on the pages and its start endpoint answers `provider_not_configured`.

`FACEBOOK_*` is the Facebook Login app for customers signing in to Torio. It is separate from the `META_*` app used for
Messenger, Instagram and WhatsApp channels (you may use one Meta app for both, but they are configured independently).

## Console setup

**Google** (console.cloud.google.com → APIs & Services):
1. OAuth consent screen: app name Torio, support email, authorized domain; scopes `openid`, `email`, `profile` (all non-sensitive; no review needed). Publish the app (otherwise only listed test users can sign in).
2. Credentials → Create OAuth client ID → *Web application*. Add the redirect URI(s) above. Copy the client id and secret.

**Facebook** (developers.facebook.com):
1. Create or reuse a Meta app → add the *Facebook Login* product (Web).
2. Facebook Login → Settings → *Valid OAuth Redirect URIs*: add the URI(s) above; keep *Client OAuth Login* and *Web OAuth Login* on.
3. App settings → Basic: copy App ID and App Secret; set a privacy policy URL and category; switch the app to *Live* (in Development only app roles can sign in).
4. Permissions: `public_profile` and `email` need no review. Facebook may still return no email (the person has none, or declined it); Torio handles that.

## Account policy (why sign-in can say "account exists")

1. A linked identity (provider + the provider's stable user id: Google `sub`, Facebook app-scoped id) always signs in its account.
2. A new account is created only from an email the provider verified (Google `email_verified`), or one the person proved by clicking an emailed link (Facebook, or any provider that returned no email).
3. An email that already belongs to an account is linked only when both the account's email and the provider's are verified. Otherwise sign-in stops with *account exists* and the person signs in with their password. Torio never merges accounts on an unproven email, so registering someone else's address cannot take over their account.
4. Social-only accounts get a random, unknowable password hash; they can set a password through *Forgot password*.

Linking an identity from inside Settings (for a signed-in password user) is not built yet.

## Security details

- OAuth `state` plus an HMAC-signed, 10-minute HttpOnly cookie bind each callback to the browser that started it (CSRF); Google also uses PKCE (S256) and an OIDC `nonce`.
- Google ID tokens are verified server-side: RS256 signature against Google's JWKS, issuer, audience (our client id), expiry, nonce, and `email_verified`.
- Facebook: the code is exchanged server-side, the token is checked with `debug_token` (our app id, valid), and only `id,name,email` are read. Facebook email is never treated as verified on its own.
- Return paths are same-site relative paths only (never `/admin` or auth pages); the check runs on the API and again in the web app.
- Rate limits: sign-up/login/forgot/reset 5 per minute per IP, verify 10, resend 3, social start 60.
- Reset/verify/confirmation tokens are random, stored only as SHA-256 hashes, single use, and expire (reset 1 h, verify 24 h, social confirmation 30 min). A new link retires the older one. A password reset signs out every device.
- Forgot-password answers identically for any address. Codes, tokens and secrets are never logged; audit events (`auth.login`, `auth.register`, `auth.social_link`, `auth.email_verified`, `auth.password_reset`) record the provider name only.

## Database

Migration `20261111000000_social_identities` adds `user_identities` and `pending_social_signups` and the `AuthProvider` enum. Nothing existing is altered.

## Testing

- `apps/api/test/auth-social.integration.test.ts` (needs `TEST_DATABASE_URL`): **mocked providers.** Google tokens are signed with a throwaway RSA key and verified for real; Facebook Graph and Resend are in-process fakes. This proves Torio's handling, not your provider configuration.
- `apps/web/e2e/auth.spec.ts`: pages against a mocked API.
- **Real-provider check (manual, required once per environment):**
  1. Set the env vars and redeploy. `GET /api/v1/auth/config` must show `google: true` / `facebook: true`.
  2. In a private window open `/login`, click *Continue with Google*, pick an account: you should land signed in. Repeat with Facebook. Sign out and sign in again: no second account is created (check `user_identities`).
  3. Try Facebook with an account that has no email, or with Google using an email that already has a password account: you should see the email-confirmation step or *account exists*.
  4. Set `RESEND_API_KEY` + `MAIL_FROM` to test forgot-password and verification for real.
