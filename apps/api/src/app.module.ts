import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TeamModule } from './modules/team/team.module';
import { BrainModule } from './modules/brain/brain.module';
import { AutomationModule } from './modules/automation/automation.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { LeadsModule } from './modules/leads/leads.module';
import { HealthModule } from './modules/health/health.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          // Correlation ID: accept a sane client-supplied one, otherwise generate.
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.password',
              '*.passwordHash',
              '*.refreshToken',
              '*.accessToken',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    DatabaseModule,
    AuthorizationModule,
    AuthModule,
    HealthModule,
    UsersModule,
    WorkspacesModule,
    InboxModule,
    LeadsModule,
    CustomersModule,
    TeamModule,
    BrainModule,
    ChannelsModule,
    OrdersModule,
    AutomationModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
