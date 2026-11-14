import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  integrationEnableSchema,
  integrationSecretValueSchema,
  integrationTestResultSchema,
  metaEventListSchema,
  metaEventQuerySchema,
  metaRetryResultSchema,
  workspacePixelSaveSchema,
  workspacePixelSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { WorkspacePixelService } from './workspace-pixel.service';

class WorkspacePixelDto extends createZodDto(workspacePixelSchema) {}
class WorkspacePixelSaveDto extends createZodDto(workspacePixelSaveSchema) {}
class WorkspacePixelTokenDto extends createZodDto(integrationSecretValueSchema) {}
class WorkspacePixelEnableDto extends createZodDto(integrationEnableSchema) {}
class WorkspacePixelTestResultDto extends createZodDto(integrationTestResultSchema) {}
class WorkspacePixelEventListDto extends createZodDto(metaEventListSchema) {}
class WorkspacePixelEventQueryDto extends createZodDto(metaEventQuerySchema) {}
class WorkspacePixelRetryDto extends createZodDto(metaRetryResultSchema) {}

/**
 * Settings → Integrations → Meta Pixel for one workspace. Needs `workspace:update` (Owner and Admin by default) for everything,
 * including reading the event log; the token is write-only and no response ever carries it.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/integrations/meta-pixel')
export class WorkspacePixelController {
  constructor(private readonly pixel: WorkspacePixelService) {}

  @Get()
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspacePixelDto })
  view(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.pixel.view(ws);
  }

  @Put()
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspacePixelDto })
  save(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() b: WorkspacePixelSaveDto,
  ) {
    return this.pixel.save(ws, u.id, b);
  }

  @Put('token')
  @RequirePermission('workspace:update')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: WorkspacePixelDto })
  token(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() b: WorkspacePixelTokenDto,
  ) {
    return this.pixel.setToken(ws, u.id, b.value);
  }

  @Delete()
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspacePixelDto })
  disconnect(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.pixel.disconnect(ws, u.id);
  }

  @Put('enabled')
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspacePixelDto })
  enable(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() b: WorkspacePixelEnableDto,
  ) {
    return this.pixel.setEnabled(ws, u.id, b.enabled);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermission('workspace:update')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: WorkspacePixelTestResultDto })
  test(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.pixel.test(ws, u.id);
  }

  @Post('test-event')
  @HttpCode(200)
  @RequirePermission('workspace:update')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: WorkspacePixelTestResultDto })
  testEvent(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.pixel.testEvent(ws, u.id);
  }

  @Get('events')
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspacePixelEventListDto })
  events(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: WorkspacePixelEventQueryDto) {
    return this.pixel.eventLog(ws, q.page, q.pageSize, q.status);
  }

  @Post('events/retry')
  @HttpCode(200)
  @RequirePermission('workspace:update')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: WorkspacePixelRetryDto })
  retry(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.pixel.retry(ws);
  }
}
