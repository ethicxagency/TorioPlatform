import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  metaActivityListSchema,
  metaActivityQuerySchema,
  metaAdminConfigSchema,
  metaConfigPreviewSchema,
  metaConfigSaveSchema,
  metaDiagnosticsSchema,
  metaGeneratedTokenSchema,
  metaPreviewResultSchema,
  metaReencryptResultSchema,
  metaSecretClearSchema,
  metaSecretSchema,
  metaSecurityStatusSchema,
  metaTestResultSchema,
  metaTokenGenerateSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { MetaDiagnosticsService } from '../meta-config/meta-config.diagnostics';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin-auth';

class MetaAdminConfigDto extends createZodDto(metaAdminConfigSchema) {}
class MetaConfigSaveDto extends createZodDto(metaConfigSaveSchema) {}
class MetaConfigPreviewDto extends createZodDto(metaConfigPreviewSchema) {}
class MetaPreviewResultDto extends createZodDto(metaPreviewResultSchema) {}
class MetaSecretDto extends createZodDto(metaSecretSchema) {}
class MetaSecretClearDto extends createZodDto(metaSecretClearSchema) {}
class MetaTokenGenerateDto extends createZodDto(metaTokenGenerateSchema) {}
class MetaGeneratedTokenDto extends createZodDto(metaGeneratedTokenSchema) {}
class MetaTestResultDto extends createZodDto(metaTestResultSchema) {}
class MetaDiagnosticsDto extends createZodDto(metaDiagnosticsSchema) {}
class MetaSecurityStatusDto extends createZodDto(metaSecurityStatusSchema) {}
class MetaReencryptResultDto extends createZodDto(metaReencryptResultSchema) {}
class MetaActivityQueryDto extends createZodDto(metaActivityQuerySchema) {}
class MetaActivityListDto extends createZodDto(metaActivityListSchema) {}

/**
 * Super Admin → Integrations → Meta Developer. Every route needs an admin session (AdminGuard); `@Public()` only opts out
 * of the customer JWT guard. Responses never contain secrets, only whether one is configured and where it comes from.
 */
@ApiTags('admin meta')
@Public()
@UseGuards(AdminGuard)
@Controller('admin/integrations/meta')
export class AdminMetaController {
  constructor(
    private readonly cfg: MetaConfigService,
    private readonly diag: MetaDiagnosticsService,
  ) {}

  @Get('config')
  @ApiOkResponse({ type: MetaAdminConfigDto })
  config() {
    return this.cfg.adminView();
  }

  @Post('config/preview')
  @HttpCode(200)
  @ApiOkResponse({ type: MetaPreviewResultDto })
  preview(@Body() b: MetaConfigPreviewDto) {
    return this.cfg.preview(b.patch);
  }

  @Put('config')
  @ApiOkResponse({ type: MetaAdminConfigDto })
  save(@CurrentAdmin() a: AdminContext, @Body() b: MetaConfigSaveDto, @Ip() ip: string) {
    return this.cfg.save(a, b.patch, b.confirm, ip);
  }

  @Put('secrets/app-secret')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaAdminConfigDto })
  async setAppSecret(@CurrentAdmin() a: AdminContext, @Body() b: MetaSecretDto, @Ip() ip: string) {
    await this.diag.assertSecretAccepted(b.value);
    return this.cfg.setSecret(a, 'appSecret', b.value, b.confirm, ip);
  }

  @Delete('secrets/app-secret')
  @ApiOkResponse({ type: MetaAdminConfigDto })
  clearAppSecret(
    @CurrentAdmin() a: AdminContext,
    @Body() _b: MetaSecretClearDto,
    @Ip() ip: string,
  ) {
    return this.cfg.clearSecret(a, 'appSecret', ip);
  }

  @Put('secrets/webhook-verify-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaAdminConfigDto })
  setVerifyToken(@CurrentAdmin() a: AdminContext, @Body() b: MetaSecretDto, @Ip() ip: string) {
    return this.cfg.setSecret(a, 'webhookVerifyToken', b.value, b.confirm, ip);
  }

  /** Creates a random verify token, shows it once, and stores it encrypted. */
  @Post('secrets/webhook-verify-token/generate')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaGeneratedTokenDto })
  generateVerifyToken(
    @CurrentAdmin() a: AdminContext,
    @Body() b: MetaTokenGenerateDto,
    @Ip() ip: string,
  ) {
    return this.cfg.generateVerifyToken(a, b.confirm, ip);
  }

  @Delete('secrets/webhook-verify-token')
  @ApiOkResponse({ type: MetaAdminConfigDto })
  clearVerifyToken(
    @CurrentAdmin() a: AdminContext,
    @Body() _b: MetaSecretClearDto,
    @Ip() ip: string,
  ) {
    return this.cfg.clearSecret(a, 'webhookVerifyToken', ip);
  }

  @Post('test/credentials')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaTestResultDto })
  testCredentials(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.diag.testCredentials(a, ip);
  }

  @Post('test/oauth')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaTestResultDto })
  testOAuth(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.diag.testOAuth(a, ip);
  }

  @Post('test/webhook')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaTestResultDto })
  testWebhook(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.diag.testWebhook(a, ip);
  }

  @Post('test/connectivity')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaTestResultDto })
  testConnectivity(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.diag.testConnectivity(a, ip);
  }

  @Get('diagnostics')
  @ApiOkResponse({ type: MetaDiagnosticsDto })
  diagnostics() {
    return this.diag.diagnostics();
  }

  @Get('security')
  @ApiOkResponse({ type: MetaSecurityStatusDto })
  security() {
    return this.diag.securityStatus();
  }

  @Post('security/reencrypt')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaReencryptResultDto })
  reencrypt(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.diag.reencrypt(a, ip);
  }

  @Get('activity')
  @ApiOkResponse({ type: MetaActivityListDto })
  activity(@Query() q: MetaActivityQueryDto) {
    return this.diag.activity(q);
  }
}
