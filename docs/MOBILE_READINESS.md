# Mobile readiness (Flutter)

The Flutter app lives at `apps/mobile` (not created yet — Flutter is not installed here and web comes first). It will
be a **client of the same API**; there is no mobile backend.

| Concern               | How Flutter reuses it                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST APIs             | Same `/api/v1` endpoints.                                                                                                                                                                                                    |
| OpenAPI contract      | Generate a Dart client from `apps/api/openapi.json`: `openapi-generator-cli generate -i apps/api/openapi.json -g dart-dio -o apps/mobile/lib/api_client` (or `dart` package generator). Regenerate on every contract change. |
| Authentication        | Login/refresh/logout as documented in API.md. Send `X-Torio-Client: mobile`; store the refresh token in Keychain/Keystore (`flutter_secure_storage`); keep the access token in memory; refresh on 401 / before expiry.       |
| Business logic        | All in the API. The app contains presentation and local caching only.                                                                                                                                                        |
| Workspace permissions | Server enforces them. The app may read the caller's role from `GET /workspaces` to hide controls, never to authorize.                                                                                                        |
| Real-time             | `socket_io_client` against `/realtime` with `auth: { token }`; join `workspace:join`; on `system:resync`/reconnect refetch via REST.                                                                                         |
| Push notifications    | Not built. Plan: device-token table + `notifications` queue/worker sending via FCM (Android) and APNs (iOS); token registration endpoint in the API.                                                                         |

## Needs native/Flutter-specific work

Secure storage, push-notification permission/handling, background/foreground socket lifecycle, deep links, camera/media
picker for message attachments, offline cache, app-store packaging and signing. iOS comes after Android.

## What to keep stable on the API side

Additive changes only within `/api/v1`; breaking changes get `/api/v2`. Error envelope and pagination shape are part of the contract.
