import { expect, test, type Page } from '@playwright/test';

/**
 * Cloud của tôi mở NGAY trong danh sách hội thoại (như My Documents của Zalo),
 * không còn bị đá sang trang riêng /cloud.
 */
const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;

test.setTimeout(90_000);

const login = async (page: Page) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required.');
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

test.describe.serial('Cloud của tôi nằm trong danh sách hội thoại', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('bấm từ danh sách chat thì mở tại /chat/<id>, không nhảy sang /cloud', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('option', { name: /Cloud của tôi/i }).click();

    await expect(page).toHaveURL(/\/chat\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/cloud$/);
    await expect(page.getByRole('heading', { name: /Cloud của tôi/i })).toBeVisible();
  });

  test('header không có nút gọi và không hiện "0 thành viên"', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('option', { name: /Cloud của tôi/i }).click();
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);

    const header = page.locator('header.chat-header');
    await expect(header.getByRole('button', { name: /gọi thoại|voice call/i })).toHaveCount(0);
    await expect(header.getByRole('button', { name: /gọi video|video call/i })).toHaveCount(0);
    await expect(header.getByText(/\b0 thành viên\b/i)).toHaveCount(0);
    await expect(header.getByText(/Lưu trữ và đồng bộ/i)).toBeVisible();
  });

  test('panel thông tin đóng sẵn, bấm nút mới mở', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('option', { name: /Cloud của tôi/i }).click();
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);

    // Tiêu đề panel là <strong>, không phải heading role.
    const panelTitle = page.getByText('Thông tin Hacom Cloud', { exact: true });
    await expect(panelTitle).toBeHidden();

    await page.getByRole('button', { name: /Bật hoặc tắt thông tin|toggleInfoPanel|thông tin/i }).first().click();
    await expect(panelTitle).toBeVisible();
    await expect(page.getByText(/Dung lượng lưu trữ/i)).toBeVisible();
  });

  test('/cloud vẫn dùng được: chuyển hướng sang /chat/<id>', async ({ page }) => {
    await page.goto('/cloud');
    await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Cloud của tôi/i })).toBeVisible();
  });

  test('gửi được ghi chú trong khung chat', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('option', { name: /Cloud của tôi/i }).click();
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);

    const note = `cloud-in-chat-${Date.now()}`;
    const composer = page.getByTestId('chat-composer-input');
    await composer.fill(note);
    await composer.press('Enter');
    await expect(page.getByText(note)).toBeVisible({ timeout: 15_000 });
  });
});
