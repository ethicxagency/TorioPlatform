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
  leadActivityListSchema,
  leadBulkSchema,
  leadExportQuerySchema,
  leadImportResultSchema,
  leadImportSchema,
  leadInputSchema,
  leadListSchema,
  leadNoteSchema,
  leadQuerySchema,
  leadSchema,
  leadSummarySchema,
  updateLeadSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { LeadsService } from './leads.service';

class LeadQueryDto extends createZodDto(leadQuerySchema) {}
class LeadExportQueryDto extends createZodDto(leadExportQuerySchema) {}
class LeadListDto extends createZodDto(leadListSchema) {}
class LeadDto extends createZodDto(leadSchema) {}
class LeadSummaryDto extends createZodDto(leadSummarySchema) {}
class CreateLeadDto extends createZodDto(leadInputSchema) {}
class UpdateLeadDto extends createZodDto(updateLeadSchema) {}
class LeadNoteDto extends createZodDto(leadNoteSchema) {}
class LeadActivityListDto extends createZodDto(leadActivityListSchema) {}
class LeadBulkDto extends createZodDto(leadBulkSchema) {}
class LeadBulkResultDto extends createZodDto(bulkResultSchema) {}
class LeadImportDto extends createZodDto(leadImportSchema) {}
class LeadImportResultDto extends createZodDto(leadImportResultSchema) {}

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermission('leads:read')
  @ApiOkResponse({ type: LeadListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: LeadQueryDto) {
    return this.leads.list(ws, q);
  }

  @Get('summary')
  @RequirePermission('leads:read')
  @ApiOkResponse({ type: LeadSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.leads.summary(ws);
  }

  @Get('export')
  @RequirePermission('leads:read')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  export(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: LeadExportQueryDto) {
    return this.leads.exportCsv(ws, q, q.ids);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('leads:write')
  @ApiOkResponse({ type: LeadImportResultDto })
  import(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: LeadImportDto,
  ) {
    return this.leads.importRows(ws, u.id, body.rows);
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('leads:write')
  @ApiOkResponse({ type: LeadBulkResultDto })
  bulk(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: LeadBulkDto,
  ) {
    return this.leads.bulk(ws, u.id, body);
  }

  @Post()
  @RequirePermission('leads:write')
  @ApiOkResponse({ type: LeadDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CreateLeadDto,
  ) {
    return this.leads.create(ws, u.id, body);
  }

  @Get(':leadId')
  @RequirePermission('leads:read')
  @ApiOkResponse({ type: LeadDto })
  get(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('leadId', ParseUUIDPipe) id: string) {
    return this.leads.get(ws, id);
  }

  @Patch(':leadId')
  @RequirePermission('leads:write')
  @ApiOkResponse({ type: LeadDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('leadId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: UpdateLeadDto,
  ) {
    return this.leads.update(ws, id, u.id, body);
  }

  @Delete(':leadId')
  @HttpCode(204)
  @RequirePermission('leads:delete')
  remove(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('leadId', ParseUUIDPipe) id: string,
  ) {
    return this.leads.remove(ws, id);
  }

  @Get(':leadId/activities')
  @RequirePermission('leads:read')
  @ApiOkResponse({ type: LeadActivityListDto })
  activities(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('leadId', ParseUUIDPipe) id: string,
  ) {
    return this.leads.activities(ws, id);
  }

  @Post(':leadId/notes')
  @RequirePermission('leads:write')
  @ApiOkResponse({ type: LeadActivityListDto })
  addNote(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('leadId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: LeadNoteDto,
  ) {
    return this.leads.addNote(ws, id, u.id, body.body);
  }
}
