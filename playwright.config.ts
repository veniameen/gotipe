import { defineConfig, devices } from '@playwright/test';

// GOTIPE_E2E_PORT: the playground dev server port (5173 by default).
// GOTIPE_E2E_CHANNEL: the browser channel for the chromium project (for example, "chrome"
// when the Playwright browsers are not installed).
const port = Number(process.env.GOTIPE_E2E_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;
const channel = process.env.GOTIPE_E2E_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `pnpm --filter @gotipe/playground exec vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
