import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createRoleSchema,
  deleteRoleSchema,
  roleDetailSchema,
  roleListSchema,
  roleUpdateResultSchema,
  roleTemplateListSchema,
  updateRoleSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser, WorkspaceMembershipContext } from '../../common/types';
import { RolesService } from './roles.service';

class CreateRoleDto extends createZodDto(createRoleSchema) {}
class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
class DeleteRoleDto extends createZodDto(deleteRoleSchema) {}
class RoleListDto extends createZodDto(roleListSchema) {}
class RoleDetailDto extends createZodDto(roleDetailSchema) {}
class RoleUpdateResultDto extends createZodDto(roleUpdateResultSchema) {}
class RoleTemplateListDto extends createZodDto(roleTemplateListSchema) {}

const actor = (u: AuthUser, m: WorkspaceMembershipContext) => ({
  userId: u.id,
  permissions: m.permissions,
});

/**
 * Roles and permissions. Anyone who can see members can see the roles; creating, changing and deleting a custom role needs
 * `roles:manage`, which only the Owner holds and which no custom role can carry.
 */
@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('members:read')
  @ApiOkResponse({ type: RoleListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.roles.list(ws);
  }

  @Get('templates')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: RoleTemplateListDto })
  templates() {
    return this.roles.templates();
  }

  @Get(':roleId')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: RoleDetailDto })
  detail(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('roleId') id: string) {
    return this.roles.detail(ws, id);
  }

  @Post()
  @RequirePermission('roles:manage')
  @ApiOkResponse({ type: RoleDetailDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: CreateRoleDto,
  ) {
    return this.roles.create(ws, actor(u, m), body);
  }

  @Patch(':roleId')
  @RequirePermission('roles:manage')
  @ApiOkResponse({ type: RoleUpdateResultDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('roleId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: UpdateRoleDto,
  ) {
    return this.roles.update(ws, actor(u, m), id, body);
  }

  @Post(':roleId/duplicate')
  @RequirePermission('roles:manage')
  @ApiOkResponse({ type: RoleDetailDto })
  duplicate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('roleId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.roles.duplicate(ws, actor(u, m), id);
  }

  @Delete(':roleId')
  @HttpCode(204)
  @RequirePermission('roles:manage')
  async remove(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('roleId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: DeleteRoleDto,
  ) {
    await this.roles.remove(ws, actor(u, m), id, body);
  }
}
