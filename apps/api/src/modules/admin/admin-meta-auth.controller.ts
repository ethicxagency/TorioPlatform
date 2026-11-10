import { Body, Controller, Delete, Get, HttpCode, Ip, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  metaAuthConfigSchema,
  metaAuthSaveSchema,
  metaSecretClearSchema,
  metaSecretSchema,
  metaTestResultSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { MetaAuthConfigService } from '../meta-config/meta-auth-config.service';
import { AdminGuard, CurrentAdmin, type AdminContext } from './admin-auth';

class MetaAuthConfigDto extends createZodDto(metaAuthConfigSchema) {}
class MetaAuthSaveDto extends createZodDto(metaAuthSaveSchema) {}
class MetaAuthSecretDto extends createZodDto(metaSecretSchema) {}
class MetaAuthSecretClearDto extends createZodDto(metaSecretClearSchema) {}
class MetaAuthTestResultDto extends createZodDto(metaTestResultSchema) {}

/**
 * Super Admin → Integrations → Meta Developer → Customer Authentication app (Torio Auth). Separate from the Business
 * Messaging app's routes and storage. Every route needs an admin session; responses never contain the secret.
 */
@ApiTags('admin meta auth')
@Public()
@UseGuards(AdminGuard)
@Controller('admin/integrations/meta-auth')
export class AdminMetaAuthController {
  constructor(private readonly cfg: MetaAuthConfigService) {}

  @Get('config')
  @ApiOkResponse({ type: MetaAuthConfigDto })
  config() {
    return this.cfg.adminView();
  }

  @Put('config')
  @ApiOkResponse({ type: MetaAuthConfigDto })
  save(@CurrentAdmin() a: AdminContext, @Body() b: MetaAuthSaveDto, @Ip() ip: string) {
    return this.cfg.save(a, b.patch, ip);
  }

  @Put('secrets/app-secret')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaAuthConfigDto })
  setSecret(@CurrentAdmin() a: AdminContext, @Body() b: MetaAuthSecretDto, @Ip() ip: string) {
    return this.cfg.setSecret(a, b.value, ip);
  }

  @Delete('secrets/app-secret')
  @ApiOkResponse({ type: MetaAuthConfigDto })
  clearSecret(
    @CurrentAdmin() a: AdminContext,
    @Body() _b: MetaAuthSecretClearDto,
    @Ip() ip: string,
  ) {
    return this.cfg.clearSecret(a, ip);
  }

  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: MetaAuthTestResultDto })
  test(@CurrentAdmin() a: AdminContext, @Ip() ip: string) {
    return this.cfg.test(a, ip);
  }
}
