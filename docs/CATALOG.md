# Products & Catalog

The catalog is a view over the product records Brain (the Intelligent page) already holds in `BrainConfig.data.products`.
There is no second product table: one product, one id, and an edit in either place is the same edit.

## Data

- Brain products gained optional catalog fields: `status` (ACTIVE/DRAFT/ARCHIVED; absent = ACTIVE), `source` (MANUAL, XML_IMPORT,
  FEED, INTELLIGENT, CHANNEL; absent = INTELLIGENT), `sku`, `compareAtPrice`, `images`, `url`, `brand`, `gtin`, `mpn`,
  `stockQty`, `externalId`, `sourceId`, `createdAt`, `edited` (fields changed by hand). Old documents stay valid. Limit: 1000 products.
- Prices stay text in Brain's format (`"1450 BDT"`); the catalog parses them.
- All writes go through `BrainService.mutateProducts`: same version counter as Brain, retried on a clash, never overwrites.
  A Brain page save made from an older copy gets Brain's usual 409.
- Prisma: `catalog_feeds` (outbound feeds). Migration `20261130000000_catalog_feeds` is additive. Imports reuse `import_sources`
  / `import_jobs`; saved catalog feeds are `XML_FEED` sources with `config.direct = true` and are hidden from Brain's review flow.

## Permissions

`catalog:read`, `catalog:write`, `catalog:delete`, `catalog:import`, `catalog:feeds` (feeds and Sales Channels; the secret
feed addresses are only returned to this permission). Owners/Admins have all; Agents `catalog:read`.

## API (`/api/v1/workspaces/:id/catalog`)

`GET products|stats|products/:id|feeds|activity`, `POST/PUT products`, `POST products/bulk-status|bulk-delete`,
`POST import/preview|import`, `POST feeds/:id/sync|pause|resume`, `PATCH/DELETE feeds/:id`,
`GET channels`, `POST channels/feeds`, `PATCH/DELETE channels/feeds/:id`, `POST channels/feeds/:id/rotate`, `GET channels/feeds/:id/preview`.
Public: `GET /api/v1/catalog-feed/<token>.xml`. Scheduler: `GET /api/v1/internal/catalog/tick` (needs `CRON_SECRET`); a 15-minute timer also runs where the API is long-lived.

## Import rules

- URL fetch: http(s) only, standard ports, no credentials, private/loopback/link-local blocked at DNS time and on redirects,
  8 MB cap, 20 s timeout, content-type filter. File upload: 6 MB. Parsing never resolves DTDs/entities (XXE-safe); markup in
  text is stripped; only http(s) image/links are kept.
- Duplicates matched by feed ID (same source), then SKU, then title. Re-running a feed changes nothing.
- "Update" only touches products a feed owns (FEED/XML_IMPORT) and skips fields in `edited`. Hand-made and Intelligent
  products are never overwritten. Empty feed values never blank existing data.
- Deleting a product a live feed owns archives it instead (the next sync would re-add it). Order lines keep their own snapshot.
- Products removed from the external feed are left alone; external data is never touched.

## Outbound feeds

Google and Meta use RSS with the `g:` namespace, TikTok the same format (best effort), plus a custom XML format. Only ACTIVE products
with title, price+currency (workspace default currency as fallback), link and image are published; others are listed with the reason in
the preview. The token is 256 bits, stored as a hash (lookup) and encrypted (so it can be shown again); rotate/pause/delete stop the old
address at once. Torio cannot see whether a channel fetched or accepted a feed, so nothing is shown as "connected" for feeds.
Meta/Google catalogs connected on the Intelligent page are listed read-only. Meta Pixel is separate from a Meta catalog.

## Known limits

No variant records (variants/sizes/colours stay text), no automatic Meta/TikTok/Google push, no import of images (remote URLs only),
no removal of products that disappear from a feed, catalog size is bound by the Brain document (1000 products).
