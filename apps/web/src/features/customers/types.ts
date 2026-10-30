import type { ApiSchemas } from '@torio/api-client';
import type { LeadSource } from '@/features/leads/types';

export type CustomerItem = ApiSchemas['CustomerItemDto'];
export type CustomerSummary = ApiSchemas['CustomerSummaryDto'];
export type CustomerNote = ApiSchemas['CustomerNoteListDto']['data'][number];
export type CustomerActivity = ApiSchemas['CustomerActivityListDto']['data'][number];
export type CustomerConversation = ApiSchemas['CustomerConversationListDto']['data'][number];
export type CustomerStatus = CustomerItem['status'];
export type Segment = 'all' | 'new' | 'recent' | 'inactive' | 'tagged';
export type DateRange = '' | '7d' | '30d' | '90d';
export type CustomerSort = 'createdAt' | 'name';

export interface CustomerFilters {
  q: string;
  status: '' | CustomerStatus;
  sources: LeadSource[];
  owner: '' | 'unassigned' | string;
  tag: string;
  range: DateRange;
  segment: Segment;
}

export const EMPTY_CUSTOMER_FILTERS: CustomerFilters = {
  q: '',
  status: '',
  sources: [],
  owner: '',
  tag: '',
  range: '',
  segment: 'all',
};
export const activeCustomerFilterCount = (f: CustomerFilters) =>
  [!!f.status, f.sources.length > 0, !!f.owner, !!f.tag, !!f.range].filter(Boolean).length;
