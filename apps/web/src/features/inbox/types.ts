import type { ApiSchemas } from '@torio/api-client';

export type Conversation = ApiSchemas['ConversationDto'];
// Taken from the list response: the generated standalone MessageDto mistypes nullable strings as arrays.
export type Message = ApiSchemas['MessageListDto']['data'][number];
export type Customer = Conversation['customer'];
export type SavedReply = ApiSchemas['SavedReplyDto'];
export type Provider = Conversation['channel']['provider'];
export type ConversationStatus = Conversation['status'];
export type Priority = Conversation['priority'];
export type LeadStatus = Customer['leadStatus'];

export type ListView = 'all' | 'mine' | 'unassigned' | 'unread';
export type SortOrder = 'waiting' | 'newest' | 'priority';

export interface InboxFilters {
  status: ConversationStatus;
  view: ListView;
  /** Channel narrows any view (e.g. Unread on WhatsApp); '' means every channel. */
  channel: '' | Provider;
  q: string;
  order: SortOrder;
  assigneeId: string;
  tag: string;
  priority: '' | Priority;
}

export const DEFAULT_FILTERS: InboxFilters = {
  status: 'OPEN',
  view: 'all',
  channel: '',
  q: '',
  order: 'waiting',
  assigneeId: '',
  tag: '',
  priority: '',
};

export const advancedFilterCount = (f: InboxFilters) =>
  [f.assigneeId, f.tag, f.priority].filter(Boolean).length;
