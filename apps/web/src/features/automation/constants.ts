import type { AutomationStatus, ExecutionStatus } from './types';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

export const STATUS_INFO: Record<AutomationStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ACTIVE: { label: 'Active', tone: 'ok' },
  INACTIVE: { label: 'Inactive', tone: 'warn' },
};
export const EXEC_INFO: Record<ExecutionStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Queued', tone: 'info' },
  RUNNING: { label: 'Running', tone: 'info' },
  WAITING: { label: 'Waiting', tone: 'info' },
  SUCCEEDED: { label: 'Succeeded', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
};
export const PAGE_SIZE = 25;
