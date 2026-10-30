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
  automationDetailSchema,
  automationListSchema,
  automationQuerySchema,
  automationSummarySchema,
  createAutomationSchema,
  executionDetailSchema,
  executionListSchema,
  executionQuerySchema,
  testResultSchema,
  testRunSchema,
  updateAutomationSchema,
  validationResultSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { AutomationService } from './automation.service';

class AutomationQueryDto extends createZodDto(automationQuerySchema) {}
class AutomationExecQueryDto extends createZodDto(executionQuerySchema) {}
class AutomationListDto extends createZodDto(automationListSchema) {}
class AutomationDetailDto extends createZodDto(automationDetailSchema) {}
class AutomationSummaryDto extends createZodDto(automationSummarySchema) {}
class CreateAutomationDto extends createZodDto(createAutomationSchema) {}
class UpdateAutomationDto extends createZodDto(updateAutomationSchema) {}
class AutomationValidationDto extends createZodDto(validationResultSchema) {}
class AutomationTestRunDto extends createZodDto(testRunSchema) {}
class AutomationTestResultDto extends createZodDto(testResultSchema) {}
class AutomationExecListDto extends createZodDto(executionListSchema) {}
class AutomationExecDetailDto extends createZodDto(executionDetailSchema) {}

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/automations')
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  @Get()
  @RequirePermission('automation:read')
  @ApiOkResponse({ type: AutomationListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: AutomationQueryDto) {
    return this.svc.list(ws, q);
  }

  @Get('summary')
  @RequirePermission('automation:read')
  @ApiOkResponse({ type: AutomationSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.svc.summary(ws);
  }

  @Get('executions')
  @RequirePermission('automation:read')
  @ApiOkResponse({ type: AutomationExecListDto })
  executions(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: AutomationExecQueryDto) {
    return this.svc.executions(ws, q);
  }

  @Get('executions/:executionId')
  @RequirePermission('automation:read')
  @ApiOkResponse({ type: AutomationExecDetailDto })
  execution(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('executionId', ParseUUIDPipe) id: string,
  ) {
    return this.svc.executionDetail(ws, id);
  }

  @Post('executions/:executionId/retry')
  @HttpCode(200)
  @RequirePermission('automation:activate')
  @ApiOkResponse({ type: AutomationExecDetailDto })
  retry(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('executionId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.svc.retry(ws, u.id, id);
  }

  @Post()
  @RequirePermission('automation:write')
  @ApiOkResponse({ type: AutomationDetailDto })
  create(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: CreateAutomationDto,
  ) {
    return this.svc.create(ws, u.id, body);
  }

  @Get(':automationId')
  @RequirePermission('automation:read')
  @ApiOkResponse({ type: AutomationDetailDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
  ) {
    return this.svc.get(ws, id);
  }

  @Patch(':automationId')
  @RequirePermission('automation:write')
  @ApiOkResponse({ type: AutomationDetailDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: UpdateAutomationDto,
  ) {
    return this.svc.update(ws, u.id, id, body);
  }

  @Post(':automationId/validate')
  @HttpCode(200)
  @RequirePermission('automation:write')
  @ApiOkResponse({ type: AutomationValidationDto })
  validate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
  ) {
    return this.svc.validate(ws, id);
  }

  @Post(':automationId/test')
  @HttpCode(200)
  @RequirePermission('automation:write')
  @ApiOkResponse({ type: AutomationTestResultDto })
  test(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: AutomationTestRunDto,
  ) {
    return this.svc.test(ws, u.id, id, body.sample);
  }

  @Post(':automationId/publish')
  @HttpCode(200)
  @RequirePermission('automation:activate')
  @ApiOkResponse({ type: AutomationDetailDto })
  publish(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.svc.publish(ws, u.id, id);
  }

  @Post(':automationId/deactivate')
  @HttpCode(200)
  @RequirePermission('automation:activate')
  @ApiOkResponse({ type: AutomationDetailDto })
  deactivate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.svc.deactivate(ws, u.id, id);
  }

  @Post(':automationId/duplicate')
  @RequirePermission('automation:write')
  @ApiOkResponse({ type: AutomationDetailDto })
  duplicate(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.svc.duplicate(ws, u.id, id);
  }

  @Delete(':automationId')
  @HttpCode(204)
  @RequirePermission('automation:activate')
  async remove(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('automationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    await this.svc.remove(ws, u.id, id);
  }
}
