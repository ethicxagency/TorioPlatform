import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@torio/database';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

/**
 * Thin wrapper around PrismaClient. Prisma 7 connects lazily through the pg
 * adapter, so constructing the app never requires a running database.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createPrismaClient(config.DATABASE_URL);
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
