import { formatCurrency } from '@torio/contracts';
import PDFDocument from 'pdfkit';
import { INVOICE_FONTS } from './invoice-fonts';
import type { InvoiceData, InvoicePaymentStatus } from './invoice-types';

// Torio brand.
const PRIMARY = '#5B5CE2';
const INK = '#17181C';
const MUTED = '#62656D';
const LINE = '#E5E7EB';
const TINT = '#F0F0FF';

const PAGE = { w: 595.28, h: 841.89 };
const M = 44; // side and top margin
const FOOTER_H = 44; // reserved at the bottom of every page
const BOTTOM = PAGE.h - FOOTER_H - 12;
const CONTENT_W = PAGE.w - M * 2;

const STATUS: Record<InvoicePaymentStatus, { label: string; fg: string; bg: string }> = {
  PAID: { label: 'PAID', fg: '#166534', bg: '#EAF8EF' },
  PARTIALLY_PAID: { label: 'PARTIALLY PAID', fg: '#92560A', bg: '#FFF5E4' },
  UNPAID: { label: 'UNPAID', fg: '#991B1B', bg: '#FDEBEB' },
};

const fonts = () => INVOICE_FONTS;

type Weight = 'regular' | 'semi' | 'bold';
const BENGALI = /[ঀ-৿‌‍]+/g;
const fontName = (bengali: boolean, w: Weight) =>
  bengali
    ? w === 'bold' || w === 'semi'
      ? 'Bengali-Bold'
      : 'Bengali'
    : w === 'bold'
      ? 'Inter-Bold'
      : w === 'semi'
        ? 'Inter-Semi'
        : 'Inter';

/** Splits text into Bengali and non-Bengali runs, because each script lives in its own embedded font. */
function runs(text: string): { text: string; bengali: boolean }[] {
  const out: { text: string; bengali: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(BENGALI)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bengali: false });
    out.push({ text: m[0], bengali: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bengali: false });
  return out.length ? out : [{ text, bengali: false }];
}

interface TextOpts {
  width?: number;
  size?: number;
  weight?: Weight;
  color?: string;
  align?: 'left' | 'right' | 'center';
  lineGap?: number;
}

interface Piece {
  text: string;
  bengali: boolean;
  w: number;
}
const LINE_GAP = 2;

class Pen {
  constructor(readonly doc: PDFKit.PDFDocument) {}

  private measure(text: string, bengali: boolean, size: number, weight: Weight) {
    return this.doc.font(fontName(bengali, weight)).fontSize(size).widthOfString(text);
  }

