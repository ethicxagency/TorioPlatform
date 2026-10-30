import type { ApiSchemas } from '@torio/api-client';

export type AutomationItem = ApiSchemas['AutomationListDto']['data'][number];
export type AutomationDetail = ApiSchemas['AutomationDetailDto'];
export type AutomationSummary = ApiSchemas['AutomationSummaryDto'];
export type ExecutionItem = ApiSchemas['AutomationExecListDto']['data'][number];
export type ExecutionDetail = ApiSchemas['AutomationExecDetailDto'];
export type TestResult = ApiSchemas['AutomationTestResultDto'];
export type AutomationStatus = AutomationItem['status'];
export type ExecutionStatus = ExecutionItem['status'];

export interface DirectoryFilters {
  q: string;
  trigger: string;
  sort: 'updatedAt' | 'name' | 'lastRun';
  dir: 'asc' | 'desc';
}
export const EMPTY_DIRECTORY: DirectoryFilters = {
  q: '',
  trigger: '',
  sort: 'updatedAt',
  dir: 'desc',
};
