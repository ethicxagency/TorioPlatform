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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  bulkResultSchema,
  customerActivityListSchema,
  customerBulkSchema,
  customerConversationListSchema,
  customerDirectorySchema,
  customerExportQuerySchema,
  customerImportSchema,
  customerInputSchema,
  customerListItemSchema,
  customerNoteInputSchema,
  customerNoteListSchema,
  customerQuerySchema,
  customerSummarySchema,
  customerTagListSchema,
  leadImportResultSchema,
  updateCustomerSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { AuthorizationService } from '../authorization/authorization.service';
import { CustomersService } from './customers.service';

class CustomerQueryDto extends createZodDto(customerQuerySchema) {}
class CustomerExportQueryDto extends createZodDto(customerExportQuerySchema) {}
class CustomerDirectoryDto extends createZodDto(customerDirectorySchema) {}
class CustomerItemDto extends createZodDto(customerListItemSchema) {}
class CustomerSummaryDto extends createZodDto(customerSummarySchema) {}
class CustomerTagListDto extends createZodDto(customerTagListSchema) {}
class CreateCustomerDto extends createZodDto(customerInputSchema) {}
class UpdateCustomerDto extends createZodDto(updateCustomerSchema) {}
class CustomerNoteListDto extends createZodDto(customerNoteListSchema) {}
class CustomerNoteInputDto extends createZodDto(customerNoteInputSchema) {}
class CustomerActivityListDto extends createZodDto(customerActivityListSchema) {}
class CustomerConversationListDto extends createZodDto(customerConversationListSchema) {}
class CustomerBulkDto extends createZodDto(customerBulkSchema) {}
class CustomerBulkResultDto extends createZodDto(bulkResultSchema) {}
class CustomerImportDto extends createZodDto(customerImportSchema) {}
class CustomerImportResultDto extends createZodDto(leadImportResultSchema) {}

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerDirectoryDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: CustomerQueryDto) {
    return this.customers.list(ws, q);
  }

  @Get('tags')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerTagListDto })
  tags(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.customers.tags(ws);
  }

  @Get('summary')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.customers.summary(ws);
  }

  @Get('export')
  @RequirePermission('customers:read')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  export(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: CustomerExportQueryDto) {
    return this.customers.exportCsv(ws, q, q.ids);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerImportResultDto })
  import(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: CustomerImportDto) {
    return this.customers.importRows(ws, body.rows);
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerBulkResultDto })
  bulk(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: CustomerBulkDto) {
    return this.customers.bulk(ws, body);
  }

  @Post()
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerItemDto })
  create(@Param('workspaceId', ParseUUIDPipe) ws: string, @Body() body: CreateCustomerDto) {
    return this.customers.create(ws, body);
  }

  @Get(':customerId')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerItemDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
  ) {
    return this.customers.get(ws, id);
  }

  @Patch(':customerId')
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerItemDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customers.update(ws, id, body);
  }

  @Delete(':customerId')
  @HttpCode(204)
  @RequirePermission('customers:delete')
  remove(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
  ) {
    return this.customers.remove(ws, id);
  }

  @Get(':customerId/activity')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerActivityListDto })
  activity(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
  ) {
    return this.customers.activity(ws, id);
  }

  @Get(':customerId/conversations')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerConversationListDto })
  conversations(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
  ) {
    return this.customers.conversations(ws, id);
  }

  @Get(':customerId/notes')
  @RequirePermission('customers:read')
  @ApiOkResponse({ type: CustomerNoteListDto })
  notes(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
  ) {
    return this.customers.notes(ws, id);
  }

  @Post(':customerId/notes')
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerNoteListDto })
  addNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CustomerNoteInputDto,
  ) {
    return this.customers.addNote(ws, id, u.id, body.body);
  }

  @Patch(':customerId/notes/:noteId')
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerNoteListDto })
  editNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CustomerNoteInputDto,
  ) {
    return this.customers.updateNote(ws, id, noteId, u.id, body.body);
  }

  @Delete(':customerId/notes/:noteId')
  @RequirePermission('customers:update')
  @ApiOkResponse({ type: CustomerNoteListDto })
  async deleteNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('customerId', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() u: AuthUser,
  ) {
    const canModerate =
      !!(await this.authz.getMembership(u.id, ws)) &&
      (await this.authz.assertPermission(u.id, ws, 'customers:delete').then(
        () => true,
        () => false,
      ));
    return this.customers.removeNote(ws, id, noteId, u.id, canModerate);
  }
}
