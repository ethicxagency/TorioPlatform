import type { LeadSource, LeadStage } from './types';

/** Default pipeline. The API stores these as a fixed enum; configurable pipelines are not implemented yet. */
export const STAGES: { key: LeadStage; label: string; color: string; bg: string }[] = [
  { key: 'NEW', label: 'New', color: '#5A6A82', bg: '#EDF1F5' },
  { key: 'CONTACTED', label: 'Contacted', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'QUALIFIED', label: 'Qualified', color: '#4F50D1', bg: '#F0F0FF' },
  { key: 'PROPOSAL', label: 'Proposal', color: '#A15C00', bg: '#FFF7E6' },
  { key: 'WON', label: 'Won', color: '#16803A', bg: '#ECFDF3' },
  { key: 'LOST', label: 'Lost', color: '#C53030', bg: '#FFF1F2' },
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<
  LeadStage,
  (typeof STAGES)[number]
>;

export const SOURCES: { key: LeadSource; label: string; color: string }[] = [
  { key: 'WHATSAPP', label: 'WhatsApp', color: '#25D366' },
  { key: 'INSTAGRAM', label: 'Instagram', color: '#E4405F' },
  { key: 'MESSENGER', label: 'Messenger', color: '#1877F2' },
  { key: 'WEBSITE', label: 'Website', color: '#5B5CE2' },
  { key: 'MANUAL', label: 'Manual', color: '#66778E' },
  { key: 'IMPORT', label: 'Import', color: '#66778E' },
];
export const SOURCE = Object.fromEntries(SOURCES.map((s) => [s.key, s])) as Record<
  LeadSource,
  (typeof SOURCES)[number]
>;

export const DATE_RANGES = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
] as const;

export const PAGE_SIZE = 25;
