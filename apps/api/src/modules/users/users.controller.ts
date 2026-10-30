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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  accountExportSchema,
  changePasswordSchema,
  profileSchema,
  revokedSchema,
  sessionListSchema,
  updateProfileSchema,
} from '@torio/contracts';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { UsersService } from './users.service';

class ProfileDto extends createZodDto(profileSchema) {}
class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
class SessionListDto extends createZodDto(sessionListSchema) {}
class AccountExportDto extends createZodDto(accountExportSchema) {}
class RevokedDto extends createZodDto(revokedSchema) {}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: ProfileDto })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ type: ProfileDto })
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.id, body);
  }

  @Post('me/password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: RevokedDto })
  password(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    return this.users.changePassword(user.id, user.sessionId, body);
  }

  @Get('me/sessions')
  @ApiOkResponse({ type: SessionListDto })
  sessions(@CurrentUser() user: AuthUser) {
    return this.users.sessions(user.id, user.sessionId);
  }

  @Post('me/sessions/revoke-others')
  @HttpCode(200)
  @ApiOkResponse({ type: RevokedDto })
  revokeOthers(@CurrentUser() user: AuthUser) {
    return this.users.revokeOthers(user.id, user.sessionId);
  }

  @Delete('me/sessions/:sessionId')
  @ApiOkResponse({ type: SessionListDto })
  revoke(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.users.revokeSession(user.id, user.sessionId, sessionId);
  }

  @Get('me/export')
  @ApiOkResponse({ type: AccountExportDto })
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.id, user.sessionId);
  }
}
