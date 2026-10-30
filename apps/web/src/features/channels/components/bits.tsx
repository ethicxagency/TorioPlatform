import { CircleHelp } from 'lucide-react';
import { Pill } from '@/features/brain/components/bits';
import { CHANNELS } from '@/features/inbox/constants';
import { STATUS_INFO, type ChannelStatus, type Provider } from '../types';

export function ProviderMark({ provider, size = 36 }: { provider: Provider; size?: number }) {
  const c = CHANNELS[provider];
  return (
    <span
      role="img"
      aria-label={c.label}
      className="flex shrink-0 items-center justify-center rounded-[10px] font-bold text-white"
      style={{ width: size, height: size, background: c.color, fontSize: size * 0.42 }}
    >
      {c.label[0]}
    </span>
  );
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
