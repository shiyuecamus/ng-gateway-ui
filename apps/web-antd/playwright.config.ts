import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './node_modules/.e2e/results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    actionTimeout: 10_000,
    ...devices['Desktop Chrome'],
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    // Authentication requests contain ephemeral credentials; do not record them.
    trace: 'off',
  },
});
