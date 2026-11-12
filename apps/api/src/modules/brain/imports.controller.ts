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
  Res,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  bulkReviewSchema,
  csvCreateSchema,
  csvPreviewRequestSchema,
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
  productReviewSchema,
  provenanceSchema,
  resolveProductSchema,
  reviewRecordSchema,
  websiteScanSchema,
} from '@torio/contracts';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { ImportsService } from './imports.service';
import { CsvImportService } from './imports/csv-import.service';
import { FeedService } from './imports/feed.service';
import { GoogleMerchantService } from './imports/google-merchant.service';
import { MetaCatalogService } from './imports/meta-catalog.service';
import { ProductReviewService } from './imports/product-review.service';
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
class ProductReviewDto extends createZodDto(productReviewSchema) {}
class ResolveProductDto extends createZodDto(resolveProductSchema) {}
class ProvenanceDto extends createZodDto(provenanceSchema) {}
class CsvPreviewRequestDto extends createZodDto(csvPreviewRequestSchema) {}
class CsvCreateDto extends createZodDto(csvCreateSchema) {}
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
    private readonly google: GoogleMerchantService,
    private readonly products: ProductReviewService,
    private readonly csv: CsvImportService,
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

  @Get('google')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: MetaCatalogStatusDto })
  googleStatus(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.google.status(ws);
  }

  @Post('google/connect')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogUrlDto })
  googleConnect(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.google.connect(ws, u.id);
  }

  @Get('google/accounts')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogListDto })
  googleAccounts(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.google.accounts(ws);
  }

  @Post('google/account')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: MetaCatalogStatusDto })
  googleSelect(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Body() body: MetaCatalogSelectDto,
  ) {
    return this.google.select(ws, body.catalogId);
  }

  @Post('google/preview')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: FeedPreviewDto })
  googlePreview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.google.preview(ws);
  }

  @Post('google/sync')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  async googleSync(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.scans.detail(ws, await this.google.startJob(ws, u.id));
  }

  @Post('google/disconnect')
  @HttpCode(200)
  @RequirePermission('brain:write')
  googleDisconnect(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.google.disconnect(ws);
  }

  @Post('csv/preview')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: FeedPreviewDto })
  previewCsv(@Param('workspaceId', ParseUUIDPipe) _ws: string, @Body() body: CsvPreviewRequestDto) {
    return this.csv.preview(body);
  }

  @Post('csv')
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportJobDetailDto })
  async createCsv(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CsvCreateDto,
  ) {
    return this.scans.detail(ws, await this.csv.create(ws, u.id, body));
  }

  @Get('provenance')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ProvenanceDto })
  provenance(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.imports.provenance(ws);
  }

  @Get('products')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ProductReviewDto })
  productReview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.products.list(ws);
  }

  @Post('products/resolve')
  @HttpCode(200)
  @RequirePermission('brain:write')
  resolveProduct(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: ResolveProductDto) {
    return this.products.resolve(ws, body);
  }

  @Post('products/approve-clear')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: BulkResultDto })
  approveClear(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.products.approveClear(ws);
  }

  @Post('products/import')
  @HttpCode(200)
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: ImportResultDto })
  importProducts(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.products.importApproved(ws, u.id);
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

/** Browser redirect target for the Merchant Center authorization. Public by necessity; trusted only through the signed state. */
@ApiExcludeController()
@Controller('brain/imports/google')
export class GoogleMerchantCallbackController {
  constructor(private readonly google: GoogleMerchantService) {}

  @Public()
  @SkipThrottle()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    res.redirect(302, await this.google.callback({ code, state, error }));
  }
}
