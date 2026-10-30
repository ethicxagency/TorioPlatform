export const CUSTOMER_IMPORT_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
  'address',
  'source',
  'tags',
  'notes',
] as const;
export type CustomerImportField = (typeof CUSTOMER_IMPORT_FIELDS)[number];

export const CUSTOMER_IMPORT_LABELS: Record<CustomerImportField, string> = {
  name: 'Full name *',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  address: 'Address',
  source: 'Source',
  tags: 'Tags (; separated)',
  notes: 'Notes',
};

const ALIASES: Record<CustomerImportField, string[]> = {
  name: ['name', 'fullname', 'full name', 'customer', 'contact'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'mobile', 'phone number', 'tel', 'whatsapp'],
  company: ['company', 'organization', 'organisation', 'business'],
  address: ['address', 'location', 'city'],
  source: ['source', 'channel'],
  tags: ['tags', 'labels'],
  notes: ['notes', 'note', 'comments'],
};

export function guessCustomerMapping(headers: string[]): Record<CustomerImportField, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  return Object.fromEntries(
    CUSTOMER_IMPORT_FIELDS.map((f) => [f, norm.findIndex((h) => ALIASES[f].includes(h))]),
  ) as Record<CustomerImportField, number>;
}

export function applyCustomerMapping(
  rows: string[][],
  mapping: Record<CustomerImportField, number>,
): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const f of CUSTOMER_IMPORT_FIELDS)
      if (mapping[f] >= 0) o[f] = (r[mapping[f]] ?? '').trim();
    return o;
  });
}
