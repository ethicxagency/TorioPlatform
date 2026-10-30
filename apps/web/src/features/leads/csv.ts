/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF/LF, embedded newlines). Runs in the browser; no data leaves it until import. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export const IMPORT_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
  'jobTitle',
  'source',
  'stage',
  'tags',
  'dealValue',
  'notes',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'fullname', 'full name', 'lead', 'contact'],
  email: ['email', 'e-mail', 'emailaddress', 'email address'],
  phone: ['phone', 'mobile', 'phonenumber', 'phone number', 'tel', 'whatsapp'],
  company: ['company', 'organization', 'organisation', 'business'],
  jobTitle: ['jobtitle', 'job title', 'title', 'position', 'role'],
  source: ['source', 'channel'],
  stage: ['stage', 'status'],
  tags: ['tags', 'labels'],
  dealValue: ['dealvalue', 'deal value', 'value', 'amount'],
  notes: ['notes', 'note', 'comments'],
};

/** Suggests a column mapping by header name. Users can change every choice before importing. */
export function guessMapping(headers: string[]): Record<ImportField, number | -1> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  return Object.fromEntries(
    IMPORT_FIELDS.map((f) => [f, norm.findIndex((h) => ALIASES[f].includes(h))]),
  ) as Record<ImportField, number>;
}

export function applyMapping(
  rows: string[][],
  mapping: Record<ImportField, number>,
): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const f of IMPORT_FIELDS) if (mapping[f] >= 0) o[f] = (r[mapping[f]] ?? '').trim();
    return o;
  });
}
