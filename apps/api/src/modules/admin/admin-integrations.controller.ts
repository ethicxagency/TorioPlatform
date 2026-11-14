import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  emailDeliveryListSchema,
  emailDeliveryQuerySchema,
  emailPreviewSchema,
  emailTemplateListSchema,
  gatewayTxListSchema,
  gatewayTxQuerySchema,
  gatewayTxSchema,
  integrationEnableSchema,
  metaEventListSchema,
  metaEventQuerySchema,
  metaRetryResultSchema,
  integrationListSchema,
  integrationSaveSchema,
  integrationSecretValueSchema,
  integrationTestEmailSchema,
  integrationTestResultSchema,
  integrationViewSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin-auth';
import { EmailEventsService } from '../email/email-events.service';
import { MetaEventsService } from '../tracking/meta-events.service';
import { PLATFORM_OWNER, TorioTrackingService } from '../tracking/torio-tracking.service';
import { SslcommerzService } from '../billing/sslcommerz/sslcommerz.service';
import { IntegrationsService } from './integrations/integrations.service';

class EmailDeliveryQueryDto extends createZodDto(emailDeliveryQuerySchema) {}
class EmailDeliveryListDto extends createZodDto(emailDeliveryListSchema) {}
class EmailTemplateListDto extends createZodDto(emailTemplateListSchema) {}
class EmailPreviewDto extends createZodDto(emailPreviewSchema) {}
class MetaEventQueryDto extends createZodDto(metaEventQuerySchema) {}
class MetaEventListDto extends createZodDto(metaEventListSchema) {}
class MetaRetryDto extends createZodDto(metaRetryResultSchema) {}
class GatewayTxListDto extends createZodDto(gatewayTxListSchema) {}
class GatewayTxDto extends createZodDto(gatewayTxSchema) {}
class GatewayTxQueryDto extends createZodDto(gatewayTxQuerySchema) {}
class IntegrationListDto extends createZodDto(integrationListSchema) {}
class IntegrationViewDto extends createZodDto(integrationViewSchema) {}
class IntegrationSaveDto extends createZodDto(integrationSaveSchema) {}
class IntegrationEnableDto extends createZodDto(integrationEnableSchema) {}
class IntegrationSecretDto extends createZodDto(integrationSecretValueSchema) {}
class IntegrationTestEmailDto extends createZodDto(integrationTestEmailSchema) {}
class IntegrationTestResultDto extends createZodDto(integrationTestResultSchema) {}

/**
 * Super Admin → Integrations. Platform-level credentials for Mailgun, Torio's Meta Pixel and SSLCommerz. Every route needs
 * an admin session, secrets are write-only (no route ever returns one), and workspaces have no access to any of it.
 */
@ApiTags('admin integrations')
@Public()
@UseGuards(AdminGuard)
@Controller('admin/integrations/platform')
export class AdminIntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly emails: EmailEventsService,
    private readonly metaEvents: MetaEventsService,
    private readonly torio: TorioTrackingService,
    private readonly ssl: SslcommerzService,
  ) {}

  @Get()
  @ApiOkResponse({ type: IntegrationListDto })
  list() {
    return this.integrations.list();
  }

  @Get('mailgun/deliveries')
  @ApiOkResponse({ type: EmailDeliveryListDto })
  deliveries(@Query() q: EmailDeliveryQueryDto) {
    return this.emails.deliveries(q);
  }

  @Get('torio_meta_pixel/events')
  @ApiOkResponse({ type: MetaEventListDto })
  async metaEventLog(@Query() q: MetaEventQueryDto) {
    const [list, pub, server] = await Promise.all([
      this.metaEvents.list(PLATFORM_OWNER, q.page, q.pageSize, q.status),
      this.torio.publicConfig(),
      this.torio.serverTarget(),
    ]);
    return {
      ...list,
      summary: {
        ...list.summary,
        serverTrackingOn: !!server,
        browserTrackingOn: !!pub.metaPixelId,
      },
    } as never;
  }

  @Post('torio_meta_pixel/events/retry')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaRetryDto })
  async retryMeta() {
    const target = await this.torio.serverTarget();
    if (!target)
      throw new BadRequestException('Server-side tracking is off or the Pixel is not verified.');
    return this.metaEvents.retry(target);
  }

  @Get('sslcommerz/transactions')
  @ApiOkResponse({ type: GatewayTxListDto })
  sslTransactions(@Query() q: GatewayTxQueryDto) {
    return this.ssl.list(null, q);
  }

  @Post('sslcommerz/transactions/:tranId/reconcile')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: GatewayTxDto })
  sslReconcile(@Param('tranId') tranId: string) {
    return this.ssl.reconcile(tranId);
  }

  @Get('mailgun/templates')
  @ApiOkResponse({ type: EmailTemplateListDto })
  templates() {
    return this.emails.templates();
  }

  @Get('mailgun/templates/:template')
  @ApiOkResponse({ type: EmailPreviewDto })
  preview(@Param('template') template: string) {
    return this.emails.preview(template);
  }

  @Get(':key')
  @ApiOkResponse({ type: IntegrationViewDto })
  view(@Param('key') key: string) {
    return this.integrations.view(key);
  }

  @Put(':key/config')
  @ApiOkResponse({ type: IntegrationViewDto })
  save(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Body() b: IntegrationSaveDto,
    @Ip() ip: string,
  ) {
    return this.integrations.save(a, key, b, ip);
  }

  @Put(':key/secrets/:name')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationViewDto })
  setSecret(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Param('name') name: string,
    @Body() b: IntegrationSecretDto,
    @Ip() ip: string,
  ) {
    return this.integrations.setSecret(a, key, name, b.value, ip);
  }

  @Delete(':key/secrets/:name')
  @ApiOkResponse({ type: IntegrationViewDto })
  clearSecret(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Param('name') name: string,
    @Ip() ip: string,
  ) {
    return this.integrations.clearSecret(a, key, name, ip);
  }

  @Put(':key/enabled')
  @ApiOkResponse({ type: IntegrationViewDto })
  enable(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Body() b: IntegrationEnableDto,
    @Ip() ip: string,
  ) {
    return this.integrations.setEnabled(a, key, b.enabled, ip);
  }

  @Post(':key/test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationTestResultDto })
  test(@CurrentAdmin() a: AdminContext, @Param('key') key: string, @Ip() ip: string) {
    return this.integrations.test(a, key, ip);
  }

  @Post('mailgun/test-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationTestResultDto })
  testEmail(@CurrentAdmin() a: AdminContext, @Body() b: IntegrationTestEmailDto, @Ip() ip: string) {
    return this.integrations.sendTestEmail(a, b.to, ip);
  }

  @Post('torio_meta_pixel/test-event')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: IntegrationTestResultDto })
  testEvent(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.integrations.sendTestEvent(a, ip);
  }
}
