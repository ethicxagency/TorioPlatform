import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = config.REDIS_URL
      ? new Redis(config.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        })
      : null;
    // Prevent unhandled 'error' events when Redis is down; health reports it.
    this.client?.on('error', () => undefined);
  }

  get configured(): boolean {
    return this.client !== null;
  }

  async ping(): Promise<void> {
    if (!this.client) throw new Error('Redis not configured');
    if (this.client.status === 'wait') await this.client.connect();
    const reply = await this.client.ping();
    if (reply !== 'PONG') throw new Error('Unexpected Redis reply');
  }

  async onModuleDestroy() {
    this.client?.disconnect();
  }
}