  /**
   * Greedy word wrap that measures every Bengali and non-Bengali run in its own font, so a name that mixes scripts wraps
   * and aligns correctly (the PDF library cannot switch fonts inside one wrapped paragraph).
   */
  private layout(text: string, width: number | undefined, size: number, weight: Weight): Piece[][] {
    const lines: Piece[][] = [];
    const paragraphs = text.split(/\r?\n/);
    for (const para of paragraphs) {
      let line: Piece[] = [];
      let lw = 0;
      const words = para.split(/(\s+)/).filter((w) => w !== '');
      for (const word of words) {
        const isSpace = /^\s+$/.test(word);
        const pieces: Piece[] = (isSpace ? [{ text: ' ', bengali: false }] : runs(word)).map(
          (r) => ({
            ...r,
            w: this.measure(r.text, r.bengali, size, weight),
          }),
        );
        const ww = pieces.reduce((n, p) => n + p.w, 0);
        if (width && lw + ww > width && line.length && !isSpace) {
          while (line.length && /^ $/.test(line[line.length - 1]!.text)) line.pop();
          lines.push(line);
          line = [];
          lw = 0;
        }
        if (isSpace && !line.length) continue;
        // A single word wider than the column is split by character so it never runs off the page.
        if (width && ww > width && !isSpace) {
          for (const ch of Array.from(word)) {
            const piece = {
              text: ch,
              bengali: /[\u0980-\u09FF]/.test(ch),
              w: this.measure(ch, /[\u0980-\u09FF]/.test(ch), size, weight),
            };
            if (lw + piece.w > width && line.length) {
              lines.push(line);
              line = [];
              lw = 0;
            }
            line.push(piece);
            lw += piece.w;
          }
          continue;
        }
        line.push(...pieces);
        lw += ww;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Writes text at (x, y). */
  text(text: string, x: number, y: number, o: TextOpts = {}) {
    const { doc } = this;
    const size = o.size ?? 9;
    const weight = o.weight ?? 'regular';
    const lineH = size * 1.2 + (o.lineGap ?? LINE_GAP);
    const lines = this.layout(text, o.width, size, weight);
    doc.fillColor(o.color ?? INK).fontSize(size);
    lines.forEach((line, i) => {
      const lw = line.reduce((n, p) => n + p.w, 0);
      let cx = x;
      if (o.width && o.align === 'right') cx = x + o.width - lw;
      else if (o.width && o.align === 'center') cx = x + (o.width - lw) / 2;
      for (const p of line) {
        doc.font(fontName(p.bengali, weight)).text(p.text, cx, y + i * lineH, {
          lineBreak: false,
        });
        cx += p.w;
      }
    });
  }

  height(text: string, o: TextOpts = {}): number {
    const size = o.size ?? 9;
    const lineH = size * 1.2 + (o.lineGap ?? LINE_GAP);
    return (
      this.layout(text, o.width, size, o.weight ?? 'regular').length * lineH -
      (o.lineGap ?? LINE_GAP)
    );
  }

  width(text: string, o: TextOpts = {}): number {
    const size = o.size ?? 9;
    return this.layout(text, undefined, size, o.weight ?? 'regular')
      .flat()
      .reduce((n, p) => n + p.w, 0);
  }
}

const dateOf = (d: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: tz,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
};

/** Amount with its ISO code ("BDT 24,500.00"): the same figures the order screens show, always with decimals. */
const money = (minor: number, currency: string) =>
  formatCurrency(minor, currency, { display: 'code', decimals: 'always' });

/**
 * Renders an A4 portrait invoice. The item table repeats its header on every page, the totals block is kept together, and
 * each page carries a footer with its page number.
 */
export function renderOrderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: M, left: M, right: M },
      bufferPages: true,
      // Start from an embedded font: the library's own default (Helvetica) loads data files that a single-file bundle lacks.
      font: Buffer.from(INVOICE_FONTS.Inter!, 'base64') as unknown as string,
      info: {
        Title: `Invoice ${d.number}`,
        Author: d.seller.name,
        Subject: `Invoice for order #${d.orderNumber}`,
        Creator: 'Torio',
        Producer: 'Torio',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const f = fonts();
      for (const [name, b64] of Object.entries(f))
        doc.registerFont(name, Buffer.from(b64, 'base64'));
      draw(doc, new Pen(doc), d);
      doc.end();
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Could not render the invoice'));
    }
  });
}

