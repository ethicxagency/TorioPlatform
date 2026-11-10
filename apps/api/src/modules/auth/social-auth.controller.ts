import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { pendingEmailSchema, tokenBodySchema } from '@torio/contracts';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { REFRESH_COOKIE } from './auth.controller';
import type { IssuedSession } from './auth.service';
import {
  PENDING_COOKIE,
  SocialAuthService,
  STATE_COOKIE,
  type SocialOutcome,
} from './social-auth.service';
import { SocialAuthError, type Provider } from './social.providers';

const PROVIDERS = new Set(['google', 'facebook']);
const OAUTH_PATH = '/api/v1/auth/oauth';

/**
 * Browser-redirect endpoints for Google and Facebook sign-in:
 *   GET  /api/v1/auth/oauth/{google|facebook}/start      (send the browser to the provider)
 *   GET  /api/v1/auth/oauth/{google|facebook}/callback   (the redirect URI registered with the provider)
 *   POST /api/v1/auth/oauth/email                        (a provider gave no email: ask for one)
 *   POST /api/v1/auth/oauth/complete                     (the emailed confirmation link was followed)
 * Every failure ends as a redirect to a web page with a short reason code; provider messages and tokens never reach the browser.
 */
@ApiExcludeController()
@Controller('auth/oauth')
export class SocialAuthController {
  private readonly log = new Logger(SocialAuthController.name);

  constructor(
    private readonly social: SocialAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private web(path: string) {
    return `${this.config.WEB_URL.replace(/\/$/, '')}${path}`;
  }

  private cookieOpts(maxAge?: number) {
    return {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: OAUTH_PATH,
      ...(maxAge && { maxAge }),
    };
  }

  private fail(res: Response, code: string) {
    res.clearCookie(STATE_COOKIE, this.cookieOpts());
    res.redirect(302, this.web(`/auth/callback?status=error&reason=${encodeURIComponent(code)}`));
  }

  private setSession(res: Response, s: IssuedSession) {
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires: s.refreshExpiresAt,
    });
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
  }

  private land(res: Response, o: SocialOutcome) {
    res.clearCookie(STATE_COOKIE, this.cookieOpts());
    if (o.kind === 'session') {
      this.setSession(res, o.session);
      return res.redirect(
        302,
        this.web(`/auth/callback?status=ok&next=${encodeURIComponent(o.returnTo)}`),
      );
    }
    if (o.kind === 'email_required') {
      res.cookie(PENDING_COOKIE, o.pendingCookie, this.cookieOpts(15 * 60_000));
      return res.redirect(302, this.web('/auth/complete?step=email'));
    }
    return res.redirect(302, this.web('/auth/complete?step=check-email'));
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':provider/start')
  async start(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ) {
    if (!PROVIDERS.has(provider)) return this.fail(res, 'provider_error');
    try {
      const b = await this.social.begin(provider as Provider, returnTo);
      res.cookie(STATE_COOKIE, b.cookie, this.cookieOpts(b.ttlMs));
      return res.redirect(302, b.url);
    } catch (e) {
      // Configuration problems are safe to log (no secrets in them) and are what an administrator needs to see.
      if (e instanceof SocialAuthError && e.message !== e.code)
        this.log.warn(`${provider} sign-in can't start (${e.code}): ${e.message}`);
      return this.fail(res, e instanceof SocialAuthError ? e.code : 'provider_error');
    }
  }

  @Public()
  @SkipThrottle()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!PROVIDERS.has(provider)) return this.fail(res, 'provider_error');
    try {
      const cookie = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
      const out = await this.social.finish(
        provider as Provider,
        { code, state, error },
        cookie,
        this.meta(req),
      );
      return this.land(res, out);
    } catch (e) {
      return this.fail(res, e instanceof SocialAuthError ? e.code : 'provider_error');
    }
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('email')
  async email(@Body() body: unknown, @Req() req: Request) {
    const { email } = pendingEmailSchema.parse(body);
    const cookie = (req.cookies as Record<string, string> | undefined)?.[PENDING_COOKIE];
    await this.social.requestEmail(cookie, email);
    return { ok: true as const };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('complete')
  async complete(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = tokenBodySchema.parse(body);
    const out = await this.social.complete(token, this.meta(req));
    if (out.kind !== 'session') return { ok: false as const };
    this.setSession(res, out.session);
    return { ok: true as const, next: out.returnTo };
  }
}
