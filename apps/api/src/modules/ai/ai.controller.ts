import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import {
  aiDraftInputSchema,
  aiLogQuerySchema,
  aiOverviewQuerySchema,
  setAiKeySchema,
  updateAiModelSchema,
  updateAiProviderSchema,
  updateAiSettingsSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { AdminGuard, CurrentAdmin, type AdminContext } from '../admin/admin-auth';
import { AiAdminService } from './ai-admin.service';
import { AiOrchestrator } from './ai-orchestrator.service';

class SetKeyDto extends createZodDto(setAiKeySchema) {}
class UpdateProviderDto extends createZodDto(updateAiProviderSchema) {}
class UpdateModelDto extends createZodDto(updateAiModelSchema) {}
class UpdateSettingsDto extends createZodDto(updateAiSettingsSchema) {}
class LogQueryDto extends createZodDto(aiLogQuerySchema) {}
class OverviewQueryDto extends createZodDto(aiOverviewQuerySchema) {}
class DraftInputDto extends createZodDto(aiDraftInputSchema) {}

/**
 * Super Admin AI management. `@Public()` only opts out of the customer JWT guard; AdminGuard (a server-side admin session) protects
 * every route, and customer tokens do not work here.
 */
@ApiExcludeController()
@Public()
@UseGuards(AdminGuard)
@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly ai: AiAdminService) {}
  private ref = (admin: AdminContext, ip: string) => ({
    admin: { id: admin.id, email: admin.email },
    ip,
  });

  @Get('providers') providers() {
    return this.ai.providers();
  }
  @Put('providers/:key/key')
  setKey(
    @CurrentAdmin() a: AdminContext,
    @Ip() ip: string,
    @Param('key') key: string,
    @Body() b: SetKeyDto,
  ) {
    return this.ai.setKey(this.ref(a, ip), key, b.apiKey);
  }
  @Delete('providers/:key/key')
  deleteKey(@CurrentAdmin() a: AdminContext, @Ip() ip: string, @Param('key') key: string) {
    return this.ai.deleteKey(this.ref(a, ip), key);
  }
  @Post('providers/:key/test')
  @HttpCode(200)
  test(@CurrentAdmin() a: AdminContext, @Ip() ip: string, @Param('key') key: string) {
    return this.ai.test(this.ref(a, ip), key);
  }
  @Patch('providers/:key')
  updateProvider(
    @CurrentAdmin() a: AdminContext,
    @Ip() ip: string,
    @Param('key') key: string,
    @Body() b: UpdateProviderDto,
  ) {
    return this.ai.updateProvider(this.ref(a, ip), key, b);
  }
  @Patch('models/:id')
  updateModel(
    @CurrentAdmin() a: AdminContext,
    @Ip() ip: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateModelDto,
  ) {
    return this.ai.updateModel(this.ref(a, ip), id, b);
  }
  @Get('settings') settings() {
    return this.ai.settings();
  }
  @Patch('settings')
  updateSettings(@CurrentAdmin() a: AdminContext, @Ip() ip: string, @Body() b: UpdateSettingsDto) {
    return this.ai.updateSettings(this.ref(a, ip), b);
  }
  @Get('overview') overview(@Query() q: OverviewQueryDto) {
    return this.ai.overview(q.days);
  }
  @Get('logs') logs(@Query() q: LogQueryDto) {
    return this.ai.logs(q);
  }
}

/** What the Inbox uses. Customers never see providers, keys or settings: only which modes they can pick and the draft. */
@ApiTags('ai')
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/ai')
export class AiController {
  constructor(private readonly orchestrator: AiOrchestrator) {}

  @Get('options')
  @RequirePermission('conversations:read')
  options(@Param('workspaceId', ParseUUIDPipe) _ws: string) {
    return this.orchestrator.options();
  }

  @Get('requests/:requestId/phase')
  @RequirePermission('conversations:read')
  phase(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.orchestrator.phase(ws, requestId);
  }

  @Post('conversations/:conversationId/draft')
  @HttpCode(200)
  @RequirePermission('conversations:manage')
  draft(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() u: AuthUser,
    @Body() b: DraftInputDto,
  ) {
    return this.orchestrator.draft(ws, u.id, conversationId, b);
  }
}
