import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  adminDeletionListSchema,
  adminDeletionRejectSchema,
  deletionCreatedSchema,
  deletionRequestSchema,
  deletionSignedInRequestSchema,
  deletionStatusViewSchema,
  tokenBodySchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { AdminGuard, CurrentAdmin, type AdminContext } from '../admin/admin-auth';
import { AccountDeletionService } from './account-deletion.service';

class RequestDto extends createZodDto(deletionRequestSchema) {}
class SignedInDto extends createZodDto(deletionSignedInRequestSchema) {}
class TokenDto extends createZodDto(tokenBodySchema) {}
class CreatedDto extends createZodDto(deletionCreatedSchema) {}
class StatusDto extends createZodDto(deletionStatusViewSchema) {}
class AdminListDto extends createZodDto(adminDeletionListSchema) {}
class RejectDto extends createZodDto(adminDeletionRejectSchema) {}

/** Public and customer-facing endpoints for the Delete Account page. */
@ApiTags('account deletion')
@Controller('account-deletion')
export class AccountDeletionController {
  constructor(private readonly svc: AccountDeletionService) {}

  /** A visitor asks by email; ownership is proven by the emailed link. The answer never says whether the account exists. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Post('requests')
  @ApiOkResponse({ type: CreatedDto })
  byEmail(@Body() b: RequestDto, @Ip() ip: string) {
    return this.svc.requestByEmail(b.email, b.reason, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('requests/me')
  @ApiOkResponse({ type: CreatedDto })
  signedIn(@CurrentUser() user: AuthUser, @Body() b: SignedInDto, @Ip() ip: string) {
    return this.svc.requestSignedIn(user.id, b, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify')
  @ApiOkResponse({ type: StatusDto })
  verify(@Body() b: TokenDto, @Ip() ip: string) {
    return this.svc.verify(b.token, ip);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('requests/:reference')
  @ApiOkResponse({ type: StatusDto })
  status(@Param('reference') reference: string) {
    return this.svc.statusOf(reference);
  }
}

/** Super Admin review of deletion requests. */
@ApiTags('admin account deletion')
@Public()
@UseGuards(AdminGuard)
@Controller('admin/account-deletions')
export class AdminAccountDeletionController {
  constructor(private readonly svc: AccountDeletionService) {}

  @Get()
  @ApiOkResponse({ type: AdminListDto })
  list(@Query('status') status?: string) {
    return this.svc.list(status);
  }

  @Post(':id/process')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminListDto })
  process(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.svc.process(a, id, ip);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminListDto })
  reject(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: RejectDto,
    @Ip() ip: string,
  ) {
    return this.svc.reject(a, id, b.reason, ip);
  }
}
