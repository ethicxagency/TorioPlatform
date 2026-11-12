# Brain imports: website scan

Intelligence (Brain → Intelligence) is where business knowledge comes in. This document covers what exists, what the
operator must do, and the safety rules the scan follows.

## What exists

- **Website scan**: a person enters a public website. A job crawls it in small time-boxed steps, stores what it finds as
  *proposals* (`import_records`), and hands them over for review. Approved entries are added to Brain. Nothing becomes
  active knowledge without approval, and existing Brain content is never overwritten.
- **XML product feed**: connect a feed URL, check it (nothing is stored), review the field mapping and a sample, then
  import its products *for review*. Re-syncing proposes only new or changed products (matched by the feed's own product
  ID), with the change spelled out; approving a changed product updates the matching Brain product by name.
  Disconnecting a feed stops syncing and never removes anything already imported.
- **Meta Catalog**: connect Meta (catalog permissions), choose one of the account's catalogs, preview it, import its products
  for review. Same review, change-only re-sync and disconnect rules as XML feeds. Manual sync only.
- **Not built yet**: Google Merchant Center. The Intelligence page shows them as not connected
  and says why.

## Operator steps (nothing runs automatically)

1. Apply the migrations, in order, to the database (`pnpm db:migrate:status`, then `pnpm db:deploy` when you decide):
   `20261119000000_import_sources`, `20261120000000_import_records` and (Meta Catalog only) `20261121000000_import_source_secrets`. All are additive. Until they are applied the
   Intelligence page works and says scanning is not set up; starting a scan returns 503.
2. Optional, `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`): lets the scan also ask Claude to
   structure what pages say. Every AI entry must name a crawled page and be found in that page's text, or it is dropped.
   Without the key only rule-based extraction runs (JSON-LD products/organisations/FAQs, `<details>` FAQs, policy pages).
3. Optional, `CRON_SECRET` (16+ characters): enables `GET /api/v1/internal/imports/tick` for a scheduler to resume scans
   nobody has open. Without it, scans advance while the Intelligence page is open. No cron is configured in `vercel.json`.

## How a scan runs

`POST …/brain/imports/website` validates the address and creates a job. The page then calls `POST …/jobs/:id/step`
repeatedly; each call fetches a few pages within a time budget and saves progress, so no request runs a whole crawl.
Limits: 15 pages, depth 2, 8 s per page, 1 MB per page, same site only, robots.txt honoured (our agent group, else `*`),
one active scan per store, `TorioBot` user agent.

## Safety rules

- Only `http(s)` on default ports, no credentials, no internal hostnames or private/loopback/link-local/metadata IPs.
- DNS is checked when the connection is made (the address actually used), so rebinding to a private address is refused.
- Redirects are re-checked at every hop and may not leave the site.
- Page text is untrusted. It never becomes an instruction: the AI answer must match a schema and be grounded in the page.
- Every query is scoped to the workspace; another store's job or entry is reported as not found.

## XML feeds

Reads RSS (Google Shopping `g:` fields), Atom and plain `<product>` lists with a small built-in reader: no DTDs or entity
definitions are processed. Limits: 8 MB, 5,000 items, 1,000 proposals per sync, same address rules as website scans.
Fields are matched from the feed's own column names and can be changed in the mapping. A currency override only fills a
missing currency. Items without a name are skipped; duplicates (same ID or name) are ignored; missing prices are flagged.

Scheduled syncs (daily or weekly) run only from `/internal/imports/tick`, i.e. when `CRON_SECRET` is set and a scheduler
calls it. Otherwise use Sync now. Brain holds up to 300 products; extra approved products are reported, not added.

## Meta Catalog

Uses the platform's existing Meta app, redirect URI and encryption key (the same ones the channel connections use), with a
signed state that can only be completed by the catalog import. It asks for `business_management` and `catalog_management`.

**It is off by default.** Meta only grants `catalog_management` to ordinary users after App Review gives the app Advanced
access. Once that is approved, set `META_CATALOG_ENABLED=true`. Until then the card says exactly that and offers no
connect button. Nothing is simulated.

- The long-lived user token is stored only as ciphertext in `import_source_secrets` (channel encryption key) and never sent
  to the browser. Disconnecting deletes it; imported products stay in Brain.
- Only a catalog the connected account can actually see can be chosen, whatever id the browser sends.
- Expired or revoked tokens (Meta code 190) end the sync with "Reconnect" and mark the source; missing permissions and
  rate limits are reported in plain words.
- Products are read 100 at a time, up to 5,000, in bounded steps that continue from a cursor.
- Not verified against Meta's live API: the Graph calls are unit-tested with a fake client only.
