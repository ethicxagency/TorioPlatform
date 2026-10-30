import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { healthSchema } from '@torio/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

class HealthDto extends createZodDto(healthSchema) {}

type Check = { status: 'up' | 'down' | 'skipped'; latencyMs?: number };

const withTimeout = <T>(p: Promise<T>, ms = 2000): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function timed(fn: () => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await withTimeout(fn());
    return { status: 'up', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down', latencyMs: Date.now() - start };
  }
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Liveness: process is up. No dependencies checked. */
  @Get()
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: database (always) and Redis (required only when REDIS_REQUIRED=true). */
  @Get('ready')
  @ApiOkResponse({ type: HealthDto })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const database = await timed(() => this.prisma.ping());
    const redis: Check = this.redis.configured
      ? await timed(() => this.redis.ping())
      : { status: 'skipped' };

    const dbDown = database.status === 'down';
    const redisDown = redis.status === 'down';
    const failing = dbDown || (redisDown && this.config.REDIS_REQUIRED);
    const body: HealthDto = {
      status: failing ? 'error' : redisDown ? 'degraded' : 'ok',
      checks: { database, redis },
    };
    if (failing) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
