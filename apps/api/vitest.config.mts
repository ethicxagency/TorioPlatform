import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emits decorator metadata, which Nest DI needs (esbuild does not).
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_URL: 'http://localhost:3000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_REQUIRED: 'false',
    },
  },
});
