import {
  Body,
  Controller,
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
  channelActivitySchema,
  channelListSchema,
  channelQuerySchema,
  channelSchema,
  channelSummarySchema,
  providerListSchema,
  updateChannelSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { ChannelsService } from './channels.service';

class ChannelQueryDto extends createZodDto(channelQuerySchema) {}
class ChannelListDto extends createZodDto(channelListSchema) {}
class ChannelDto extends createZodDto(channelSchema) {}
class ChannelSummaryDto extends createZodDto(channelSummarySchema) {}
class ProviderListDto extends createZodDto(providerListSchema) {}
class UpdateChannelDto extends createZodDto(updateChannelSchema) {}
class ChannelActivityDto extends createZodDto(channelActivitySchema) {}

@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @RequirePermission('channels:read')
  @ApiOkResponse({ type: ChannelListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: ChannelQueryDto) {
    return this.channels.list(ws, q);
  }

  @Get('summary')
  @RequirePermission('channels:read')
  @ApiOkResponse({ type: ChannelSummaryDto })
  summary(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.channels.summary(ws);
  }

  @Get('providers')
  @RequirePermission('channels:read')
  @ApiOkResponse({ type: ProviderListDto })
  providers(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.channels.providers(ws);
  }

  @Get(':channelId')
  @RequirePermission('channels:read')
  @ApiOkResponse({ type: ChannelDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
  ) {
    return this.channels.get(ws, id);
  }

  @Get(':channelId/activity')
  @RequirePermission('audit:read')
  @ApiOkResponse({ type: ChannelActivityDto })
  activity(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
  ) {
    return this.channels.activity(ws, id);
  }

  @Patch(':channelId')
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: UpdateChannelDto,
  ) {
    return this.channels.update(ws, u.id, id, body);
  }

  @Post(':channelId/disconnect')
  @HttpCode(200)
  @RequirePermission('channels:manage')
  @ApiOkResponse({ type: ChannelDto })
  disconnect(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('channelId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.channels.disconnect(ws, u.id, id);
  }
}
