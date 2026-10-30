import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { brainDocumentSchema, saveBrainSchema } from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { BrainService } from './brain.service';

class BrainDocumentDto extends createZodDto(brainDocumentSchema) {}
class SaveBrainDto extends createZodDto(saveBrainSchema) {}

@ApiTags('brain')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/brain')
export class BrainController {
  constructor(private readonly brain: BrainService) {}

  @Get()
  @RequirePermission('brain:read')
  @ApiOkResponse({ type: BrainDocumentDto })
  get(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.brain.get(ws);
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
