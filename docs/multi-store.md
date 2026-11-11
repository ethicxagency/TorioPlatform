# Multi-store architecture

A **store** is a `Workspace`. One Torio account (`User`) can own and belong to many stores through `WorkspaceMembership`.
Nothing was duplicated: the existing `User`, `Workspace` and `WorkspaceMembership` models are the account, the store and the membership.

## Identity and membership
- `User` is the single global identity (email/password, Google, Facebook). `image` / `imageSource` hold the avatar.
- `WorkspaceMembership (workspaceId, userId)` is unique; roles are `OWNER`, `ADMIN`, `AGENT` (a `MANAGER` role was not added; it needs a permission matrix decision first).
- `UserPreferences.lastActiveWorkspaceId` remembers the active store. Listing stores returns the active one first; if it is gone or no longer a membership, the oldest store is used.

## Isolation
- Every store-owned table already carries `workspaceId`; every store route is `/workspaces/:workspaceId/...` behind `WorkspaceAccessGuard`, which checks the caller's active membership server-side. A store id from the client is never trusted on its own.
- A non-member gets `404`, identical to a store that does not exist.
- Switching stores (`PUT /workspaces/active`) validates membership, persists the choice and the web app drops every cached query except the store list.

## Billing
- `BillingAccount` and `Subscription` are keyed by `workspaceId` (one per store). **Each store has its own subscription**; stores without one are on the built-in Free plan. There is no account-level subscription, so nothing is charged twice and no existing subscription changed.
- Account-level plans or shared billing across stores would need a new owner-level billing entity and a migration of provider customers. That is intentionally not done here.

## Store profile = General Settings
Store setup and Settings → General read and write the same `workspaces` row:

| Onboarding / General | Column |
| --- | --- |
| Store name | `name` |
| Store URL | `slug` (unique, immutable) |
| Currency | `defaultCurrency` |
| Time zone | `reportingTimeZone` |
| Business email | `contactEmail` |
| Phone | `phone` |
| Country / Address / City / State / Postal code | `country` / `addressLine` / `city` / `state` / `postalCode` |
| Industry | `industry` |
| Logo | `logo` |

Creating a store, its OWNER membership, its audit entry and the active-store preference happen in one transaction. Changing currency or time zone changes only defaults and display; stored orders keep their own currency and UTC timestamps.

## Account creation order
`POST /auth/register` and social sign-up create the account only. The first store is created in onboarding (`/onboarding`); the web app sends any signed-in account with no store there, and the API refuses every store-scoped call without a membership. `workspaceName` is still accepted on register for API callers who want a store created at once.
