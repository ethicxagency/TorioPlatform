import { CHANNELS } from '../constants';
import type { Provider } from '../types';

/** Small channel-coloured dot with the provider initial; restrained, no brand artwork. */
export function ChannelBadge({ provider, size = 16 }: { provider: Provider; size?: number }) {
  const c = CHANNELS[provider];
  return (
    <span
      title={c.label}
      aria-label={c.label}
      role="img"
      className="flex items-center justify-center rounded-full border-[1.5px] border-white text-[8px] font-bold text-white"
      style={{ width: size, height: size, background: c.color }}
    >
      {c.label[0]}
    </span>
  );
}