function draw(doc: PDFKit.PDFDocument, pen: Pen, d: InvoiceData) {
  const cur = d.currency;
  let y = M;

  // ---------- header ----------
  let leftBottom = y;
  if (d.seller.logo) {
    try {
      doc.image(d.seller.logo, M, y, { fit: [150, 46] });
      leftBottom = y + 46;
    } catch {
      d.seller.logo = null;
    }
  }
  if (!d.seller.logo) {
    pen.text(d.seller.name, M, y + 4, { size: 17, weight: 'bold', width: 290 });
    leftBottom = y + 4 + pen.height(d.seller.name, { size: 17, weight: 'bold', width: 290 });
  }
  const rightX = PAGE.w - M - 220;
  pen.text('INVOICE', rightX, y, { size: 22, weight: 'bold', width: 220, align: 'right' });
  pen.text(`# ${d.number}`, rightX, y + 29, {
    size: 11,
    weight: 'semi',
    color: PRIMARY,
    width: 220,
    align: 'right',
  });
  // status badge
  const st = STATUS[d.paymentStatus];
  const badges = [
    st,
    ...(d.orderCancelled ? [{ label: 'ORDER CANCELLED', fg: '#62656D', bg: '#F1F2F5' }] : []),
  ];
  let bx = PAGE.w - M;
  const by = y + 48;
  for (const b of badges) {
    const w = pen.width(b.label, { size: 7.5, weight: 'bold' }) + 16;
    bx -= w;
    doc.roundedRect(bx, by, w, 17, 8.5).fill(b.bg);
    pen.text(b.label, bx, by + 5, {
      size: 7.5,
      weight: 'bold',
      color: b.fg,
      width: w,
      align: 'center',
    });
    bx -= 6;
  }
  y = Math.max(leftBottom, by + 17) + 18;
  doc
    .moveTo(M, y)
    .lineTo(PAGE.w - M, y)
    .lineWidth(1.5)
    .strokeColor(PRIMARY)
    .stroke();
  y += 18;

  // ---------- parties ----------
  const cols = d.shipTo ? 3 : 2;
  const gap = 20;
  const colW = (CONTENT_W - gap * (cols - 1)) / cols;
  const block = (title: string, head: string, lines: string[], x: number) => {
    pen.text(title, x, y, { size: 7.5, weight: 'bold', color: PRIMARY, width: colW });
    let yy = y + 13;
    if (head) {
      pen.text(head, x, yy, { size: 10, weight: 'bold', width: colW });
      yy += pen.height(head, { size: 10, weight: 'bold', width: colW }) + 2;
    }
    for (const l of lines) {
      pen.text(l, x, yy, { size: 9, color: MUTED, width: colW });
      yy += pen.height(l, { size: 9, width: colW }) + 1;
    }
    return yy;
  };
  const sellerLines = [
    ...d.seller.lines,
    ...(d.seller.email ? [d.seller.email] : []),
    ...(d.seller.phone ? [d.seller.phone] : []),
  ];
  const billLines = [
    ...(d.billTo.company ? [d.billTo.company] : []),
    ...d.billTo.lines,
    ...(d.billTo.email ? [d.billTo.email] : []),
    ...(d.billTo.phone ? [d.billTo.phone] : []),
  ];
  const ends = [
    block('FROM', d.seller.logo ? d.seller.name : '', sellerLines, M),
    block('BILL TO', d.billTo.name, billLines, M + colW + gap),
  ];
  if (d.shipTo) ends.push(block('SHIP TO', d.billTo.name, d.shipTo, M + (colW + gap) * 2));
  y = Math.max(...ends) + 16;

  // ---------- meta strip ----------
  const meta: [string, string][] = [
    ['Invoice date', dateOf(d.issuedAt, d.timeZone)],
    ['Order date', dateOf(d.orderDate, d.timeZone)],
    ['Order number', `#${d.orderNumber}`],
    ['Currency', cur],
  ];
  const mh = 40;
  doc.roundedRect(M, y, CONTENT_W, mh, 8).lineWidth(0.75).strokeColor(LINE).stroke();
  const mw = CONTENT_W / meta.length;
  meta.forEach(([k, v], i) => {
    const x = M + mw * i + 14;
    pen.text(k, x, y + 8, { size: 7.5, color: MUTED, width: mw - 16 });
    pen.text(v, x, y + 20, { size: 10, weight: 'semi', width: mw - 16 });
    if (i > 0)
      doc
        .moveTo(M + mw * i, y + 8)
        .lineTo(M + mw * i, y + mh - 8)
        .lineWidth(0.75)
        .strokeColor(LINE)
        .stroke();
  });
  y += mh + 20;

  // ---------- items table ----------
  const c = {
    n: { x: M + 10, w: 20 },
    item: { x: M + 36, w: 0 },
    sku: { x: 0, w: 78 },
    qty: { x: 0, w: 34 },
    unit: { x: 0, w: 82 },
    total: { x: 0, w: 84 },
  };
  c.total.x = PAGE.w - M - 10 - c.total.w;
  c.unit.x = c.total.x - 10 - c.unit.w;
  c.qty.x = c.unit.x - 10 - c.qty.w;
  c.sku.x = c.qty.x - 10 - c.sku.w;
  c.item.w = c.sku.x - 10 - c.item.x;

  const tableHeader = () => {
    doc.roundedRect(M, y, CONTENT_W, 24, 6).fill(PRIMARY);
    const h = (t: string, col: { x: number; w: number }, align: 'left' | 'right' = 'left') =>
      pen.text(t, col.x, y + 8, { size: 8, weight: 'bold', color: '#FFFFFF', width: col.w, align });
    h('#', c.n);
    h('ITEM', c.item);
    h('SKU', c.sku);
    h('QTY', c.qty, 'right');
    h('UNIT PRICE', c.unit, 'right');
    h('TOTAL', c.total, 'right');
    y += 24;
  };
  const newPage = () => {
    doc.addPage();
    y = M;
  };
  tableHeader();
  d.items.forEach((it, i) => {
    const nameH = pen.height(it.name, { size: 9.5, weight: 'semi', width: c.item.w });
    const rowH = Math.max(nameH, 12) + 16;
    if (y + rowH > BOTTOM) {
      newPage();
      tableHeader(); // headers repeat on every page
    }
    pen.text(String(i + 1), c.n.x, y + 8, { size: 9, color: MUTED, width: c.n.w });
    pen.text(it.name, c.item.x, y + 8, { size: 9.5, weight: 'semi', width: c.item.w });
    pen.text(it.sku ?? '—', c.sku.x, y + 8, { size: 8.5, color: MUTED, width: c.sku.w });
    pen.text(String(it.quantity), c.qty.x, y + 8, { size: 9, width: c.qty.w, align: 'right' });
    pen.text(money(it.unitMinor, cur), c.unit.x - 10, y + 8, {
      size: 9,
      width: c.unit.w + 10,
      align: 'right',
    });
    pen.text(money(it.totalMinor, cur), c.total.x - 10, y + 8, {
      size: 9,
      weight: 'semi',
      width: c.total.w + 10,
      align: 'right',
    });
    y += rowH;
    doc
      .moveTo(M, y)
      .lineTo(PAGE.w - M, y)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
  });
  y += 18;

  // ---------- summary (kept together) ----------
  const t = d.totals;
  const rows: { k: string; v: string; strong?: boolean; tint?: boolean }[] = [
    { k: 'Subtotal', v: money(t.subtotalMinor, cur) },
    ...(t.discountMinor > 0 ? [{ k: 'Discount', v: `-${money(t.discountMinor, cur)}` }] : []),
    ...(t.shippingMinor > 0 ? [{ k: 'Shipping', v: money(t.shippingMinor, cur) }] : []),
    ...(t.taxMinor > 0 ? [{ k: 'Tax', v: money(t.taxMinor, cur) }] : []),
    { k: 'Total', v: money(t.totalMinor, cur), strong: true },
    ...(t.paidMinor > 0 ? [{ k: 'Total paid', v: `-${money(t.paidMinor, cur)}` }] : []),
    { k: 'Amount due', v: money(t.dueMinor, cur), strong: true, tint: true },
  ];
  const sumW = 250;
  const sumH = rows.length * 24 + 8 + 34;
  if (y + sumH > BOTTOM) newPage();
  const sx = PAGE.w - M - sumW;
  rows.forEach((r, i) => {
    const ry = y + i * 24;
    if (r.tint) doc.roundedRect(sx, ry, sumW, 28, 6).fill(TINT);
    const ty = ry + (r.tint ? 9 : 6);
    pen.text(r.k, sx + 12, ty, {
      size: r.tint ? 10 : 9,
      weight: r.strong ? 'bold' : 'regular',
      color: r.strong ? INK : MUTED,
      width: 110,
    });
    pen.text(r.v, sx + 100, ty, {
      size: r.tint ? 11.5 : 9.5,
      weight: r.strong ? 'bold' : 'regular',
      color: r.tint ? PRIMARY : INK,
      width: sumW - 112,
      align: 'right',
    });
  });
  y += rows.length * 24 + 12;
  // amount in words
  pen.text('Amount in words', M, y, {
    size: 7.5,
    weight: 'bold',
    color: PRIMARY,
    width: CONTENT_W,
  });
  pen.text(d.words, M, y + 12, { size: 9.5, weight: 'semi', width: CONTENT_W });
  y += 12 + pen.height(d.words, { size: 9.5, weight: 'semi', width: CONTENT_W }) + 22;

  // ---------- transactions ----------
  const need = 70;
  if (y + need > BOTTOM) newPage();
  pen.text('Payment transactions', M, y, { size: 10.5, weight: 'bold', width: CONTENT_W });
  y += 20;
  if (!d.payments.length) {
    pen.text('No payments have been recorded for this order.', M, y, { size: 9, color: MUTED });
    y += 18;
  } else {
    const pc = [
      { k: 'Reference', x: M, w: 150 },
      { k: 'Method', x: M + 160, w: 110 },
      { k: 'Date', x: M + 280, w: 80 },
      { k: 'Status', x: M + 370, w: 60 },
      { k: 'Amount', x: PAGE.w - M - 100, w: 100 },
    ];
    const head = () => {
      pc.forEach((col) =>
        pen.text(col.k.toUpperCase(), col.x, y, {
          size: 7.5,
          weight: 'bold',
          color: MUTED,
          width: col.w,
          align: col.k === 'Amount' ? 'right' : 'left',
        }),
      );
      y += 14;
      doc
        .moveTo(M, y)
        .lineTo(PAGE.w - M, y)
        .lineWidth(0.75)
        .strokeColor(MUTED)
        .stroke();
      y += 7;
    };
    head();
    for (const p of d.payments) {
      const ref = p.reference ?? '—';
      const h = Math.max(pen.height(ref, { size: 9, width: pc[0]!.w }), 11) + 12;
      if (y + h > BOTTOM) {
        newPage();
        head();
      }
      const cells = [
        ref,
        p.method,
        dateOf(p.paidAt, d.timeZone),
        'Received',
        money(p.amountMinor, cur),
      ];
      cells.forEach((v, i) =>
        pen.text(v, pc[i]!.x, y, {
          size: 9,
          weight: i === 4 ? 'semi' : 'regular',
          width: pc[i]!.w,
          align: i === 4 ? 'right' : 'left',
        }),
      );
      y += h;
      doc
        .moveTo(M, y - 5)
        .lineTo(PAGE.w - M, y - 5)
        .lineWidth(0.5)
        .strokeColor(LINE)
        .stroke();
    }
  }

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  const contact = [d.seller.email, d.seller.phone].filter(Boolean).join('  ·  ');
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // writing in the margin must not start a new page
    const fy = PAGE.h - FOOTER_H + 6;
    doc
      .moveTo(M, fy - 8)
      .lineTo(PAGE.w - M, fy - 8)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
    pen.text(contact ? `Questions about this invoice? ${contact}` : d.seller.name, M, fy, {
      size: 8,
      color: MUTED,
      width: CONTENT_W - 110,
    });
    pen.text(`Page ${i + 1} of ${range.count}`, PAGE.w - M - 100, fy, {
      size: 8,
      color: MUTED,
      width: 100,
      align: 'right',
    });
    pen.text(`Invoice ${d.number}`, M, fy + 12, { size: 7.5, color: '#9A9DA6', width: 300 });
  }
}
