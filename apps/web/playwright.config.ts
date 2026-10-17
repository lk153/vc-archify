import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build (`next start`), so CI exercises
// exactly what deploys. Locally it uses the installed Google Chrome; CI uses
// Playwright's Chromium (`playwright install --with-deps chromium`).
const PORT = Number(process.env.E2E_PORT || 3107);
const useLocalChrome = !process.env.CI && !process.env.E2E_BUNDLED_BROWSERS;
const fullMatrix = process.env.E2E_FULL_MATRIX === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(useLocalChrome ? { channel: 'chrome' } : {}) } },
    ...(fullMatrix
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
