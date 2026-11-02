import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { analyticsQuerySchema, dashboardAnalyticsSchema } from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { WorkspaceMembershipContext } from '../../common/types';
import { DashboardService } from './dashboard.service';

class AnalyticsQueryDto extends createZodDto(analyticsQuerySchema) {}
class DashboardAnalyticsDto extends createZodDto(dashboardAnalyticsSchema) {}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** `from`/`to` are inclusive dates in the workspace's reporting time zone. Billing details are returned only to roles with `billing:read`. */
  @Get('analytics')
  @RequirePermission('workspace:read')
  @ApiOkResponse({ type: DashboardAnalyticsDto })
  analytics(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentMembership() m: WorkspaceMembershipContext,
    @Query() q: AnalyticsQueryDto,
  ) {
    return this.dashboard.analytics(ws, m.role, q);
  }
}
