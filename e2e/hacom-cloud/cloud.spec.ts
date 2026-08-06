import { expect, test } from '@playwright/test';

const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;

test.beforeEach(async ({ page }) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required for the disposable local E2E principal.');
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
});

test('creates a note and uploads a real file through the Cloud UI', async ({ page }) => {
  await page.locator('a[href="/cloud"]').first().click();
  await page.waitForURL('**/cloud');
  await expect(page.getByRole('heading', { name: /Cloud của tôi/i })).toBeVisible();

  const note = `browser-e2e-${Date.now()}`;
  await page.getByPlaceholder(/Viết ghi chú/i).fill(note);
  await page.getByRole('button', { name: /Lưu ghi chú/i }).click();
  await expect(page.getByText(note)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-cloud.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Hacom Cloud browser E2E fixture', 'utf8'),
  });
  await expect(page.getByText('browser-cloud.txt')).toBeVisible();
  await expect(page.getByText(/Đã dùng/i)).toBeVisible();
});
