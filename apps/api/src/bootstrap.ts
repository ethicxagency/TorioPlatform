import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { ServerOptions } from 'socket.io';
import { APP_CONFIG, type AppConfig } from './config/config.module';

export const API_PREFIX = 'api/v1';

class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origins: string[],
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
    });
  }
}

/** Shared by main.ts, e2e tests and the OpenAPI generator so they all see the same app. */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX, { exclude: [] });
  app.use(helmet());
  // Keep the exact bytes of JSON bodies: webhook signatures are computed over the raw payload.
  app.use(
    json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Torio-Client',
      'X-Torio-Admin',
    ],
    exposedHeaders: ['X-Request-Id'],
  });
  app.useWebSocketAdapter(new CorsIoAdapter(app, config.CORS_ALLOWED_ORIGINS));
  app.enableShutdownHooks();
  // Behind a proxy, req.ip must reflect the client for rate limiting; configure per deployment.
  (app as unknown as { set: (k: string, v: unknown) => void }).set('trust proxy', 'loopback');
  return config;
}

export function buildOpenApiDocument(app: INestApplication) {
  const builder = new DocumentBuilder()
    .setTitle('Torio API')
    .setDescription(
      'Torio REST API. Versioned under /api/v1. Source of truth for the TypeScript and Dart clients.',
    )
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, builder), { version: '3.1' });
}

export function setupDocs(app: INestApplication, config: AppConfig) {
  if (config.NODE_ENV === 'production') return;
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  });
}
