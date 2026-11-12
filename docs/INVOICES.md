# Order invoices

`GET /api/v1/workspaces/:workspaceId/orders/:orderId/invoice` returns a customer invoice as an A4 PDF (`?download=1` sets
`attachment`). Requires `orders:read`. The Order details page has **Print invoice** (hidden frame, browser print dialog, falling
back to a new tab) and **Download invoice (PDF)** in the More menu.

- **Always the live order.** The PDF is rendered on the server from the order, its items and payments, the customer and the
  store's General Settings (name, address, email, phone, optional logo). Totals are the ones frozen on the order; nothing is
  recomputed. The order must belong to the workspace in the URL, otherwise 404 and no number is issued.
- **Identity.** `OrderInvoice` stores only the number and issue date, created the first time the invoice is generated (one per
  order, unique per store). The number comes from `Workspace.invoiceSeq`, incremented in the same transaction as the insert, so
  concurrent requests never duplicate or skip. Reprints keep the number and issue date. Format `INV-00001`, file
  `TORIO-INV-00001.pdf`.
- **Not invented.** No due date, per-line tax/discount, tax number, website, footer text or terms are shown, because Torio does
  not store them. Payment statuses are Paid / Partially paid / Unpaid (there are no refunds). Each recorded payment is listed as
  "Received". Only PNG or JPEG data-URL logos are embedded; remote logo URLs are never fetched while rendering.
- **Rendering.** `pdfkit` with Inter (Latin) and Noto Sans Bengali embedded, so Bengali names shape correctly. Amount in words
  is in `amount-words.ts` (taka and rupee read in lakh/crore).
- **Database.** Needs migration `20261122000000_order_invoices` (new table + `workspaces.invoiceSeq`). Until it is applied the
  endpoint answers 503 with a clear message and nothing else changes.
