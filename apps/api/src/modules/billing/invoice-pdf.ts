import { formatCurrency } from '@torio/contracts';

// The PDF font is ASCII-only, so amounts carry the ISO code ("BDT 1,500") instead of a symbol like ৳.
const formatMoney = (minor: number, currency: string) =>
  formatCurrency(minor, currency, { display: 'code' });

export interface PdfInvoice {
  number: string;
  issuedAt: Date;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  planName: string | null;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentSummary: string | null;
  customer: Record<string, string | null> | null;
  lines: { description: string; quantity: number; amountMinor: number }[];
  seller: { name: string; note: string };
}

const esc = (s: string) =>
  s
    .replace(/[^\x20-\x7E]/g, '?') // Helvetica (WinAnsi) only; non-ASCII is replaced, never dropped silently
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '-');

/**
 * A minimal, valid single-page PDF built from the stored invoice record (no template engine or dependency).
 * The content is exactly what is in the database; nothing is invented.
 */
export function renderInvoicePdf(inv: PdfInvoice): Buffer {
  const rows: { text: string; size: number; bold?: boolean; gap?: number }[] = [];
  const add = (text: string, size = 10, bold = false, gap = 0) =>
    rows.push({ text, size, bold, gap });
  add(inv.seller.name, 18, true);
  add(inv.seller.note, 8, false, 10);
  add(`Invoice ${inv.number}`, 14, true, 6);
  add(`Date: ${day(inv.issuedAt)}    Status: ${inv.status}`);
  add(`Billing period: ${day(inv.periodStart)} to ${day(inv.periodEnd)}`);
  if (inv.planName) add(`Plan: ${inv.planName}`);
  add('Bill to', 11, true, 10);
  const c = inv.customer ?? {};
  for (const v of [
    c.companyName,
    c.contactName,
    c.addressLine,
    [c.city, c.state, c.postalCode].filter(Boolean).join(' '),
    c.country,
    c.billingEmail,
    c.taxId ? `Tax ID: ${c.taxId}` : null,
  ])
    if (v) add(String(v));
  add('Items', 11, true, 10);
  for (const l of inv.lines)
    add(
      `${l.quantity} x ${l.description.slice(0, 70)}    ${formatMoney(l.amountMinor, inv.currency)}`,
    );
  add(`Subtotal: ${formatMoney(inv.subtotalMinor, inv.currency)}`, 10, false, 10);
  add(`Tax: ${formatMoney(inv.taxMinor, inv.currency)}`);
  add(`Total: ${formatMoney(inv.totalMinor, inv.currency)}`, 12, true);
  if (inv.paymentSummary) add(`Payment: ${inv.paymentSummary}`, 10, false, 6);

  let y = 800;
  const content = rows
    .map((r) => {
      y -= r.size + 5 + (r.gap ?? 0);
      return `BT /${r.bold ? 'F2' : 'F1'} ${r.size} Tf 50 ${y} Td (${esc(r.text)}) Tj ET`;
    })
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
