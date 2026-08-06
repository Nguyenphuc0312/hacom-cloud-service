import { defineConfig, devices } from '@playwright/test';

const apiTarget = process.env.HACOM_CLOUD_API_BASE_URL ?? 'http://127.0.0.1:33001';
const authTarget = process.env.HACOM_CLOUD_AUTH_BASE_URL ?? 'http://127.0.0.1:3101';

export default defineConfig({
  testDir: './e2e/hacom-cloud',
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../artifacts/hacom-cloud/browser-report', open: 'never' }]],
  use: {
    baseURL: process.env.HACOM_CLOUD_WEB_BASE_URL ?? 'http://127.0.0.1:5100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5100',
    reuseExistingServer: true,
    env: {
      ...process.env,
      VITE_DEV_API_PROXY_TARGET: apiTarget,
      VITE_DEV_AUTH_PROXY_TARGET: authTarget,
      VITE_DEV_WS_PROXY_TARGET: process.env.HACOM_CLOUD_WS_BASE_URL ?? 'http://127.0.0.1:8001',
    },
  },
});
