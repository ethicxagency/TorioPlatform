import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { channelHealthSchema, channelSchema, connectWhatsAppSchema } from '@torio/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { verifyMetaSignature } from './whatsapp.api';
import { WhatsAppConnectionService } from './whatsapp.connection.service';
import { WhatsAppDeliveryService } from './whatsapp.delivery.service';
import { WhatsAppWebhookService, type WaPayload } from './whatsapp.webhook.service';

class ConnectWhatsAppDto extends createZodDto(connectWhatsAppSchema) {}
class ChannelDto extends createZodDto(channelSchema) {}
class ChannelHealthDto extends createZodDto(channelHealthSchema) {}

/** Public callbacks from Meta. Every POST must carry a valid signature over the raw body. */
@ApiExcludeController()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly webhooks: WhatsAppWebhookService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const expected = this.config.META_WEBHOOK_VERIFY_TOKEN;
    if (!expected || mode !== 'subscribe' || token !== expected || !challenge)
      throw new ForbiddenException('Verification failed');
    res.type('text/plain').send(challenge);
  }

  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    const secret = this.config.META_APP_SECRET;
    if (!secret) throw new ForbiddenException('WhatsApp webhooks are not configured');
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    if (!verifyMetaSignature(req.rawBody, signature, secret))
      throw new ForbiddenException('Invalid signature');
    return { received: true, ...(await this.webhooks.process(req.body as WaPayload)) };
  }
}

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId')
export class WhatsAppController {
  constructor(
    private readonly connection: WhatsAppConnectionService,
    private readonly delivery: WhatsAppDeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('channels/whatsapp/connect')
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelDto })
  connect(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: ConnectWhatsAppDto,
  ) {
    return this.connection.connect(ws, u.id, body);
  }

  @Post('channels/:channelId/health')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelHealthDto })
  health(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
  ) {
    return this.connection.health(ws, id);
  }

  /** Retry a FAILED outbound message. Safe to repeat: a message that already has a provider id is never resent. */
  @Post('messages/:messageId/retry')
  @HttpCode(200)
  @RequirePermission('conversations:reply')
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['result'],
      properties: { result: { type: 'string', enum: ['sent', 'skipped', 'failed'] } },
    },
  })
  async retry(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('messageId', ParseUUIDPipe) id: string,
  ) {
    const m = await this.prisma.client.message.findFirst({
      where: { id, workspaceId: ws, kind: 'OUTBOUND', deliveryStatus: 'FAILED' },
    });
    if (!m) throw new BadRequestException('Only failed outgoing messages can be retried');
    await this.prisma.client.message.update({
      where: { id },
      data: { deliveryStatus: 'PENDING', errorMessage: null },
    });
    return { result: await this.delivery.deliver(ws, id) };
  }
}
