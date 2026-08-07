import { expect, test, type Page } from '@playwright/test';

/**
 * Chỉ một panel bên phải được mở tại một thời điểm — ở CẢ Cloud lẫn hội thoại nhóm.
 * Trước đây mở được cả Tìm kiếm + Thông tin, bóp khung chat còn một dải hẹp.
 */
const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD ?? '';

test.setTimeout(180_000);

const login = async (page: Page) => {
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

const composer = (page: Page) =>
  page.locator('[data-testid="chat-composer-input"][contenteditable="true"]');
const header = (page: Page) => page.locator('header.chat-header');
const searchBtn = (page: Page) =>
  header(page).getByRole('button', { name: /Tìm trong cuộc trò chuyện/i }).first();
const infoBtn = (page: Page) =>
  header(page).getByRole('button', { name: 'Bật/tắt bảng thông tin' }).first();

/**
 * Đếm panel đang thực sự chiếm chỗ ở cạnh phải. Chỉ tính <aside> hẹp (panel thật),
 * bỏ qua các khối bọc rộng như <section> của Cloud — nó cũng chạm mép phải.
 */
const openPanelCount = (page: Page) =>
  page.evaluate(() => {
    const isRightPanel = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 150 &&
        rect.width < 560 && // panel bên phải, không phải khối bọc cả màn
        rect.right > window.innerWidth - 8 &&
        rect.height > 200
      );
    };
    return Array.from(document.querySelectorAll('aside')).filter(isRightPanel).length;
  });

test('hội thoại nhóm: mở Tìm kiếm thì Thông tin phải đóng và ngược lại', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first().click();
  await composer(page).waitFor({ timeout: 40_000 });

  await infoBtn(page).click();
  await page.waitForTimeout(900);
  const afterInfo = await openPanelCount(page);
  expect(afterInfo, 'mở Thông tin: phải có đúng 1 panel').toBeLessThanOrEqual(1);

  await searchBtn(page).click();
  await page.waitForTimeout(900);
  expect(await openPanelCount(page), 'mở Tìm kiếm khi Thông tin đang mở: vẫn phải 1 panel')
    .toBeLessThanOrEqual(1);
  await expect(page.getByPlaceholder(/Tìm trong cuộc trò chuyện/i)).toBeVisible();

  // Bấm lại Thông tin: Tìm kiếm phải nhường chỗ.
  await infoBtn(page).click();
  await page.waitForTimeout(900);
  expect(await openPanelCount(page), 'quay lại Thông tin: vẫn phải 1 panel')
    .toBeLessThanOrEqual(1);
  await expect(page.getByPlaceholder(/Tìm trong cuộc trò chuyện/i)).toHaveCount(0);
});

test('Cloud: mở Tìm kiếm thì Thông tin phải đóng và ngược lại', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await page.getByRole('option', { name: /Cloud của tôi/i }).click();
  await composer(page).waitFor({ timeout: 40_000 });

  await infoBtn(page).click();
  await page.waitForTimeout(900);
  expect(await openPanelCount(page)).toBeLessThanOrEqual(1);

  await searchBtn(page).click();
  await page.waitForTimeout(900);
  expect(await openPanelCount(page), 'Cloud: hai panel cùng mở').toBeLessThanOrEqual(1);

  // Bấm lại Thông tin phải mở được (trước đây bấm kính lúp xong là kẹt).
  await infoBtn(page).click();
  await page.waitForTimeout(900);
  await expect(page.getByText(/Dung lượng lưu trữ/i)).toBeVisible({ timeout: 15_000 });
  expect(await openPanelCount(page)).toBeLessThanOrEqual(1);
});

test('kết quả tìm kiếm hiện chữ, không hiện thẻ HTML thô', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await page.getByRole('option', { name: /Cloud của tôi/i }).click();
  await composer(page).waitFor({ timeout: 40_000 });

  // Gửi một tin có link để Tiptap sinh ra HTML <a href…>.
  const marker = `linktest${Date.now()}`;
  await composer(page).fill(`https://www.msn.com/${marker}`);
  await composer(page).press('Enter');
  await page.waitForTimeout(3000);

  await searchBtn(page).click();
  await page.getByPlaceholder(/Tìm trong cuộc trò chuyện/i).fill(marker);
  await page.waitForTimeout(4000);

  const panelText = await page.locator('body').innerText();
  expect(panelText, 'kết quả tìm kiếm lộ thẻ HTML thô').not.toContain('<a target=');
  expect(panelText).not.toContain('rel="noopener');
});
