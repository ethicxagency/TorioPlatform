import pino from 'pino';

export const createLogger = (level: string) =>
  pino({
    level,
    base: { service: 'torio-worker' },
    redact: {
      paths: ['*.password', '*.token', '*.accessToken', '*.refreshToken', 'data.secret'],
      censor: '[REDACTED]',
    },
  });

export type Logger = ReturnType<typeof createLogger>;
