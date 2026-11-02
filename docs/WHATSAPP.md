# WhatsApp Cloud API (official)

Status: **foundation built, not connected to a live Meta account in this environment.** Everything below was tested
against a fake Graph API, never against Meta. Nothing in Torio shows a connection as working unless Meta accepted the
credentials.

## What works

- **Connect a number** with its Meta _phone number ID_ and a Cloud API access token
  (`POST /workspaces/:id/channels/whatsapp/connect`, `channels:manage`). Torio calls Meta first; only a number Meta
  confirms is saved. The token is encrypted with AES-256-GCM (`ChannelCredential`) and is never returned by any API.
  A number can be connected once, in one workspace.
- **Webhook** `GET/POST /api/v1/webhooks/whatsapp`: verify-token challenge; every POST must carry a valid
  `X-Hub-Signature-256` over the raw body. Each event is stored in `ProviderWebhookEvent` under a unique
  `(provider, eventKey)`, so redeliveries are skipped (idempotent). Failed events stay `FAILED` and
  `WhatsAppWebhookService.retryFailed()` re-runs them.
- **Inbound text** creates/reuses the customer (by phone), the open conversation and the message, through the same
  Inbox tables and realtime events as everything else. Non-text types are stored as a placeholder (media isn't supported yet).
- **Outbound text**: agent replies are sent to Meta and marked `SENT`; delivery/read/failed webhooks update the message
  (never backwards). Failures keep the provider's reason (`failureReason`) and can be retried
  (`POST /workspaces/:id/messages/:messageId/retry`); a message that already has a provider id is never resent.
- **24-hour window**: free-form replies are refused once 24 hours have passed since the customer's last message
  (`Conversation.lastInboundAt`). Replying then needs an approved template, which isn't built yet.
- **Opt-out**: a customer who sends STOP/UNSUBSCRIBE is blocked from further sends until they send START.
- **Health**: `POST /workspaces/:id/channels/:channelId/health` asks Meta, records the result and marks the channel
  `EXPIRED` (token invalid) or `NEEDS_ATTENTION`. It also reports the number's quality rating.

## Required configuration

| Variable                    | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `META_APP_SECRET`           | Signs webhooks (`X-Hub-Signature-256`)                                   |
| `META_WEBHOOK_VERIFY_TOKEN` | Value you enter in Meta's webhook setup                                  |
| `CHANNEL_ENCRYPTION_KEY`    | ≥32 chars; encrypts stored tokens. Rotating it invalidates stored tokens |
| `META_GRAPH_VERSION`        | Optional, default `v21.0`                                                |

Without the first three, the provider list reports WhatsApp as unavailable and the connect endpoint returns 503.
In Meta: create an app with the WhatsApp product, set the webhook callback to `https://<api-host>/api/v1/webhooks/whatsapp`
with your verify token, subscribe to `messages`, and use a (system-user) token with `whatsapp_business_messaging`.

## Not built yet

Meta Embedded Signup; template sync/creation/sending; media; interactive messages; quality-rating monitoring over time;
messaging-limit tracking; processing through the BullMQ worker (events are processed in the API request, with retry
via `retryFailed`); Messenger and Instagram on the same layer (need Meta app review).
