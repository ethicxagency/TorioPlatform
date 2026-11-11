import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  acceptedResultSchema,
  billingDetailsResponseSchema,
  cancelSubscriptionSchema,
  checkoutResultSchema,
  invoiceDetailSchema,
  invoiceListSchema,
  invoiceQuerySchema,
  overviewSchema,
  planChangeConfirmSchema,
  planChangeSchema,
  planListSchema,
  planPreviewSchema,
  savedPaymentMethodListSchema,
  usageSchema,
} from '@torio/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { BillingService } from './billing.service';

class BillingOverviewDto extends createZodDto(overviewSchema) {}
class BillingPlanListDto extends createZodDto(planListSchema) {}
class BillingUsageDto extends createZodDto(usageSchema) {}
class BillingProfileDto extends createZodDto(billingDetailsResponseSchema) {}
class SavedPaymentMethodListDto extends createZodDto(savedPaymentMethodListSchema) {}
class InvoiceListDto extends createZodDto(invoiceListSchema) {}
class InvoiceQueryDto extends createZodDto(invoiceQuerySchema) {}
class InvoiceDetailDto extends createZodDto(invoiceDetailSchema) {}
class PlanChangeDto extends createZodDto(planChangeSchema) {}
class PlanChangeConfirmDto extends createZodDto(planChangeConfirmSchema) {}
class PlanPreviewDto extends createZodDto(planPreviewSchema) {}
class CheckoutResultDto extends createZodDto(checkoutResultSchema) {}
class CancelSubscriptionDto extends createZodDto(cancelSubscriptionSchema) {}
class BillingAcceptedDto extends createZodDto(acceptedResultSchema) {}

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: BillingOverviewDto })
  overview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.billing.overview(ws);
  }

  @Get('plans')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: BillingPlanListDto })
  plans(@Param('workspaceId', ParseUUIDPipe) _ws: string) {
    return this.billing.plans();
  }

  @Get('usage')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: BillingUsageDto })
  usage(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.billing.usage(ws);
  }

  @Get('profile')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: BillingProfileDto })
  profile(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.billing.profile(ws);
  }

  @Get('payment-methods')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: SavedPaymentMethodListDto })
  paymentMethods(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.billing.paymentMethods(ws);
  }

  @Post('payment-methods/session')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: CheckoutResultDto })
  paymentMethodSession(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.billing.paymentMethodSession(ws, u.id);
  }

  @Post('payment-methods/:id/default')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: SavedPaymentMethodListDto })
  makeDefault(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.billing.setDefaultPaymentMethod(ws, u.id, id);
  }

  @Delete('payment-methods/:id')
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: SavedPaymentMethodListDto })
  removePaymentMethod(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.billing.removePaymentMethod(ws, u.id, id);
  }

  @Get('invoices')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: InvoiceListDto })
  invoices(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: InvoiceQueryDto) {
    return this.billing.invoices(ws, q);
  }

  @Get('invoices/:id')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: InvoiceDetailDto })
  invoice(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.invoice(ws, id);
  }

  @Get('invoices/:id/pdf')
  @RequirePermission('billing:read')
  @ApiProduces('application/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, body } = await this.billing.invoicePdf(ws, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
    );
    res.end(body);
  }

  @Post('invoices/:id/retry')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: BillingAcceptedDto })
  retry(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.billing.retryInvoice(ws, u.id, id);
  }

  @Post('subscription/preview')
  @HttpCode(200)
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: PlanPreviewDto })
  preview(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: PlanChangeDto) {
    return this.billing.preview(ws, body);
  }

  @Post('subscription/checkout')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: CheckoutResultDto })
  checkout(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: PlanChangeDto,
  ) {
    return this.billing.checkout(ws, u.id, body);
  }

  @Post('subscription/change')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: BillingAcceptedDto })
  change(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: PlanChangeConfirmDto,
  ) {
    return this.billing.change(ws, u.id, body);
  }

  @Post('subscription/cancel')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: BillingAcceptedDto })
  cancel(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CancelSubscriptionDto,
  ) {
    return this.billing.cancel(ws, u.id, body);
  }

  @Post('subscription/resume')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @ApiOkResponse({ type: BillingAcceptedDto })
  resume(@Param('workspaceId', ParseUUIDPipe) ws: string, @CurrentUser() u: AuthUser) {
    return this.billing.resume(ws, u.id);
  }
}
