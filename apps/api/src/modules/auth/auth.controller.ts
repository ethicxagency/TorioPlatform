import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  authConfigSchema,
  authResponseSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutResponseSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  tokenBodySchema,
} from '@torio/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Inject } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { PlatformSettingsService } from '../platform/platform-settings.service';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AuthService, type IssuedSession } from './auth.service';
import { MailService } from './mail.service';
import { RecoveryService } from './recovery.service';
import { SocialAuthService } from './social-auth.service';

class RegisterDto extends createZodDto(registerSchema) {}
class LoginDto extends createZodDto(loginSchema) {}
class RefreshDto extends createZodDto(refreshSchema) {}
class AuthResponseDto extends createZodDto(authResponseSchema) {}
class ForgotDto extends createZodDto(forgotPasswordSchema) {}
class ResetDto extends createZodDto(resetPasswordSchema) {}
class TokenDto extends createZodDto(tokenBodySchema) {}
class AuthConfigDto extends createZodDto(authConfigSchema) {}
class LogoutResponseDto extends createZodDto(logoutResponseSchema) {}

export const REFRESH_COOKIE = 'torio_rt';
const COOKIE_PATH = '/api/v1/auth';
const strict = { default: { limit: 5, ttl: 60_000 } };

/**
 * Token transport:
 *  - Browsers: refresh token lives only in an HttpOnly cookie scoped to /api/v1/auth;
 *    the access token is returned in the body and kept in memory by the SPA.
 *  - Mobile (header `X-Torio-Client: mobile`): refresh token is returned in the body for
 *    secure OS storage (Keychain/Keystore) and sent back in the body. No cookie is set.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly recovery: RecoveryService,
    private readonly social: SocialAuthService,
    private readonly mail: MailService,
    private readonly platform: PlatformSettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** What the sign-in pages may offer. Identical for everyone; says nothing about any account. */
  @Public()
  @Get('config')
  @ApiOkResponse({ type: AuthConfigDto })
  async options() {
    return {
      ...(await this.social.options()),
      email: this.mail.configured,
      registrationOpen: await this.platform.registrationOpen(),
    };
  }

  @Public()
  @Throttle(strict)
  @HttpCode(200)
  @Post('forgot-password')
  async forgot(@Body() body: ForgotDto) {
    await this.recovery.forgotPassword(body.email);
    // The same answer whether or not the address has an account.
    return { ok: true as const };
  }

  @Public()
  @Throttle(strict)
  @HttpCode(200)
  @Post('reset-password')
  async reset(@Body() body: ResetDto, @Req() req: Request) {
    return this.recovery.resetPassword(body.token, body.password, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  async verify(@Body() body: TokenDto, @Req() req: Request) {
    return this.recovery.verifyEmail(body.token, req.ip);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  resend(@CurrentUser() user: AuthUser) {
    return this.recovery.resendVerification(user.id);
  }

  @Public()
  @Throttle(strict)
  @Post('register')
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(body, this.meta(req));
    // Best effort: registration succeeds whether or not the email goes out (the page says when it can't).
    void this.recovery.sendVerification(session.user.id).catch(() => undefined);
    return this.respond(session, req, res);
  }

  @Public()
  @Throttle(strict)
  @HttpCode(200)
  @Post('login')
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.login(body, this.meta(req)), req, res);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? body.refreshToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      return this.respond(await this.auth.refresh(token, this.meta(req)), req, res);
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? body.refreshToken;
    await this.auth.logout(token);
    this.clearCookie(res);
    return { ok: true as const };
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
  }

  private isMobile(req: Request): boolean {
    return req.headers['x-torio-client'] === 'mobile';
  }

  respond(s: IssuedSession, req: Request, res: Response) {
    const { refreshToken, refreshExpiresAt, ...rest } = s;
    if (this.isMobile(req)) return { ...rest, refreshToken };
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: refreshExpiresAt,
    });
    return rest;
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      path: COOKIE_PATH,
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
    });
  }
}
