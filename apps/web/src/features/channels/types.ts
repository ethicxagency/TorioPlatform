import type { ApiSchemas } from '@torio/api-client';

export type Channel = ApiSchemas['ChannelListDto']['data'][number];
export type ChannelSummary = ApiSchemas['ChannelSummaryDto'];
export type ProviderInfo = ApiSchemas['ProviderListDto']['data'][number];
export type ChannelActivity = ApiSchemas['ChannelActivityDto']['data'][number];
export type Provider = Channel['provider'];
export type ChannelStatus = Channel['status'];

export interface ChannelFilters {
  q: string;
  provider: '' | Provider;
  status: '' | ChannelStatus;
  sort: 'name' | 'activity';
}
export const EMPTY_CHANNEL_FILTERS: ChannelFilters = {
  q: '',
  provider: '',
  status: '',
  sort: 'name',
};

export const STATUS_INFO: Record<
  ChannelStatus,
  { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral'; help: string }
> = {
  CONNECTED: {
    label: 'Connected',
    tone: 'ok',
    help: 'Torio has a connection record for this account.',
  },
  NEEDS_ATTENTION: {
    label: 'Needs attention',
    tone: 'warn',
    help: 'The last check reported a problem.',
  },
  EXPIRED: {
    label: 'Authorization expired',
    tone: 'bad',
    help: 'The provider authorization must be renewed.',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    tone: 'neutral',
    help: 'No new messages are sent or received. History is kept.',
  },
};
