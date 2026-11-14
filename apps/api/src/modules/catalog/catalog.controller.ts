import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  catalogBulkDeleteSchema,
  catalogBulkResultSchema,
  catalogBulkStatusSchema,
  catalogFeedSchema,
  catalogFeedUpdateSchema,
  catalogImportPreviewSchema,
  catalogImportResultSchema,
  catalogImportRunSchema,
  catalogImportSourceSchema,
  catalogListQuerySchema,
  catalogListSchema,
  catalogProductInputSchema,
  catalogProductSchema,
  catalogProductUpdateSchema,
  catalogStatsSchema,
  outboundFeedCreateSchema,
  outboundFeedPreviewSchema,
  outboundFeedSchema,
  outboundFeedUpdateSchema,
  salesChannelsSchema,
  syncActivitySchema,
} from '@torio/contracts';
import { timingSafeEqual } from 'node:crypto';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { CatalogFeedService } from './catalog-feed.service';
import { CatalogImportService } from './catalog-import.service';
import { CatalogService } from './catalog.service';

class CatalogListQueryDto extends createZodDto(catalogListQuerySchema) {}
class CatalogListDto extends createZodDto(catalogListSchema) {}
class CatalogStatsDto extends createZodDto(catalogStatsSchema) {}
class CatalogProductDto extends createZodDto(catalogProductSchema) {}
class CatalogProductInputDto extends createZodDto(catalogProductInputSchema) {}
class CatalogProductUpdateDto extends createZodDto(catalogProductUpdateSchema) {}
class CatalogBulkStatusDto extends createZodDto(catalogBulkStatusSchema) {}
class CatalogBulkDeleteDto extends createZodDto(catalogBulkDeleteSchema) {}
class CatalogBulkResultDto extends createZodDto(catalogBulkResultSchema) {}
class CatalogImportSourceDto extends createZodDto(catalogImportSourceSchema) {}
class CatalogImportPreviewDto extends createZodDto(catalogImportPreviewSchema) {}
class CatalogImportRunDto extends createZodDto(catalogImportRunSchema) {}
class CatalogImportResultDto extends createZodDto(catalogImportResultSchema) {}
class CatalogFeedDto extends createZodDto(catalogFeedSchema) {}
class CatalogFeedUpdateDto extends createZodDto(catalogFeedUpdateSchema) {}
class CatalogSyncActivityDto extends createZodDto(z.array(syncActivitySchema)) {}
class CatalogFeedListDto extends createZodDto(z.array(catalogFeedSchema)) {}
class CatalogSalesChannelsDto extends createZodDto(salesChannelsSchema) {}
class CatalogOutboundFeedDto extends createZodDto(outboundFeedSchema) {}
class CatalogOutboundCreateDto extends createZodDto(outboundFeedCreateSchema) {}
class CatalogOutboundUpdateDto extends createZodDto(outboundFeedUpdateSchema) {}
class CatalogOutboundPreviewDto extends createZodDto(outboundFeedPreviewSchema) {}

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly imports: CatalogImportService,
    private readonly feeds: CatalogFeedService,
  ) {}

  // ---- products ----

  @Get('products')
  @RequirePermission('catalog:read')
  @ApiOkResponse({ type: CatalogListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: CatalogListQueryDto) {
    return this.catalog.list(ws, q);
  }

  @Get('stats')
  @RequirePermission('catalog:read')
  @ApiOkResponse({ type: CatalogStatsDto })
  stats(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.catalog.stats(ws);
  }

  @Get('products/:id')
  @RequirePermission('catalog:read')
  @ApiOkResponse({ type: CatalogProductDto })
  get(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('id') id: string) {
    return this.catalog.get(ws, id);
  }

  @Post('products')
  @RequirePermission('catalog:write')
  @ApiOkResponse({ type: CatalogProductDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CatalogProductInputDto,
  ) {
    return this.catalog.create(ws, u.id, body);
  }

  @Put('products/:id')
  @RequirePermission('catalog:write')
  @ApiOkResponse({ type: CatalogProductDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: CatalogProductUpdateDto,
  ) {
    return this.catalog.update(ws, u.id, id, body);
  }

  @Post('products/bulk-status')
  @HttpCode(200)
  @RequirePermission('catalog:write')
  @ApiOkResponse({ type: CatalogBulkResultDto })
  bulkStatus(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CatalogBulkStatusDto,
  ) {
    return this.catalog.setStatus(ws, u.id, body.ids, body.status);
  }

  @Post('products/bulk-delete')
  @HttpCode(200)
  @RequirePermission('catalog:delete')
  @ApiOkResponse({ type: CatalogBulkResultDto })
  bulkDelete(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CatalogBulkDeleteDto,
  ) {
    return this.catalog.remove(ws, u.id, body.ids);
  }

  // ---- importing ----

  @Post('import/preview')
  @HttpCode(200)
  @RequirePermission('catalog:import')
  @ApiOkResponse({ type: CatalogImportPreviewDto })
  preview(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: CatalogImportSourceDto) {
    return this.imports.preview(ws, body);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('catalog:import')
  @ApiOkResponse({ type: CatalogImportResultDto })
  run(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CatalogImportRunDto,
  ) {
    return this.imports.run(ws, u.id, body);
  }

  // ---- saved product feeds (inbound) ----

  @Get('feeds')
  @RequirePermission('catalog:read')
  @ApiOkResponse({ type: CatalogFeedListDto })
  feedList(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.imports.feeds(ws);
  }

  @Patch('feeds/:id')
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogFeedDto })
  feedUpdate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CatalogFeedUpdateDto,
  ) {
    return this.imports.updateFeed(ws, id, body);
  }

  @Post('feeds/:id/pause')
  @HttpCode(200)
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogFeedDto })
  feedPause(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.setPaused(ws, id, true);
  }

  @Post('feeds/:id/resume')
  @HttpCode(200)
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogFeedDto })
  feedResume(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.setPaused(ws, id, false);
  }

  @Post('feeds/:id/sync')
  @HttpCode(200)
  @RequirePermission('catalog:import')
  @ApiOkResponse({ type: CatalogImportResultDto })
  feedSync(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.sync(ws, u.id, id);
  }

  @Delete('feeds/:id')
  @RequirePermission('catalog:feeds')
  deleteFeed(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.deleteFeed(ws, id);
  }

  @Get('activity')
  @RequirePermission('catalog:read')
  @ApiOkResponse({ type: CatalogSyncActivityDto })
  activity(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.imports.activity(ws);
  }

  // ---- sales channels (outbound feeds) ----

  @Get('channels')
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogSalesChannelsDto })
  channels(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.feeds.channels(ws);
  }

  @Post('channels/feeds')
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogOutboundFeedDto })
  channelCreate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CatalogOutboundCreateDto,
  ) {
    return this.feeds.create(ws, u.id, body);
  }

  @Patch('channels/feeds/:id')
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogOutboundFeedDto })
  channelUpdate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CatalogOutboundUpdateDto,
  ) {
    return this.feeds.update(ws, u.id, id, body);
  }

  @Post('channels/feeds/:id/rotate')
  @HttpCode(200)
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogOutboundFeedDto })
  channelRotate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeds.rotate(ws, u.id, id);
  }

  @Get('channels/feeds/:id/preview')
  @RequirePermission('catalog:feeds')
  @ApiOkResponse({ type: CatalogOutboundPreviewDto })
  channelPreview(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeds.preview(ws, id);
  }

  @Delete('channels/feeds/:id')
  @RequirePermission('catalog:feeds')
  channelDelete(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeds.remove(ws, u.id, id);
  }
}

/** The published feed. Public by necessity (a marketplace fetches it); it is gated only by its unguessable token. */
@ApiExcludeController()
@Controller('catalog-feed')
export class CatalogFeedPublicController {
  constructor(private readonly feeds: CatalogFeedService) {}

  @Public()
  @SkipThrottle()
  @Get(':token')
  @ApiProduces('application/xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=60')
  @Header('X-Robots-Tag', 'noindex')
  serve(@Param('token') token: string) {
    return this.feeds.serve(token);
  }
}

/** Lets a scheduler run due catalog feed syncs. Off (404) unless CRON_SECRET is set and matches. */
@ApiTags('internal')
@Controller('internal/catalog')
export class CatalogTickController {
  constructor(
    private readonly imports: CatalogImportService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Public()
  @Get('tick')
  async tick(@Headers('authorization') auth?: string) {
    const secret = this.cfg.CRON_SECRET;
    const given = (auth ?? '').replace(/^Bearer\s+/i, '');
    const ok =
      !!secret &&
      given.length === secret.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new NotFoundException();
    return this.imports.tickDue();
  }
}
