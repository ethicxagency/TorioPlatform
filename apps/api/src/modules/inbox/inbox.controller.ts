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
  bulkConversationSchema,
  bulkResultSchema,
  conversationQuerySchema,
  conversationListSchema,
  conversationSchema,
  createSavedReplySchema,
  messageListSchema,
  messageQuerySchema,
  messageSchema,
  savedReplySchema,
  searchQuerySchema,
  searchResultSchema,
  sendMessageSchema,
  updateConversationSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../common/types';
import { ConversationsService } from './conversations.service';
import { SavedRepliesService } from './saved-replies.service';
import { SearchService } from './search.service';

class ConversationQueryDto extends createZodDto(conversationQuerySchema) {}
class ConversationListDto extends createZodDto(conversationListSchema) {}
class ConversationDto extends createZodDto(conversationSchema) {}
class MessageQueryDto extends createZodDto(messageQuerySchema) {}
class MessageListDto extends createZodDto(messageListSchema) {}
class MessageDto extends createZodDto(messageSchema) {}
class SendMessageDto extends createZodDto(sendMessageSchema) {}
class UpdateConversationDto extends createZodDto(updateConversationSchema) {}
class BulkDto extends createZodDto(bulkConversationSchema) {}
class BulkResultDto extends createZodDto(bulkResultSchema) {}
class SavedReplyDto extends createZodDto(savedReplySchema) {}
class CreateSavedReplyDto extends createZodDto(createSavedReplySchema) {}
class SearchQueryDto extends createZodDto(searchQuerySchema) {}
class SearchResultDto extends createZodDto(searchResultSchema) {}

const WS = 'workspaces/:workspaceId';

/** Inbox REST surface. The workspace comes only from the route and is authorized by the guard. */
@ApiTags('inbox')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller(WS)
export class InboxController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly savedReplies: SavedRepliesService,
    private readonly searchSvc: SearchService,
  ) {}

  @Get('conversations')
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: ConversationListDto })
  list(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Query() q: ConversationQueryDto,
  ) {
    return this.conversations.list(ws, u.id, q);
  }

  @Post('conversations/bulk')
  @HttpCode(200)
  @RequirePermission('conversations:manage')
  @ApiOkResponse({ type: BulkResultDto })
  bulk(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() body: BulkDto,
  ) {
    return this.conversations.bulk(ws, u.id, body);
  }

  @Get('conversations/:conversationId')
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: ConversationDto })
  get(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.get(ws, id);
  }

  @Patch('conversations/:conversationId')
  @RequirePermission('conversations:manage')
  @ApiOkResponse({ type: ConversationDto })
  update(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: UpdateConversationDto,
  ) {
    return this.conversations.update(ws, id, u.id, body);
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(200)
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: ConversationDto })
  read(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.setUnread(ws, id, false);
  }

  @Post('conversations/:conversationId/unread')
  @HttpCode(200)
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: ConversationDto })
  unread(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.setUnread(ws, id, true);
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: MessageListDto })
  messages(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Query() q: MessageQueryDto,
  ) {
    return this.conversations.messages(ws, id, q.page, q.pageSize);
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermission('conversations:reply')
  @ApiOkResponse({ type: MessageDto })
  send(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: SendMessageDto,
  ) {
    return this.conversations.send(ws, id, u.id, body);
  }

  @Get('saved-replies')
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: [SavedReplyDto] })
  listSavedReplies(@Param('workspaceId', ParseUUIDPipe) ws: string) {
    return this.savedReplies.list(ws);
  }

  @Post('saved-replies')
  @RequirePermission('savedreplies:manage')
  @ApiOkResponse({ type: SavedReplyDto })
  createSavedReply(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Body() body: CreateSavedReplyDto,
  ) {
    return this.savedReplies.create(ws, body);
  }

  @Delete('saved-replies/:replyId')
  @HttpCode(204)
  @RequirePermission('savedreplies:manage')
  deleteSavedReply(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @Param('replyId', ParseUUIDPipe) id: string,
  ) {
    return this.savedReplies.remove(ws, id);
  }

  @Get('search')
  @RequirePermission('conversations:read')
  @ApiOkResponse({ type: SearchResultDto })
  search(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: SearchQueryDto) {
    return this.searchSvc.search(ws, q.q);
  }
}
