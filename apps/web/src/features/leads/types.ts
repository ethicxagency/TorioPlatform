import type { ApiSchemas } from '@torio/api-client';

export type Lead = ApiSchemas['LeadDto'];
export type LeadSummary = ApiSchemas['LeadSummaryDto'];
export type LeadActivity = ApiSchemas['LeadActivityListDto']['data'][number];
export type LeadStage = Lead['stage'];
export type LeadSource = Lead['source'];
export type LeadSortField = 'createdAt' | 'name' | 'score' | 'lastActivityAt' | 'dealValue';
export type DateRange = '' | '7d' | '30d' | '90d';

export interface LeadFilters {
  q: string;
  stages: LeadStage[];
  sources: LeadSource[];
  owner: '' | 'unassigned' | string;
  tag: string;
  range: DateRange;
  minScore: '' | '40' | '70';
}

export const EMPTY_FILTERS: LeadFilters = {
  q: '',
  stages: [],
  sources: [],
  owner: '',
  tag: '',
  range: '',
  minScore: '',
};

export const activeFilterCount = (f: LeadFilters) =>
  [f.stages.length > 0, f.sources.length > 0, !!f.owner, !!f.tag, !!f.range, !!f.minScore].filter(
    Boolean,
  ).length;
