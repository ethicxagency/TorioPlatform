import { CircleHelp } from 'lucide-react';
import { Pill } from '@/features/brain/components/bits';
import { ChannelIcon } from '@/components/channel-icon';
import { STATUS_INFO, type ChannelStatus, type Provider } from '../types';

export function ProviderMark({ provider, size = 36 }: { provider: Provider; size?: number }) {
  return <ChannelIcon channel={provider} size={size} variant="tile" />;
}

export function StatusPill({ status }: { status: ChannelStatus }) {
  const s = STATUS_INFO[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const Hint = ({ text }: { text: string }) => (
  <span title={text} className="inline-flex cursor-help text-faint">
    <CircleHelp size={12} aria-label={text} />
  </span>
);
