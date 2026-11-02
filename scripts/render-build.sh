#!/usr/bin/env bash
# Render build for the unified Torio service (web + API on one domain).
# Render's default `npm install` can't read pnpm's workspace:* links, so install pnpm first.
set -euo pipefail

npm install -g pnpm@11.17.0
# Dev dependencies (turbo, typescript, Nest CLI, Prisma) are needed to build, even with NODE_ENV=production.
pnpm install --frozen-lockfile --prod=false
# Empty API origin: the browser calls /api/v1/... on the same domain, which the start script proxies to the API.
NEXT_PUBLIC_API_URL= pnpm exec turbo run build --filter=@torio/api --filter=@torio/web
