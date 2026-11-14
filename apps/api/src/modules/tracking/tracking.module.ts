import { Global, Module } from '@nestjs/common';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { MetaEventsService } from './meta-events.service';
import { TorioTrackingService } from './torio-tracking.service';
import { TrackingController } from './tracking.controller';

@Global()
@Module({
  controllers: [TrackingController],
  providers: [MetaEventsService, TorioTrackingService, ChannelCryptoService],
  exports: [MetaEventsService, TorioTrackingService],
})
export class TrackingModule {}
