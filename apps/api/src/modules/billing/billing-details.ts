/**
 * Invoice billing details come from ONE place: the store's General Settings (the workspace record). There is no separate
 * billing profile to keep in step. A new invoice takes a snapshot of these values when it is first recorded; the snapshot
 * is never rewritten, so later edits to General Settings change future invoices only.
 *
 * Mapping from General Settings: Business name -> companyName, Email -> billingEmail, Phone -> phone, Country -> country,
 * Address -> addressLine, City -> city, State / Region -> state, Postal code -> postalCode. General Settings has no contact
 * person or tax id, so those stay empty rather than being guessed.
 */
export interface WorkspaceDetails {
  name: string;
  contactEmail: string | null;
  phone: string | null;
  country: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}
export const WORKSPACE_DETAIL_SELECT = {
  name: true,
  contactEmail: true,
  phone: true,
  country: true,
  addressLine: true,
  city: true,
  state: true,
  postalCode: true,
} as const;

export function billingDetailsOf(w: WorkspaceDetails) {
  return {
    companyName: w.name?.trim() || null,
    contactName: null as string | null,
    billingEmail: w.contactEmail,
    phone: w.phone,
    country: w.country,
    state: w.state,
    city: w.city,
    addressLine: w.addressLine,
    postalCode: w.postalCode,
    taxId: null as string | null,
  };
}

/** What an invoice cannot be issued without, as General Settings field names people recognise. */
export const REQUIRED_FOR_INVOICE = [
  ['companyName', 'Business name'],
  ['billingEmail', 'Email'],
  ['country', 'Country'],
] as const;

export function missingBillingDetails(d: ReturnType<typeof billingDetailsOf>) {
  return REQUIRED_FOR_INVOICE.filter(([k]) => !d[k]).map(([k, label]) => ({ field: k, label }));
}
