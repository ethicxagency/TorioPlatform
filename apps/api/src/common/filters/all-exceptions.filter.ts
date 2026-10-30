import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@torio/types';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Single place that shapes every error into the standard envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const requestId = String((req as Request & { id?: unknown }).id ?? '');

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof ZodValidationException) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      const zodError = exception.getZodError() as {
        issues?: { path: PropertyKey[]; message: string }[];
      };
      details = (zodError.issues ?? []).map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = CODES[statusCode] ?? `HTTP_${statusCode}`;
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
    } else if ((exception as { type?: string })?.type === 'entity.too.large') {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body too large';
    }

    if (statusCode >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
      if (this.config.NODE_ENV === 'production') message = 'Internal server error';
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message,
        statusCode,
        ...(requestId && { requestId }),
        ...(details !== undefined && { details }),
      },
    };
    res.status(statusCode).json(body);
  }
}
