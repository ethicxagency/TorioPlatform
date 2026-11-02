import type { CustomerStatus, Segment } from './types';

export const STATUSES: { key: CustomerStatus; label: string; color: string; bg: string }[] = [
  { key: 'ACTIVE', label: 'Active', color: '#16803A', bg: '#ECFDF3' },
  { key: 'INACTIVE', label: 'Inactive', color: '#5A6A82', bg: '#EDF1F5' },
];

/** Predefined, rule-based segments the API can evaluate today. Order-based segments need the Orders module. */
export const SEGMENTS: { key: Segment; label: string; rule: string }[] = [
  { key: 'all', label: 'All customers', rule: 'Every customer in the workspace' },
  { key: 'new', label: 'New (30 days)', rule: 'Created in the last 30 days' },
  { key: 'recent', label: 'Recently active', rule: 'A conversation message in the last 7 days' },
  {
    key: 'inactive',
    label: 'Inactive',
    rule: 'Marked Inactive, or no conversation activity in 90 days',
  },
  { key: 'tagged', label: 'Tagged', rule: 'Has at least one tag' },
];
export const UNAVAILABLE_SEGMENTS = [
  { label: 'Repeat customers', reason: 'Needs Orders' },
  { label: 'High-value', reason: 'Needs Orders' },
];
export const CUSTOMER_PAGE_SIZE = 25;
