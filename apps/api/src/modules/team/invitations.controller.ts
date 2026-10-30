import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptedSchema,
  acceptInvitationNewUserSchema,
  acceptInvitationSchema,
  invitationPreviewSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { TeamService } from './team.service';

class PreviewQueryDto extends createZodDto(z.object({ token: z.string().min(20).max(200) })) {}
class PreviewDto extends createZodDto(invitationPreviewSchema) {}
class AcceptNewDto extends createZodDto(acceptInvitationNewUserSchema) {}
class AcceptDto extends createZodDto(acceptInvitationSchema) {}
class AcceptedDto extends createZodDto(acceptedSchema) {}

const strict = { default: { limit: 10, ttl: 60_000 } };

/** Invitation acceptance. Rate-limited because the token is the only credential. */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly team: TeamService) {}

  @Public()
  @Throttle(strict)
  @Get('preview')
  @ApiOkResponse({ type: PreviewDto })
  preview(@Query() q: PreviewQueryDto) {
    return this.team.previewInvitation(q.token);
  }

  @Public()
  @Throttle(strict)
  @Post('accept-new')
  @HttpCode(200)
  @ApiOkResponse({ type: AcceptedDto })
  acceptNew(@Body() body: AcceptNewDto) {
    return this.team.acceptForNewUser(body.token, body.name, body.password);
  }

  @ApiBearerAuth()
  @Throttle(strict)
  @Post('accept')
  @HttpCode(200)
  @ApiOkResponse({ type: AcceptedDto })
  accept(@Body() body: AcceptDto, @CurrentUser() u: AuthUser) {
    return this.team.acceptForUser(body.token, u.id);
  }
}
