import { Module } from '@nestjs/common';
import { EmailEventsService } from './email-events.service';
import { MailgunWebhookController } from './mailgun-webhook.controller';

@Module({
  controllers: [MailgunWebhookController],
  providers: [EmailEventsService],
  exports: [EmailEventsService],
})
export class EmailModule {}
