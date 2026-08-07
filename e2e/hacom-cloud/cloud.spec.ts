import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;
let context: BrowserContext;
let page: Page;

const login = async (target: Page) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required for disposable local E2E.');
  await target.goto('/login');
  await target.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await target.locator('input[type="password"]').fill(password);
  await target.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await target.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

const openCloud = async (target: Page) => {
  await target.goto('/cloud');
  await target.waitForURL('**/cloud');
  await expect(target.getByRole('heading', { name: /Cloud của tôi/i, level: 1 })).toBeVisible();
};

test.describe.serial('Hacom Cloud browser state', () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
    await openCloud(page);
  });

  test.afterAll(async () => context.close());

  test('does not show upload success before server finalization and updates visible quota', async () => {
    const filename = `browser-cloud-${Date.now()}.txt`;
    await page.route('**/api/v1/cloud/uploads/*/complete', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    const completionResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/cloud/uploads/')
      && response.url().endsWith('/complete')
      && response.request().method() === 'POST',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('Hacom Cloud browser E2E fixture', 'utf8'),
    });
    await expect(page.getByText('Đang hoàn tất…')).toBeVisible();
    const completed = await completionResponse;
    expect(completed.ok()).toBe(true);
    const body = await completed.json() as {
      data?: { quota?: { usedBytes: string; reservedBytes: string } };
    };
    const completeQuota = body.data?.quota;
    await expect(page.getByRole('listitem', { name: `${filename} - completing` })).toBeHidden({
      timeout: 20_000,
    });
    await expect(page.getByText(filename).first()).toBeVisible();
    expect(completeQuota?.reservedBytes).toBe('0');
    expect(BigInt(completeQuota?.usedBytes ?? '0')).toBeGreaterThan(0n);
    await expect(page.getByRole('heading', { name: /Dung lượng lưu trữ/i })).toBeVisible();
    await page.reload();
    await expect(page.getByText(filename).first()).toBeVisible({ timeout: 20_000 });
  });

  test('moves an asset to trash and restores it through source-backed UI state', async () => {
    const filename = `browser-restore-${Date.now()}.txt`;
    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('restore fixture', 'utf8'),
    });
    await expect(page.getByText(filename).first()).toBeVisible({ timeout: 20_000 });

    await page.getByLabel(`Thao tác với ${filename}`).click();
    await page.getByRole('menuitem', { name: 'Xóa' }).click();
    const restoreButton = page.getByLabel(`Khôi phục ${filename}`);
    await expect(restoreButton).toBeVisible();
    await restoreButton.click();
    await expect(page.getByLabel(`Thao tác với ${filename}`)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(`Thao tác với ${filename}`)).toBeVisible({ timeout: 20_000 });
  });
});
