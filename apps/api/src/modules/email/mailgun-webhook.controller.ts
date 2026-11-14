import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { EmailEventsService } from './email-events.service';

/**
 * Mailgun's event webhook. It has no session: authenticity comes from the signature Mailgun puts in every payload, checked
 * against the saved webhook signing key before anything is read from the event.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('webhooks/mailgun')
export class MailgunWebhookController {
  constructor(private readonly events: EmailEventsService) {}

  @Post()
  @HttpCode(200)
  receive(@Body() body: unknown) {
    return this.events.handleMailgun(body);
  }
}
