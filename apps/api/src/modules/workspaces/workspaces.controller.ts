import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  auditListSchema,
  auditQuerySchema,
  createStoreSchema,
  IMAGE_MAX_BYTES,
  setActiveWorkspaceSchema,
  storeSlugCheckQuerySchema,
  storeSlugCheckSchema,
  updateWorkspaceSchema,
  workspaceWithRoleSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser, WorkspaceMembershipContext } from '../../common/types';
import { WorkspacesService } from './workspaces.service';

class CreateWorkspaceDto extends createZodDto(createStoreSchema) {}
class SetActiveDto extends createZodDto(setActiveWorkspaceSchema) {}
class SlugCheckQueryDto extends createZodDto(storeSlugCheckQuerySchema) {}
class SlugCheckDto extends createZodDto(storeSlugCheckSchema) {}
class WorkspaceDto extends createZodDto(workspaceWithRoleSchema) {}
class UpdateWorkspaceDto extends createZodDto(updateWorkspaceSchema) {}
class AuditQueryDto extends createZodDto(auditQuerySchema) {}
class AuditListDto extends createZodDto(auditListSchema) {}

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({ type: [WorkspaceDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  @ApiOkResponse({ type: WorkspaceDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, body);
  }

  /** Switch the active store. Only to a store the caller belongs to; persisted for the next sign-in. */
  @Put('active')
  @ApiOkResponse({ type: [WorkspaceDto] })
  setActive(@CurrentUser() user: AuthUser, @Body() body: SetActiveDto) {
    return this.workspaces.setActive(user.id, body.workspaceId);
  }

  /** Whether a store address is free, with a suggestion when it is not. Needs sign-in; reveals nothing but availability. */
  @Get('slug-check')
  @ApiOkResponse({ type: SlugCheckDto })
  slugCheck(@Query() q: SlugCheckQueryDto) {
    return this.workspaces.slugCheck(q.slug);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceAccessGuard)
  @RequirePermission('workspace:read')
  @ApiOkResponse({ type: WorkspaceDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.workspaces.get(workspaceId, m.role);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceAccessGuard)
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspaceDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(workspaceId, user.id, m.role, body);
  }

  @Put(':workspaceId/logo')
  @UseGuards(WorkspaceAccessGuard)
  @RequirePermission('workspace:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_MAX_BYTES, files: 1 } }))
  @ApiOkResponse({ type: WorkspaceDto })
  setLogo(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.workspaces.setLogo(workspaceId, user.id, m.role, file);
  }

  @Delete(':workspaceId/logo')
  @UseGuards(WorkspaceAccessGuard)
  @RequirePermission('workspace:update')
  @ApiOkResponse({ type: WorkspaceDto })
  removeLogo(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.workspaces.removeLogo(workspaceId, user.id, m.role);
  }

  @Get(':workspaceId/audit')
  @UseGuards(WorkspaceAccessGuard)
  @RequirePermission('audit:read')
  @ApiOkResponse({ type: AuditListDto })
  audit(@Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Query() q: AuditQueryDto) {
    return this.workspaces.audit(workspaceId, q);
  }
}
