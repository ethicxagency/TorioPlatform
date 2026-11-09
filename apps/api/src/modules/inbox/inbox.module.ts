import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { MetaModule } from '../meta/meta.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ConversationsService } from './conversations.service';
import { InboxController } from './inbox.controller';
import { SavedRepliesService } from './saved-replies.service';
import { SearchService } from './search.service';

@Module({
  imports: [RealtimeModule, WhatsAppModule, MetaModule],
  controllers: [InboxController],
  providers: [ConversationsService, SavedRepliesService, SearchService],
})
export class InboxModule {}
