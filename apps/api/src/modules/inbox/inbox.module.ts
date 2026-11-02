import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ConversationsService } from './conversations.service';
import { InboxController } from './inbox.controller';
import { SavedRepliesService } from './saved-replies.service';
import { SearchService } from './search.service';

@Module({
  imports: [RealtimeModule, WhatsAppModule],
  controllers: [InboxController],
  providers: [ConversationsService, SavedRepliesService, SearchService],
})
export class InboxModule {}
