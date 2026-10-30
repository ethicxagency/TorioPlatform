import { defineConfig } from '@playwright/test';

// Uses the system Chrome by default so no browser download is needed.
// In CI run `pnpm exec playwright install chromium` and set PW_CHANNEL= (empty) to use it.
const channel = process.env.PW_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'on-first-retry', ...(channel && { channel }) },
  webServer: {
    command: 'pnpm exec next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
