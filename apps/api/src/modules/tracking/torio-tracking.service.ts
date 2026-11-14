import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { isLive, loadStored } from '../admin/integrations/state';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import type { CapiEvent } from './meta-capi';
import { MetaEventsService, type PixelTarget } from './meta-events.service';

export const PLATFORM_OWNER = 'platform';

/**
 * Torio's own marketing tracking: the Pixel and Conversions API Super Admin configured under Integrations → Torio Meta Pixel. It is
 * completely separate from any workspace's Pixel: its own credentials, its own `platform` owner key, and it is only used while the
 * integration is verified and switched on.
 */
@Injectable()
export class TorioTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly events: MetaEventsService,
  ) {}

  /** The Pixel for the public website, only when browser tracking is on. The id is public by nature; the token never leaves the server. */
  async publicConfig(): Promise<{ metaPixelId: string | null }> {
    const s = await loadStored(this.prisma, 'torio_meta_pixel');
    const id = s.values.pixelId;
    return {
      metaPixelId:
        isLive('torio_meta_pixel', s) && s.values.browserTracking === true && typeof id === 'string'
          ? id
          : null,
    };
  }

  /** The server-side target, only when server tracking is on and the connection is verified. */
  async serverTarget(): Promise<PixelTarget | null> {
    const s = await loadStored(this.prisma, 'torio_meta_pixel');
    if (
      !isLive('torio_meta_pixel', s) ||
      s.values.serverTracking !== true ||
      !this.crypto.configured ||
      !s.secrets.accessToken
    )
      return null;
    try {
      return {
        ownerKey: PLATFORM_OWNER,
        pixelId: String(s.values.pixelId),
        token: this.crypto.decrypt(s.secrets.accessToken),
      };
    } catch {
      return null;
    }
  }

  /**
   * Records an event from a verified server-side action. Never throws and never waits for Meta: a failure here must not affect
   * the registration or payment it describes.
   */
  async track(e: CapiEvent): Promise<void> {
    try {
      const target = await this.serverTarget();
      if (target) await this.events.track(target, e);
    } catch {
      /* tracking is best-effort by design */
    }
  }
}
