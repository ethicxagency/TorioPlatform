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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  invitationCreatedSchema,
  invitationInputSchema,
  invitationListSchema,
  memberActivitySchema,
  memberDetailSchema,
  memberListSchema,
  memberQuerySchema,
  teamInputSchema,
  teamListSchema,
  teamSchema,
  teamSummarySchema,
  updateMemberSchema,
  updateTeamSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser, WorkspaceMembershipContext } from '../../common/types';
import { TeamService } from './team.service';

class MemberQueryDto extends createZodDto(memberQuerySchema) {}
class MemberListDto extends createZodDto(memberListSchema) {}
class MemberDetailDto extends createZodDto(memberDetailSchema) {}
class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
class MemberActivityDto extends createZodDto(memberActivitySchema) {}
class TeamSummaryDto extends createZodDto(teamSummarySchema) {}
class InvitationInputDto extends createZodDto(invitationInputSchema) {}
class InvitationListDto extends createZodDto(invitationListSchema) {}
class InvitationCreatedDto extends createZodDto(invitationCreatedSchema) {}
class TeamDto extends createZodDto(teamSchema) {}
class TeamListDto extends createZodDto(teamListSchema) {}
class TeamInputDto extends createZodDto(teamInputSchema) {}
class UpdateTeamDto extends createZodDto(updateTeamSchema) {}

const actor = (u: AuthUser, m: WorkspaceMembershipContext) => ({ userId: u.id, role: m.role });

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('team/summary')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: TeamSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.team.summary(ws);
  }

  @Get('members')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: MemberListDto })
  members(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: MemberQueryDto) {
    return this.team.listMembers(ws, q);
  }

  @Get('members/:memberId')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: MemberDetailDto })
  member(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('memberId', ParseUUIDPipe) id: string,
  ) {
    return this.team.getMember(ws, id);
  }

  @Get('members/:memberId/activity')
  @RequirePermission('audit:read')
  @ApiOkResponse({ type: MemberActivityDto })
  activity(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('memberId', ParseUUIDPipe) id: string,
  ) {
    return this.team.memberActivity(ws, id);
  }

  @Patch('members/:memberId')
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: MemberDetailDto })
  updateMember(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('memberId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: UpdateMemberDto,
  ) {
    return this.team.updateMember(ws, actor(u, m), id, body);
  }

  @Delete('members/:memberId')
  @HttpCode(204)
  @RequirePermission('members:manage')
  removeMember(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('memberId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.team.removeMember(ws, actor(u, m), id);
  }

  @Get('invitations')
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: InvitationListDto })
  invitations(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.team.listInvitations(ws);
  }

  @Post('invitations')
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: InvitationCreatedDto })
  invite(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: InvitationInputDto,
  ) {
    return this.team.createInvitation(ws, actor(u, m), body);
  }

  @Post('invitations/:invitationId/resend')
  @HttpCode(200)
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: InvitationCreatedDto })
  resend(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('invitationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.team.resendInvitation(ws, actor(u, m), id);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(204)
  @RequirePermission('members:manage')
  revoke(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('invitationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.team.revokeInvitation(ws, actor(u, m), id);
  }

  @Get('teams')
  @RequirePermission('members:read')
  @ApiOkResponse({ type: TeamListDto })
  teams(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.team.listTeams(ws);
  }

  @Post('teams')
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: TeamDto })
  createTeam(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: TeamInputDto,
  ) {
    return this.team.createTeam(ws, actor(u, m), body);
  }

  @Patch('teams/:teamId')
  @RequirePermission('members:manage')
  @ApiOkResponse({ type: TeamDto })
  updateTeam(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('teamId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Body() body: UpdateTeamDto,
  ) {
    return this.team.updateTeam(ws, actor(u, m), id, body);
  }

  @Delete('teams/:teamId')
  @HttpCode(204)
  @RequirePermission('members:manage')
  deleteTeam(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('teamId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @CurrentMembership() m: WorkspaceMembershipContext,
  ) {
    return this.team.deleteTeam(ws, actor(u, m), id);
  }
}
