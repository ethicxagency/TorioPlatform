import { Pill } from '@/features/brain/components/bits';
import { EXEC_INFO, STATUS_INFO } from '../constants';
import type { AutomationStatus, ExecutionStatus } from '../types';

export const StatusBadge = ({ status }: { status: AutomationStatus }) => (
  <Pill tone={STATUS_INFO[status].tone}>{STATUS_INFO[status].label}</Pill>
);
export const ExecBadge = ({ status }: { status: ExecutionStatus }) => (
  <Pill tone={EXEC_INFO[status].tone}>{EXEC_INFO[status].label}</Pill>
);

export const fmtDuration = (ms: number) =>
  ms < 0
    ? '—'
    : ms < 1000
      ? `${ms} ms`
      : ms < 60_000
        ? `${(ms / 1000).toFixed(1)} s`
        : `${Math.round(ms / 60_000)} min`;
