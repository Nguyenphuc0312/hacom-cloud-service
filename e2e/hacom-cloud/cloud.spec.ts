import { expect, test, type Page } from '@playwright/test';

const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;

const login = async (page: Page) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required for the disposable local E2E principal.');
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('uses the shared chat workspace to create a note and upload a real file', async ({ page }) => {
  await page.locator('a[href="/cloud"]').first().click();
  await page.waitForURL('**/cloud');
  await expect(page.getByRole('heading', { name: /Cloud của tôi/i, level: 1 })).toBeVisible();

  const note = `browser-e2e-${Date.now()}`;
  const composer = page.getByTestId('chat-composer-input');
  await composer.fill(note);
  await composer.press('Enter');
  await expect(page.getByText(note)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-cloud.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Hacom Cloud browser E2E fixture', 'utf8'),
  });
  await expect(page.getByText('browser-cloud.txt')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Dung lượng lưu trữ/i })).toBeVisible();
});

test('syncs a Cloud upload to another authenticated tab without reload', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await Promise.all([login(first), login(second)]);
    await Promise.all([
      first.locator('a[href="/cloud"]').first().click(),
      second.locator('a[href="/cloud"]').first().click(),
    ]);
    await Promise.all([first.waitForURL('**/cloud'), second.waitForURL('**/cloud')]);
    await expect(second.getByRole('heading', { name: /Cloud của tôi/i })).toBeVisible();

    const filename = `browser-cloud-sync-${Date.now()}.txt`;
    await first.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('Hacom Cloud multi-tab fixture', 'utf8'),
    });
    await expect(first.getByText(filename)).toBeVisible();
    await expect(second.getByText(filename)).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});
