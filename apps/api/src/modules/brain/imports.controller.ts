import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  bulkReviewSchema,
  feedCreateSchema,
  feedPreviewRequestSchema,
  feedPreviewSchema,
  importApproveSchema,
  metaCatalogListSchema,
  metaCatalogSelectSchema,
  metaCatalogStatusSchema,
  metaConnectUrlSchema,
  importJobDetailSchema,
  importOverviewSchema,
  importRecordListSchema,
  importRecordViewSchema,
  importResultSchema,
  reviewRecordSchema,
  websiteScanSchema,
} from '@torio/contracts';
import { timingSafeEqual } from 'node:crypto';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { ImportsService } from './imports.service';
import { FeedService } from './imports/feed.service';
import { MetaCatalogService } from './imports/meta-catalog.service';
import { ScanService } from './imports/scan.service';

class ImportOverviewDto extends createZodDto(importOverviewSchema) {}
class WebsiteScanDto extends createZodDto(websiteScanSchema) {}
class ImportJobDetailDto extends createZodDto(importJobDetailSchema) {}
class ImportRecordListDto extends createZodDto(importRecordListSchema) {}
class ImportRecordDto extends createZodDto(importRecordViewSchema) {}
class ReviewRecordDto extends createZodDto(reviewRecordSchema) {}
class BulkReviewDto extends createZodDto(bulkReviewSchema) {}
class ImportApproveDto extends createZodDto(importApproveSchema) {}
class ImportResultDto extends createZodDto(importResultSchema) {}
class FeedPreviewRequestDto extends createZodDto(feedPreviewRequestSchema) {}
class FeedPreviewDto extends createZodDto(feedPreviewSchema) {}
class FeedCreateDto extends createZodDto(feedCreateSchema) {}
class MetaCatalogStatusDto extends createZodDto(metaCatalogStatusSchema) {}
class MetaCatalogListDto extends createZodDto(metaCatalogListSchema) {}
class MetaCatalogSelectDto extends createZodDto(metaCatalogSelectSchema) {}
class MetaCatalogUrlDto extends createZodDto(metaConnectUrlSchema) {}
class BulkResultDto extends createZodDto(z.object({ updated: z.number().int() })) {}

const BASE = 'workspaces/:workspaceId/brain/imports';

@ApiTags('brain')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller(BASE)
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly scans: ScanService,
    private readonly feeds: FeedService,
    private readonly metaCatalog: MetaCatalogService,
  ) {}

  @Get()
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ImportOverviewDto })
  overview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.imports.overview(ws);
  }

  @Post('website')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  start(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: WebsiteScanDto,
  ) {
    return this.scans.start(ws, u.id, body);
  }

  @Post('feed/preview')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: FeedPreviewDto })
  previewFeed(
    @Param('workspaceId', ParseUUIDPipe) _ws: string,
    @Body() body: FeedPreviewRequestDto,
  ) {
    return this.feeds.preview(body.url, body.mapping, body.currency);
  }

  @Post('feed')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  async createFeed(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: FeedCreateDto,
  ) {
    return this.scans.detail(ws, await this.feeds.create(ws, u.id, body));
  }

  @Post('sources/:sourceId/sync')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  async sync(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('sourceId', ParseUUIDPipe) id: string,
  ) {
    return this.scans.detail(ws, await this.feeds.startJob(ws, u.id, id));
  }

  @Post('sources/:sourceId/disconnect')
  @HttpCode(200)
  @RequirePermission('brain:write')
  disconnect(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('sourceId', ParseUUIDPipe) id: string,
  ) {
    return this.feeds.disconnect(ws, id);
  }

  @Get('meta')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: MetaCatalogStatusDto })
  metaStatus(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.metaCatalog.status(ws);
  }

  @Post('meta/connect')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogUrlDto })
  metaConnect(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.metaCatalog.connect(ws, u.id);
  }

  @Get('meta/catalogs')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogListDto })
  metaCatalogs(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.metaCatalog.catalogs(ws);
  }

  @Post('meta/catalog')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogStatusDto })
  metaSelect(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: MetaCatalogSelectDto) {
    return this.metaCatalog.select(ws, body.catalogId);
  }

  @Post('meta/preview')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: FeedPreviewDto })
  metaPreview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.metaCatalog.preview(ws);
  }

  @Post('meta/sync')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  async metaSync(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.scans.detail(ws, await this.metaCatalog.startJob(ws, u.id));
  }

  @Post('meta/disconnect')
  @HttpCode(200)
  @RequirePermission('brain:write')
  metaDisconnect(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.metaCatalog.disconnect(ws);
  }

  @Get('jobs/:jobId')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ImportJobDetailDto })
  job(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('jobId', ParseUUIDPipe) id: string) {
    return this.scans.detail(ws, id);
  }

  /** Advances an active scan by a few pages. The page calls this while a scan is open; each call is time-boxed. */
  @Post('jobs/:jobId/step')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  step(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('jobId', ParseUUIDPipe) id: string) {
    return this.scans.step(ws, id);
  }

  @Post('jobs/:jobId/cancel')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  cancel(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('jobId', ParseUUIDPipe) id: string,
  ) {
    return this.scans.cancel(ws, id);
  }

  @Post('jobs/:jobId/retry')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  retry(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('jobId', ParseUUIDPipe) id: string,
  ) {
    return this.scans.retry(ws, u.id, id);
  }

  @Get('jobs/:jobId/records')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ImportRecordListDto })
  records(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('jobId', ParseUUIDPipe) id: string,
  ) {
    return this.scans.records(ws, id);
  }

  @Post('jobs/:jobId/records/review')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: BulkResultDto })
  bulk(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('jobId', ParseUUIDPipe) id: string,
    @Body() body: BulkReviewDto,
  ) {
    return this.scans.bulk(ws, id, body.status, body.categories);
  }

  @Post('jobs/:jobId/import')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportResultDto })
  import(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Param('jobId', ParseUUIDPipe) id: string,
    @Body() body: ImportApproveDto,
  ) {
    return this.scans.importApproved(ws, u.id, id, body.categories);
  }

  @Patch('records/:recordId')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportRecordDto })
  review(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('recordId', ParseUUIDPipe) id: string,
    @Body() body: ReviewRecordDto,
  ) {
    return this.scans.review(ws, id, body);
  }
}

/** Lets a scheduler resume scans nobody has open. Off (404) unless CRON_SECRET is set and matches. */
@ApiTags('internal')
@Controller('internal/imports')
export class ImportsTickController {
  constructor(
    private readonly scans: ScanService,
    private readonly feeds: FeedService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Public()
  @Get('tick')
  async tick(@Headers('authorization') auth?: string, @Query() _q?: unknown) {
    const secret = this.cfg.CRON_SECRET;
    const given = (auth ?? '').replace(/^Bearer\s+/i, '');
    const ok =
      !!secret &&
      given.length === secret.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new NotFoundException();
    const a = await this.scans.tick();
    const b = await this.feeds.tickDue();
    return { ...a, ...b };
  }
}
