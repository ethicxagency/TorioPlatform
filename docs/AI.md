# AI infrastructure and orchestration

Torio owns one central AI layer. The platform owner configures providers (OpenAI, Google Gemini) in **Super Admin → AI Management**;
customers use **Inbox → AI Assist** with no keys of their own.

## Where things live

- `apps/api/src/modules/ai/`: providers (`providers/*.adapter.ts`), `ai-registry.ts`, `ai-config.service.ts` (settings, providers, models,
  encrypted keys), `ai-orchestrator.service.ts` (the engine), `context.ts` (prompt from Brain), `evaluator.ts`, `validator.ts`,
  `synthesis.ts`, `circuit-breaker.ts`, `ai-admin.service.ts` (admin operations, usage, logs), `ai.controller.ts`.
- `packages/contracts/src/ai.ts`: shared schemas, modes, phases, default settings.
- Web: `features/admin/components/ai-management.tsx` (`/admin/ai`), `features/inbox/components/ai-assist-panel.tsx`.
- Tables (migration `20261123000000_ai_orchestration`): `ai_providers`, `ai_models`, `ai_requests`, `ai_calls`. Non-secret settings
  are one `platform_settings` row, `ai.settings`.

## Keys

Saved server-side only, sealed with `CHANNEL_ENCRYPTION_KEY` (AES-256-GCM, the same scheme as channel tokens; rotation works the
same way). Responses carry only `hasKey` and a mask with the last four characters. Saving, replacing and removing a key are written
to the admin audit log without the key. A connection test runs on the server and returns a category, never provider text. Without
`CHANNEL_ENCRYPTION_KEY` keys cannot be saved.

## The engine

1. **Context.** One normalised prompt from the store's Brain (business, the most relevant products and FAQs, shipping and payment,
   returns, voice, custom instructions, rules) plus the last N messages. Only the customer's first name is sent; no email, phone
   or order data. The conversation is marked untrusted. Internal notes are never included.
2. **Strategies.** `single` (OpenAI or Gemini), `auto` (default provider, with a second opinion from the other when the first
   answer scores below the review threshold), `synthesis` (independent candidates in parallel, compared, merged by a configurable
   provider). Fallback to another enabled provider is optional. Refinements (shorter, more detail, tone, translate) are one call.
3. **Evaluation.** Weighted, configurable heuristics: relevance, knowledge accuracy, instruction compliance, completeness, clarity,
   safety. Knowledge accuracy only checks that figures (amounts, delivery times, percentages) appear in the Brain text. These are
   internal signals, not a measure of truth. When two candidates disagree on a figure the Brain does not hold, or both state one the
   Brain lacks, the synthesis step is told to leave it out. Agreement is not treated as proof.
4. **Validation.** Blocks replies that expose internal text or key-like strings, trims to the channel limit, flags ungrounded
   figures, banned terms, promises when forbidden, and language mismatches. Flagged drafts show "Please review".
5. **Draft only.** The result is a draft in the composer area. Nothing is sent.

## Reliability and cost

Per-provider request timeout, bounded retries with exponential backoff and jitter (only timeouts, rate limits and outages; never
authentication or bad-request errors), an in-memory circuit breaker, a concurrency limit per workspace, and idempotent request ids
(a repeated id is refused, not billed twice). Every call is recorded (`ai_calls`): provider, model, tokens, latency, retries,
outcome category. **Cost is an estimate** from the per-million-token prices entered on the Models tab; no price means no cost is
shown. Logs hold metadata only, never customer messages or drafts, and are purged after the retention period.

## Brain "Test AI"

The Test AI tab keeps its rules-based preview as the default (free, no model). "Live AI" asks the same engine through
`POST /workspaces/:id/ai/test` (needs `brain:read`) with the Brain being edited (validated against the Brain schema, so unsaved edits
are tested) and the test chat (at most 20 lines). It follows the same plan allowance, budgets and logging as Inbox AI Assist, stores no
text, and is offered only when AI is available for the workspace.

## Plan allowances and budgets

Nothing is assumed unlimited. AI is **not included** for any plan until **Limits & Budgets** gives it an allowance (a plan with no
row of its own uses the default row; a workspace without an active subscription counts as `free`). Per plan: included, drafts per
month, tokens per month (empty = no cap), Multi-AI synthesis allowed, concurrent requests, and the largest prompt in characters
(older messages are dropped to fit; the latest is always kept). Allowances reset on the 1st (UTC) and are counted from the recorded
requests.

Budgets (USD per month; the cost is an estimate from the entered model prices, so it is a lower bound if prices are missing):
platform, per workspace, per provider, and a requests-per-minute limit per provider. At the limit the policy is **Stop AI** or
**Only alert**. A provider over its own limit is skipped so another can serve the request. Alerts appear on the AI overview at the
configured percentage and again at the limit. Customers see a clear message (not included, allowance used up, paused for the month)
and how many drafts are left.

## Not built yet

Per-workspace overrides of plan allowances, email or push alerts for budgets, structured-output/tool-calling capability flags and
background job processing for long runs. The data model supports adding them.

## Testing

Unit tests use fake adapters and SDK mocks (`pnpm --filter @torio/api test`). `test/ai.integration.test.ts` needs
`TEST_DATABASE_URL` with the migration applied. No live OpenAI or Gemini call has been made: that needs real keys saved through
the admin page and a connection test.
