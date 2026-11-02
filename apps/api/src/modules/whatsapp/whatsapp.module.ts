import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChannelCryptoService } from './channel-crypto.service';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppConnectionService } from './whatsapp.connection.service';
import { WhatsAppDeliveryService } from './whatsapp.delivery.service';
import { WhatsAppGraphProvider } from './whatsapp.graph-provider';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';

@Module({
  imports: [ChannelsModule, RealtimeModule],
  controllers: [WhatsAppWebhookController, WhatsAppController],
  providers: [
    ChannelCryptoService,
    WhatsAppGraphProvider,
    WhatsAppWebhookService,
    WhatsAppDeliveryService,
    WhatsAppConnectionService,
  ],
  exports: [
    WhatsAppDeliveryService,
    WhatsAppWebhookService,
    WhatsAppGraphProvider,
    ChannelCryptoService,
  ],
})
export class WhatsAppModule {}
