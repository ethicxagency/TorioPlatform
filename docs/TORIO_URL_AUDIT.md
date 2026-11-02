# Torio URL audit

Checked from source (every `href`, `router.push`/`replace`, nav config) on 2026-11-01. "Verified" means exercised by
an end-to-end test (`apps/web/e2e/routes.spec.ts` plus the existing specs); anything else says so.

## Routes that exist (`apps/web/src/app`)

`/`, `/inbox`, `/leads`, `/customers`, `/orders`, `/team`, `/channels`, `/automation`, `/automation/[id]`, `/brain`,
`/billing`, `/status`, `/settings` and `/settings/{profile,preferences,security,notifications,workspace,members,channels,privacy,audit}`,
`/login`, `/accept-invite`, `/admin`, `/admin/{login,workspaces,customers,subscriptions,plans,activity,settings}`.

## Internal links

| Link source                                                                                                   | Destination                                                         | Status                                                    | Fix                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Main sidebar (10 items + Inbox channel shortcuts)                                                             | `/`, `/inbox`, `/inbox?channel=WHATSAPP                             | INSTAGRAM                                                 | MESSENGER`, `/leads`, `/customers`, `/orders`, `/team`, `/channels`, `/automation`, `/brain`, `/settings` | Verified (every link opened, no 404) | —   |
| Settings overview cards (10)                                                                                  | `/settings/*`, `/billing`                                           | Verified                                                  | —                                                                                                         |
| Settings detail breadcrumb                                                                                    | `/settings` (asks before discarding unsaved edits)                  | Verified                                                  | —                                                                                                         |
| Dashboard widget actions ("Open Inbox →", "View Leads", "View Orders", attention items, recent conversations) | `/inbox`, `/leads`, `/orders`, `/channels`, `/team`, `/brain`       | Verified for Recent Orders; others share the same handler | **Fixed**: they showed "isn't available yet" toasts; now navigate                                         |
| Dashboard order drawer ("Open in Orders", "Message customer", customer channel)                               | `/orders`, `/inbox`                                                 | Verified                                                  | **Fixed**: were `href="#"` toasts                                                                         |
| Dashboard Needs Attention                                                                                     | `/inbox?conversation=<id>`, `/inbox?channel=…`, `/leads`, `/orders` | Verified (query params read by Inbox)                     | —                                                                                                         |
| Conversation Overview "Open Inbox"                                                                            | `/inbox` + channel filter                                           | Verified                                                  | —                                                                                                         |
| Orders → customer                                                                                             | `/customers?customer=<id>`                                          | Param read by Customers page; not separately tested       | —                                                                                                         |
| Customers/Leads → conversation                                                                                | `/inbox?conversation=<id>`                                          | Param read by Inbox                                       | —                                                                                                         |
| Channels → inbox                                                                                              | `/inbox?channel=<provider>`                                         | Verified by channels spec                                 | —                                                                                                         |
| Automation list → detail                                                                                      | `/automation/<id>`                                                  | Verified by automation spec                               | —                                                                                                         |
| Account menu                                                                                                  | `/settings/profile`, `/settings/workspace`                          | Exist; not separately tested                              | —                                                                                                         |
| 404 page                                                                                                      | `/`                                                                 | Verified                                                  | —                                                                                                         |
| Unauthenticated access                                                                                        | redirect to `/login`                                                | Verified (existing spec)                                  | —                                                                                                         |
| Super Admin nav                                                                                               | `/admin/*`                                                          | Verified by admin spec                                    | —                                                                                                         |

## Hardcoded hosts

- No `localhost`/`127.0.0.1` in any rendered link (asserted on `/`, `/settings`, `/inbox`, `/orders`).
- `apps/web/src/lib/env.ts` falls back to `http://localhost:4000` when `NEXT_PUBLIC_API_URL` is unset. This is the
  API base for local development, not a navigation link. **Production must set `NEXT_PUBLIC_API_URL`.**
- Tests and docs reference `localhost` legitimately; unchanged.

## External URLs

None are rendered in the customer portal. There are no Terms of Service, Privacy Policy, Help Center or
documentation URLs in the project, so none were added (no invented links).

## Remaining

| Control                       | Behaviour                                   | Why                                                  |
| ----------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Top bar **Help**              | Toast "This action isn't available yet"     | No help/support destination exists; needs a real URL |
| Top bar **Notifications**     | Same toast                                  | Notifications aren't built                           |
| Settings → Notifications card | Opens a page that says delivery isn't built | Labelled "Soon"                                      |
