import { Global, Module } from '@nestjs/common';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { MetaEventsService } from './meta-events.service';
import { TorioTrackingService } from './torio-tracking.service';
import { WorkspacePixelController } from './workspace-pixel.controller';
import { WorkspacePixelService } from './workspace-pixel.service';
import { TrackingController } from './tracking.controller';

@Global()
@Module({
  controllers: [TrackingController, WorkspacePixelController],
  providers: [MetaEventsService, TorioTrackingService, WorkspacePixelService, ChannelCryptoService],
  exports: [MetaEventsService, TorioTrackingService, WorkspacePixelService],
})
export class TrackingModule {}
