# Implementation plan (only the work the audit found)

## Slice 1 — provider foundation + WhatsApp Cloud API (this iteration)

1. Schema (additive migration): `ChannelCredential` (encrypted blob, per channel), `ProviderWebhookEvent` (unique `provider+eventKey`, status, error, attempts), `Customer.whatsappOptIn` consent state, `Message.errorCode/errorMessage` for failed sends, `Channel.externalAccountId` (phone-number id) with unique per provider.
2. API: `ChannelCryptoService` (AES-256-GCM, key from `CHANNEL_ENCRYPTION_KEY`), `whatsapp` module: webhook GET verify / POST with HMAC signature check and raw body, idempotent event log, processor creating customer/conversation/message (reusing Inbox), status updates, `connect` with a manually supplied token (safe, validated against Graph API), health check, send text with 24h window enforcement, opt-out handling (STOP).
3. Feature flag: all of it inert and reported "not configured" unless `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` and `CHANNEL_ENCRYPTION_KEY` are set; never simulates a live connection.
4. Tests: signature, dedupe, ingestion, status, window, opt-out, tenant isolation.
5. Docs: setup, credentials, limitations.

## Later slices (not started)

Embedded Signup UI; templates; Messenger/Instagram on the same layer; channel identities and merge; attachments; collision/typing; automation message triggers; AI (blocked on provider key); analytics and metering.
