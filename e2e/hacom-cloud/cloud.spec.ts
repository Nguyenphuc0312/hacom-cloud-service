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
  // /cloud nay là lối tắt: giải id rồi chuyển sang /chat/<id> (Cloud sống trong
  // danh sách hội thoại như My Documents của Zalo).
  await target.waitForURL(/\/chat\/[^/]+$/, { timeout: 20_000 });
  await expect(target.getByRole('heading', { name: /Cloud của tôi/i })).toBeVisible();
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
    const quotaHeading = page.getByRole('heading', { name: /Dung lượng lưu trữ/i });
    if (!(await quotaHeading.isVisible())) {
      await page.getByRole('button', { name: 'Bật/tắt bảng thông tin' }).first().click();
    }
    await expect(quotaHeading).toBeVisible();
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

    const manageButton = page.getByRole('button', { name: /Xem và quản lý Hacom Cloud/i });
    if (!(await manageButton.isVisible())) {
      await page.getByRole('button', { name: 'Bật/tắt bảng thông tin' }).first().click();
    }
    await manageButton.click();
    await page.waitForURL(/\/cloud\/manage$/);

    const fileOptions = page.getByLabel(`Tùy chọn tệp ${filename}`);
    await expect(fileOptions).toBeVisible({ timeout: 20_000 });
    await fileOptions.click();
    await page.getByRole('menuitem', { name: 'Xóa' }).click();
    await expect(fileOptions).toBeHidden();

    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(fileOptions).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(fileOptions).toBeVisible({ timeout: 20_000 });
  });
});
