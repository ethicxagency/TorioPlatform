import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  gatewayTxListSchema,
  gatewayTxQuerySchema,
  gatewayTxSchema,
  sslCheckoutResultSchema,
  sslCheckoutSchema,
} from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Public, RequirePermission } from '../../../common/decorators';
import { WorkspaceAccessGuard } from '../../../common/guards/workspace-access.guard';
import type { AuthUser } from '../../../common/types';
import { SslcommerzService } from './sslcommerz.service';

class SslCheckoutDto extends createZodDto(sslCheckoutSchema) {}
class SslCheckoutResultDto extends createZodDto(sslCheckoutResultSchema) {}
class GatewayTxListDto extends createZodDto(gatewayTxListSchema) {}
class GatewayTxDto extends createZodDto(gatewayTxSchema) {}
class GatewayTxQueryDto extends createZodDto(gatewayTxQuerySchema) {}

/** Starting a payment and reading a workspace's own payments. Every route is scoped to the caller's workspace. */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/billing/sslcommerz')
export class SslcommerzWorkspaceController {
  constructor(private readonly ssl: SslcommerzService) {}

  @Post('checkout')
  @HttpCode(200)
  @RequirePermission('billing:manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: SslCheckoutResultDto })
  checkout(
    @Param('workspaceId', ParseUUIDPipe) ws: string,
    @CurrentUser() u: AuthUser,
    @Body() b: SslCheckoutDto,
  ) {
    return this.ssl.checkout(ws, u.id, b);
  }

  @Get('transactions')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: GatewayTxListDto })
  list(@Param('workspaceId', ParseUUIDPipe) ws: string, @Query() q: GatewayTxQueryDto) {
    return this.ssl.list(ws, q);
  }

  @Get('transactions/:tranId')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: GatewayTxDto })
  one(@Param('workspaceId', ParseUUIDPipe) ws: string, @Param('tranId') tranId: string) {
    return this.ssl.status(ws, tranId);
  }
}

/**
 * Where SSLCommerz sends the customer's browser and its own server notification. They have no session: nothing they carry is
 * believed. The outcome is decided by the gateway's server-side validation against the payment Torio created.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('payments/sslcommerz')
export class SslcommerzCallbackController {
  constructor(private readonly ssl: SslcommerzService) {}

  @Post('success')
  @Redirect(undefined, 303)
  async success(@Body() b: Record<string, string>) {
    return { url: await this.ssl.callback('success', b ?? {}) };
  }

  @Post('fail')
  @Redirect(undefined, 303)
  async fail(@Body() b: Record<string, string>) {
    return { url: await this.ssl.callback('fail', b ?? {}) };
  }

  @Post('cancel')
  @Redirect(undefined, 303)
  async cancel(@Body() b: Record<string, string>) {
    return { url: await this.ssl.callback('cancel', b ?? {}) };
  }

  @Post('ipn')
  @HttpCode(200)
  async ipn(@Body() b: Record<string, string>) {
    await this.ssl.ipn(b ?? {});
    return 'OK';
  }
}
