import { ChannelIcon } from '@/components/channel-icon';
import type { Provider } from '../types';

/** Official brand icon on a brand-coloured tile, ringed in white so it sits cleanly on avatars and rows. */
export function ChannelBadge({ provider, size = 16 }: { provider: Provider; size?: number }) {
  return (
    <ChannelIcon
      channel={provider}
      size={size}
      variant="tile"
      className="ring-[1.5px] ring-white"
    />
  );
}
