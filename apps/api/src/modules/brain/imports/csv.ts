import { FAQ_CATS } from '@torio/contracts';
import type { RawItem } from './xml';

/** A small RFC 4180 reader: quoted fields, doubled quotes, embedded newlines, a BOM, and comma, semicolon or tab delimiters. */

export const MAX_CSV_BYTES = 2_500_000;
export const MAX_CSV_ROWS = 5000;
const MAX_COLUMNS = 60;

export function parseCsv(input: string): string[][] {
  const text = input.startsWith(String.fromCharCode(0xfeff)) ? input.slice(1) : input;
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  // the delimiter is whichever of the usual three appears most in the header line (outside quotes is close enough here)
  const delim = [',', ';', '\t']
    .map((d) => [d, first.split(d).length - 1] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push(row.slice(0, MAX_COLUMNS));
    row = [];
  };
  for (let i = 0; i < text.length && rows.length <= MAX_CSV_ROWS; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) endCell();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** Header names as mapping keys: lower case, words joined by underscores ("Product Name" → product_name), made unique. */
export function headerKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base =
      h
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

export interface CsvTable {
  headers: string[];
  items: RawItem[];
  truncated: boolean;
}

export function csvItems(text: string): CsvTable {
  const rows = parseCsv(text);
  if (rows.length < 2) return { headers: [], items: [], truncated: false };
  const keys = headerKeys(rows[0]!);
  const body = rows.slice(1, MAX_CSV_ROWS + 1);
  const items = body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
  return { headers: keys, items, truncated: rows.length - 1 > MAX_CSV_ROWS };
}

// ---------- FAQs ----------

export const FAQ_FIELDS = ['question', 'answer', 'category'] as const;
export type FaqField = (typeof FAQ_FIELDS)[number];
const FAQ_DEFAULTS: Record<FaqField, string[]> = {
  question: ['question', 'q', 'faq', 'title', 'topic'],
  answer: ['answer', 'a', 'response', 'reply', 'content'],
  category: ['category', 'type', 'group'],
};

export function faqMapping(headers: string[], given: Partial<Record<FaqField, string>> = {}) {
  const have = new Set(headers);
  const out: Partial<Record<FaqField, string>> = {};
  for (const f of FAQ_FIELDS) {
    const g = given[f];
    if (g !== undefined) {
      if (g === '' || have.has(g)) out[f] = g;
      continue;
    }
    const d = FAQ_DEFAULTS[f].find((h) => have.has(h));
    if (d) out[f] = d;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export interface MappedFaq {
  data: Record<string, string>;
  warnings: string[];
}

/** FAQs need both a question and an answer; duplicates (same question) are ignored; a category outside Brain's list becomes General. */
export function mapFaqs(items: RawItem[], map: Partial<Record<FaqField, string>>) {
  const pick = (it: RawItem, f: FaqField) => (map[f] ? (it[map[f]!] ?? '').trim() : '');
  const faqs: MappedFaq[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const it of items) {
    const q = pick(it, 'question').slice(0, 300);
    const a = pick(it, 'answer').slice(0, 2000);
    if (!q || !a) {
      invalid++;
      continue;
    }
    if (seen.has(norm(q))) {
      duplicates++;
      continue;
    }
    seen.add(norm(q));
    const rawCat = pick(it, 'category');
    const cat =
      (FAQ_CATS as readonly string[]).find((c) => c.toLowerCase() === rawCat.toLowerCase()) ??
      'General';
    const warnings: string[] = [];
    if (rawCat && cat === 'General' && rawCat.toLowerCase() !== 'general')
      warnings.push(
        `Category "${rawCat.slice(0, 30)}" is not one Brain uses, so it imports as General.`,
      );
    if (a.length < 15) warnings.push('The answer is very short.');
    faqs.push({ data: { q, a, cat }, warnings });
  }
  const issues: string[] = [];
  if (invalid)
    issues.push(
      `${invalid} row${invalid === 1 ? ' has' : 's have'} no question or no answer and were skipped.`,
    );
  if (duplicates)
    issues.push(`${duplicates} duplicate question${duplicates === 1 ? '' : 's'} ignored.`);
  return { faqs, invalid, duplicates, issues };
}
