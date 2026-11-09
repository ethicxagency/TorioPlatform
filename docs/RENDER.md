# Deploying Torio on Render

One Render **Web Service** runs the web app and the API on the same domain. `scripts/render-start.mjs`
starts both on internal ports and proxies the public port:

- `/api/*` and `/socket.io/*` go to the NestJS API (WebSockets included, so Inbox live updates work).
- Everything else goes to the Next.js web app.

## Service settings

| Setting        | Value                               |
| -------------- | ----------------------------------- |
| Runtime        | Node (version from `.node-version`) |
| Root directory | _(empty: repository root)_          |
| Build command  | `bash scripts/render-build.sh`      |
| Start command  | `node scripts/render-start.mjs`     |
| Health check   | `/api/v1/health`                    |

Render's default `npm install; npm run build` cannot work: npm does not understand pnpm's `workspace:*`
links. The build script installs pnpm 11 and builds the API and web through turbo.

Database migrations (`prisma migrate deploy`) run at start, before either app. Set `SKIP_MIGRATIONS=true`
to turn that off.

## Environment variables

Required:

- `DATABASE_URL`: the Postgres connection string (Render's internal URL).
- `JWT_ACCESS_SECRET`: at least 32 random characters.

Set automatically from Render's `RENDER_EXTERNAL_URL` unless you set them yourself (set them when you
use a custom domain):

- `WEB_URL`, `CORS_ALLOWED_ORIGINS` (the public URL) and `COOKIE_SECURE=true`.

Optional: `REDIS_URL` (with `REDIS_REQUIRED=true` to make it mandatory), `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `BILLING_PRICE_IDS`, `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`
(`https://<your-domain>/api/v1/channels/meta/callback`), `META_WEBHOOK_VERIFY_TOKEN`, `META_WA_CONFIG_ID`,
`META_GRAPH_VERSION`, `CHANNEL_ENCRYPTION_KEY`, `LOG_LEVEL`. Messenger and Instagram stay "Unavailable" until the
Meta variables are set; see `docs/META_SETUP.md`.

Leave `NEXT_PUBLIC_API_URL` unset: the build script sets it empty so the browser calls the API on the
same domain.

## Not covered

The BullMQ worker (`apps/worker`) is not started by this service. Run it as a separate Render
Background Worker if you need it.
