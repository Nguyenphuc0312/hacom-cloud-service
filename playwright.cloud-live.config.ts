import { defineConfig, devices } from '@playwright/test';

/**
 * Chạy e2e Cloud đè lên dev server ĐANG SỐNG ở 5100 (không tự spawn server mới),
 * dùng để kiểm chứng nhanh trên stack local thật:
 *
 *   HACOM_CLOUD_E2E_LOGIN=<email> HACOM_CLOUD_E2E_PASSWORD=<mật khẩu> \
 *     npx playwright test -c playwright.cloud-live.config.ts
 *
 * Khác `playwright.hacom-cloud.config.ts` ở chỗ file kia tự dựng server trên cổng
 * disposable cho CI; file này dùng đúng cổng 5100 đang chạy.
 */
export default defineConfig({
  testDir: './e2e/hacom-cloud',
  testMatch: /(cloud-in-chat|ui-consistency|panel-exclusive)\.spec\.ts/,
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  // Một worker: nhiều tab cùng đăng nhập một tài khoản vào một dev server gây
  // chập chờn (session/WS giành nhau), không phản ánh lỗi thật của app.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.HACOM_CLOUD_WEB_BASE_URL ?? 'http://localhost:5100',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
