import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createOrderSchema,
  orderBulkResultSchema,
  orderBulkSchema,
  orderDetailSchema,
  orderExportQuerySchema,
  orderListSchema,
  orderNoteInputSchema,
  orderQuerySchema,
  orderSummaryQuerySchema,
  orderSummarySchema,
  recordPaymentSchema,
  setFulfillmentSchema,
  setOrderStatusSchema,
  updateOrderSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { AuthorizationService } from '../authorization/authorization.service';
import { OrdersService } from './orders.service';

class OrderQueryDto extends createZodDto(orderQuerySchema) {}
class OrderExportQueryDto extends createZodDto(orderExportQuerySchema) {}
class OrderSummaryQueryDto extends createZodDto(orderSummaryQuerySchema) {}
class OrderListDto extends createZodDto(orderListSchema) {}
class OrderDetailDto extends createZodDto(orderDetailSchema) {}
class OrderSummaryDto extends createZodDto(orderSummarySchema) {}
class CreateOrderDto extends createZodDto(createOrderSchema) {}
class UpdateOrderDto extends createZodDto(updateOrderSchema) {}
class SetOrderStatusDto extends createZodDto(setOrderStatusSchema) {}
class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class SetFulfillmentDto extends createZodDto(setFulfillmentSchema) {}
class OrderNoteInputDto extends createZodDto(orderNoteInputSchema) {}
class OrderBulkDto extends createZodDto(orderBulkSchema) {}
class OrderBulkResultDto extends createZodDto(orderBulkResultSchema) {}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('orders:read')
  @ApiOkResponse({ type: OrderListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: OrderQueryDto) {
    return this.orders.list(ws, q);
  }

  @Get('summary')
  @RequirePermission('orders:read')
  @ApiOkResponse({ type: OrderSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: OrderSummaryQueryDto) {
    return this.orders.summary(ws, q);
  }

  @Get('export')
  @RequirePermission('orders:read')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders.csv"')
  export(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: OrderExportQueryDto) {
    return this.orders.exportCsv(ws, q, q.ids);
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderBulkResultDto })
  bulk(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: OrderBulkDto,
  ) {
    return this.orders.bulk(ws, u.id, body);
  }

  @Post()
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CreateOrderDto,
  ) {
    return this.orders.create(ws, u.id, body);
  }

  @Get(':orderId')
  @RequirePermission('orders:read')
  @ApiOkResponse({ type: OrderDetailDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.orders.get(ws, id);
  }

  @Patch(':orderId')
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: UpdateOrderDto,
  ) {
    return this.orders.update(ws, u.id, id, body);
  }

  @Post(':orderId/status')
  @HttpCode(200)
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  status(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: SetOrderStatusDto,
  ) {
    return this.orders.setStatus(ws, u.id, id, body.status);
  }

  @Post(':orderId/payments')
  @RequirePermission('orders:payments')
  @ApiOkResponse({ type: OrderDetailDto })
  payment(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: RecordPaymentDto,
  ) {
    return this.orders.recordPayment(ws, u.id, id, body);
  }

  @Put(':orderId/fulfillment')
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  fulfillment(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: SetFulfillmentDto,
  ) {
    return this.orders.setFulfillment(ws, u.id, id, body);
  }

  @Post(':orderId/notes')
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  addNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: OrderNoteInputDto,
  ) {
    return this.orders.addNote(ws, u.id, id, body.body);
  }

  @Patch(':orderId/notes/:noteId')
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  updateNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() u: AuthUser,
    @Body() body: OrderNoteInputDto,
  ) {
    return this.orders.updateNote(ws, u.id, id, noteId, body.body);
  }

  @Delete(':orderId/notes/:noteId')
  @RequirePermission('orders:write')
  @ApiOkResponse({ type: OrderDetailDto })
  async removeNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() u: AuthUser,
  ) {
    const canModerate = await this.authz.assertPermission(u.id, ws, 'orders:payments').then(
      () => true,
      () => false,
    );
    return this.orders.removeNote(ws, u.id, id, noteId, canModerate);
  }
}
