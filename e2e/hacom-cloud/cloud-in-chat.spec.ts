import { expect, test, type Page } from '@playwright/test';

/**
 * Cloud của tôi mở NGAY trong danh sách hội thoại (như My Documents của Zalo),
 * không còn bị đá sang trang riêng /cloud.
 */
const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;

test.setTimeout(120_000);

const login = async (page: Page) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required.');
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

const cloudRow = (page: Page) => page.getByRole('option', { name: /Cloud của tôi/i });
const cloudHeading = (page: Page) => page.getByRole('heading', { name: /Cloud của tôi/i });
const composer = (page: Page) => page.locator('[data-testid="chat-composer-input"][contenteditable="true"]');

/**
 * Panel đóng bằng translate + width 0 (giữ animation trượt), nên nó vẫn ở trong DOM
 * và Playwright coi là "visible". Thứ người dùng thật cảm nhận là panel có chiếm chỗ
 * trong khung nhìn hay không — đo bằng bề rộng thực tế.
 */
const infoPanelWidth = (page: Page) =>
  page.evaluate(() => {
    const strong = Array.from(document.querySelectorAll('strong'))
      .find((el) => el.textContent?.trim() === 'Thông tin Hacom Cloud');
    const aside = strong?.closest('aside');
    return aside ? Math.round(aside.getBoundingClientRect().width) : 0;
  });

const openCloudFromSidebar = async (page: Page) => {
  await page.goto('/chat');
  await cloudRow(page).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  await expect(cloudHeading(page)).toBeVisible({ timeout: 20_000 });
};

test.describe.serial('Cloud của tôi nằm trong danh sách hội thoại', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('bấm từ danh sách chat thì mở tại /chat/<id>, không nhảy sang /cloud', async ({ page }) => {
    await openCloudFromSidebar(page);
    await expect(page).not.toHaveURL(/\/cloud$/);
  });

  test('header không có nút gọi và không hiện "0 thành viên"', async ({ page }) => {
    await openCloudFromSidebar(page);

    const header = page.locator('header.chat-header');
    await expect(header.getByRole('button', { name: /gọi thoại|voice call/i })).toHaveCount(0);
    await expect(header.getByRole('button', { name: /gọi video|video call/i })).toHaveCount(0);
    await expect(header.getByText(/\b0 thành viên\b/i)).toHaveCount(0);
    await expect(header.getByText(/Lưu trữ và đồng bộ/i)).toBeVisible();
  });

  test('panel thông tin đóng sẵn, bấm nút mới mở', async ({ page }) => {
    await openCloudFromSidebar(page);

    expect(await infoPanelWidth(page)).toBe(0);

    await page.getByRole('button', { name: /Bật hoặc tắt thông tin|toggleInfoPanel|thông tin/i }).first().click();
    await expect.poll(() => infoPanelWidth(page)).toBeGreaterThan(200);
    await expect(page.getByText(/Dung lượng lưu trữ/i)).toBeVisible();
  });

  test('panel vẫn đóng lại khi vào lần sau (không nhớ trạng thái)', async ({ page }) => {
    await openCloudFromSidebar(page);
    await page.getByRole('button', { name: /Bật hoặc tắt thông tin|toggleInfoPanel|thông tin/i }).first().click();
    await expect.poll(() => infoPanelWidth(page)).toBeGreaterThan(200);

    // Rời đi rồi quay lại: phải đóng như mặc định.
    await page.goto('/chat');
    await cloudRow(page).click();
    await expect(cloudHeading(page)).toBeVisible();
    await expect.poll(() => infoPanelWidth(page)).toBe(0);
  });

  test('/cloud vẫn dùng được: chuyển hướng sang /chat/<id>', async ({ page }) => {
    await page.goto('/cloud');
    await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 20_000 });
    // Lối vào lạnh (chưa cache id) phải chờ ensure() + tải conversation.
    await expect(cloudHeading(page)).toBeVisible({ timeout: 20_000 });
  });

  test('F5 ngay trên URL Cloud vẫn ra Cloud, không ra UI nhóm', async ({ page }) => {
    await openCloudFromSidebar(page);
    const url = page.url();

    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(cloudHeading(page)).toBeVisible();
    await expect(page.getByText(/\b0 thành viên\b/i)).toHaveCount(0);
    await expect(page.getByText(/Target conversation is not a group/i)).toHaveCount(0);
    await expect(composer(page)).toBeVisible();
  });

  test('chuyển qua lại Cloud ↔ hội thoại thường không dính UI của nhau', async ({ page }) => {
    await openCloudFromSidebar(page);

    // Sang hội thoại thường: phải mất giao diện Cloud.
    const otherRow = page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first();
    await otherRow.click();
    await expect(page.getByText(/Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud/i)).toHaveCount(0);

    // Quay lại Cloud: phải đúng giao diện Cloud, không còn nút gọi.
    await cloudRow(page).click();
    await expect(cloudHeading(page)).toBeVisible();
    const header = page.locator('header.chat-header');
    await expect(header.getByRole('button', { name: /gọi thoại|voice call/i })).toHaveCount(0);
  });

  test('nút back của trình duyệt hoạt động đúng', async ({ page }) => {
    await page.goto('/chat');
    const otherRow = page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first();
    await otherRow.click();
    const normalUrl = page.url();

    await cloudRow(page).click();
    await expect(cloudHeading(page)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(normalUrl);
    await expect(page.getByText(/Nhập ghi chú hoặc gửi tài liệu lên Hacom Cloud/i)).toHaveCount(0);
  });

  test('gửi được ghi chú trong khung chat', async ({ page }) => {
    await openCloudFromSidebar(page);

    const note = `cloud-in-chat-${Date.now()}`;
    await composer(page).fill(note);
    await composer(page).press('Enter');
    // Trong timeline (không lấy nhầm bản preview ở sidebar).
    await expect(page.locator('.chat-message-text').getByText(note)).toBeVisible({ timeout: 15_000 });
    // Và lên preview ở sidebar.
    await expect(cloudRow(page).getByText(note)).toBeVisible({ timeout: 15_000 });
  });

  test('tìm kiếm trong sidebar vẫn thấy Cloud của tôi', async ({ page }) => {
    await page.goto('/chat');
    await cloudRow(page).waitFor();
    await page.getByPlaceholder(/Tìm cuộc trò chuyện/i).fill('Cloud');
    await expect(cloudRow(page)).toBeVisible();
  });

  test('bộ lọc "Nhóm" KHÔNG được chứa Cloud của tôi', async ({ page }) => {
    await page.goto('/chat');
    await cloudRow(page).waitFor();
    // Tab lọc là phần tử bấm được có nhãn "Nhóm" kèm số đếm.
    await page.locator('button, [role="tab"]').filter({ hasText: /^Nhóm\s*\d*$/ }).first().click();
    await expect(cloudRow(page)).toHaveCount(0);
  });
});
