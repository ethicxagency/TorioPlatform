import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
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
import {
  channelHealthSchema,
  channelSchema,
  metaConfigSchema,
  metaProvisionResultSchema,
  metaSelectSchema,
  metaSessionSchema,
  metaStartResultSchema,
  metaStartSchema,
  whatsAppEmbeddedSignupSchema,
} from '@torio/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../database/prisma.service';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { verifyMetaSignature } from '../whatsapp/whatsapp.api';
import { WhatsAppConnectionService } from '../whatsapp/whatsapp.connection.service';
import { WhatsAppDeliveryService } from '../whatsapp/whatsapp.delivery.service';
import { MetaConnectionService } from './meta.connection.service';
import { MetaDeliveryService } from './meta.delivery.service';
import { MetaWebhookService, type MetaPayload } from './meta.webhook.service';

class MetaStartDto extends createZodDto(metaStartSchema) {}
class MetaStartResultDto extends createZodDto(metaStartResultSchema) {}
class MetaSessionDto extends createZodDto(metaSessionSchema) {}
class MetaProvisionDto extends createZodDto(metaProvisionResultSchema) {}
class MetaSelectDto extends createZodDto(metaSelectSchema) {}
class MetaConfigDto extends createZodDto(metaConfigSchema) {}
class EmbeddedSignupDto extends createZodDto(whatsAppEmbeddedSignupSchema) {}
class ChannelDto extends createZodDto(channelSchema) {}
class ChannelHealthDto extends createZodDto(channelHealthSchema) {}

/** Browser redirect target for Meta OAuth. Public by necessity; trusted only through the signed `state`. */
@ApiExcludeController()
@Controller('channels/meta')
export class MetaCallbackController {
  constructor(private readonly connection: MetaConnectionService) {}

  @Public()
  @SkipThrottle()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    res.redirect(302, await this.connection.callback({ code, state, error }));
  }
}

/** Page and Instagram webhooks. Every POST must carry a valid signature over the raw body; Meta is acknowledged first. */
@ApiExcludeController()
@Controller('webhooks/meta')
export class MetaWebhookController {
  private readonly log = new Logger(MetaWebhookController.name);

  constructor(
    private readonly mc: MetaConfigService,
    private readonly webhooks: MetaWebhookService,
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
      throw new ForbiddenException('Meta webhooks are not configured');
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    if (!verifyMetaSignature(req.rawBody, signature, secret))
      throw new ForbiddenException('Invalid signature');
    const { jobs, received, ...summary } = await this.webhooks.ingest(req.body as MetaPayload);
    // Acknowledge now; the heavy work (profile lookups, writes) runs after the response is sent.
    if (jobs.length)
      setImmediate(() => void this.webhooks.run(jobs).catch((e) => this.log.error(String(e))));
    return { received: true, accepted: received, ...summary };
  }
}

@ApiTags('meta channels')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId')
export class MetaController {
  constructor(
    private readonly connection: MetaConnectionService,
    private readonly whatsappConnection: WhatsAppConnectionService,
    private readonly whatsappDelivery: WhatsAppDeliveryService,
    private readonly delivery: MetaDeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('channels/meta/config')
  @RequirePermission('channels:read')
  @ApiOkResponse({ type: MetaConfigDto })
  config(@Param('workspaceId', ParseUUIDPipe) _ws: string) {
    return this.connection.publicConfig();
  }

  @Post('channels/meta/start')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: MetaStartResultDto })
  start(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: MetaStartDto,
  ) {
    return this.connection.start(ws, u.id, body.products);
  }

  @Get('channels/meta/sessions/:sessionId')
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: MetaSessionDto })
  session(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.connection.session(ws, u.id, id);
  }

  @Post('channels/meta/sessions/:sessionId/select')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: MetaProvisionDto })
  select(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: MetaSelectDto,
  ) {
    return this.connection.select(ws, u.id, id, body);
  }

  @Post('channels/meta/sessions/:sessionId/cancel')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  cancel(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.connection.cancel(ws, u.id, id);
  }

  @Post('channels/whatsapp/embedded-signup')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelDto })
  embeddedSignup(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: EmbeddedSignupDto,
  ) {
    return this.connection.embeddedSignup(ws, u.id, body);
  }

  /** Real provider check for any connected channel; the right API is chosen from the channel's provider. */
  @Post('channels/:channelId/health')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelHealthDto })
  async health(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
  ) {
    const ch = await this.prisma.client.channel.findFirst({
      where: { id, workspaceId: ws },
      select: { provider: true },
    });
    if (!ch) throw new BadRequestException('Channel not found');
    return ch.provider === 'WHATSAPP'
      ? this.whatsappConnection.health(ws, id)
      : this.connection.health(ws, id);
  }

  /** Retry a FAILED outbound message on any provider. Safe to repeat: a message with a provider id is never resent. */
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
    const wa = await this.whatsappDelivery.deliver(ws, id);
    return { result: wa !== 'skipped' ? wa : await this.delivery.deliver(ws, id) };
  }
}
