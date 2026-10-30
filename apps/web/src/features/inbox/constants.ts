import type { LeadStatus, ListView, Provider } from './types';

export const CHANNELS: Record<Provider, { label: string; color: string; view: ListView }> = {
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', view: 'WHATSAPP' },
  INSTAGRAM: { label: 'Instagram', color: '#E4405F', view: 'INSTAGRAM' },
  MESSENGER: { label: 'Messenger', color: '#1877F2', view: 'MESSENGER' },
};

export const VIEWS: { key: ListView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'unread', label: 'Unread' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'INSTAGRAM', label: 'Instagram' },
  { key: 'MESSENGER', label: 'Messenger' },
];

export const LEAD_STATUSES: { key: LeadStatus; label: string; color: string; bg: string }[] = [
  { key: 'NEW', label: 'New Lead', color: '#62656D', bg: '#EEF0F2' },
  { key: 'CONTACTED', label: 'Contacted', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'INTERESTED', label: 'Interested', color: '#A15C00', bg: '#FFF7E6' },
  { key: 'CONVERTED', label: 'Converted', color: '#16803A', bg: '#ECFDF3' },
  { key: 'LOST', label: 'Lost', color: '#C53030', bg: '#FFF1F2' },
];

export const SHORTCUTS: [string, string][] = [
  ['J / K', 'Next / previous conversation'],
  ['R', 'Reply'],
  ['N', 'Write an internal note'],
  ['E', 'Resolve or reopen'],
  ['S', 'Snooze'],
  ['A', 'Assign'],
  ['P', 'Open / close customer profile'],
  ['/', 'Saved replies (in the composer)'],
  ['⌘ K / Ctrl K', 'Global search'],
  ['?', 'Show keyboard shortcuts'],
  ['Esc', 'Close the open menu, dialog or drawer'],
];

export const LIST_WIDTH = { min: 280, max: 480, default: 340 } as const;
export const PROFILE_WIDTH = { min: 280, max: 420, default: 320 } as const;
export const CHAT_MIN_WIDTH = 420;

export interface SnoozeOption {
  key: string;
  label: string;
  /** Resolves the wake-up time relative to `now`. */
  until: (now: Date) => Date;
}

const at = (d: Date, h: number) => {
  const x = new Date(d);
  x.setHours(h, 0, 0, 0);
  return x;
};

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { key: '1h', label: 'In 1 hour', until: (n) => new Date(n.getTime() + 3_600_000) },
  { key: '3h', label: 'In 3 hours', until: (n) => new Date(n.getTime() + 3 * 3_600_000) },
  {
    key: 'tomorrow',
    label: 'Tomorrow morning',
    until: (n) => at(new Date(n.getTime() + 86_400_000), 9),
  },
  {
    key: 'week',
    label: 'Next Monday',
    until: (n) => {
      const d = at(n, 9);
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      return d;
    },
  },
];
