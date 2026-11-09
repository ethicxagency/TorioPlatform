import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
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
import { channelSchema, connectWhatsAppSchema } from '@torio/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { verifyMetaSignature } from './whatsapp.api';
import { WhatsAppConnectionService } from './whatsapp.connection.service';
import { WhatsAppWebhookService, type WaPayload } from './whatsapp.webhook.service';

class ConnectWhatsAppDto extends createZodDto(connectWhatsAppSchema) {}
class ChannelDto extends createZodDto(channelSchema) {}

/** Public callbacks from Meta. Every POST must carry a valid signature over the raw body. */
@ApiExcludeController()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly mc: MetaConfigService,
    private readonly webhooks: WhatsAppWebhookService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const cfg = await this.mc.load();
    const expected = cfg.verifyToken;
    if (
      !cfg.webhookEnabled ||
      !expected ||
      mode !== 'subscribe' ||
      token !== expected ||
      !challenge
    )
      throw new ForbiddenException('Verification failed');
    void this.mc.markWebhookVerified();
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
    const cfg = await this.mc.load();
    const secret = cfg.appSecret;
    if (!secret || !cfg.webhookEnabled)
      throw new ForbiddenException('WhatsApp webhooks are not configured');
    if (!cfg.whatsappEnabled) return { received: true, ignored: true };
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
  constructor(private readonly connection: WhatsAppConnectionService) {}

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
}
