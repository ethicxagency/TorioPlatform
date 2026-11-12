import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  brainDocumentWithMaturitySchema,
  importOverviewSchema,
  saveBrainSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';

class BrainDocumentDto extends createZodDto(brainDocumentWithMaturitySchema) {}
class ImportOverviewDto extends createZodDto(importOverviewSchema) {}
class SaveBrainDto extends createZodDto(saveBrainSchema) {}

@ApiTags('brain')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/brain')
export class BrainController {
  constructor(
    private readonly brain: BrainService,
    private readonly imports: ImportsService,
  ) {}

  @Get()
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: BrainDocumentDto })
  get(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.brain.get(ws);
  }

  @Get('imports')
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: ImportOverviewDto })
  importOverview(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.imports.overview(ws);
  }

  @Put()
  @RequirePermission('brain:write')
  @ApiOkResponse({ type: BrainDocumentDto })
  save(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: SaveBrainDto,
  ) {
    return this.brain.save(ws, u.id, body.config, body.baseVersion);
  }
}
