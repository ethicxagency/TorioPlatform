import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MetaConnectionService } from './meta.connection.service';
import { MetaController, MetaCallbackController, MetaWebhookController } from './meta.controller';
import { MetaDeliveryService } from './meta.delivery.service';
import { MetaWebhookService } from './meta.webhook.service';

@Module({
  imports: [ChannelsModule, RealtimeModule, WhatsAppModule],
  controllers: [MetaCallbackController, MetaWebhookController, MetaController],
  providers: [MetaConnectionService, MetaWebhookService, MetaDeliveryService],
  exports: [MetaDeliveryService, MetaWebhookService, MetaConnectionService],
})
export class MetaModule {}
