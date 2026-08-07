import { expect, test, type Page } from '@playwright/test';

/**
 * Soi UI lệch: chuyển qua lại giữa Cloud và hội thoại thường, đo các mốc bố cục
 * (header, composer, panel) — hai màn phải khớp nhau, không xê dịch.
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

const cloudRow = (page: Page) => page.getByRole('option', { name: /Cloud của tôi/i });
const composer = (page: Page) =>
  page.locator('[data-testid="chat-composer-input"][contenteditable="true"]');

/** Các mốc bố cục quyết định "nhìn có lệch không". */
const layoutMetrics = (page: Page) =>
  page.evaluate(() => {
    const round = (n: number | undefined) => (typeof n === 'number' ? Math.round(n) : null);
    const header = document.querySelector('header.chat-header');
    const composerEl = document.querySelector('[data-testid="chat-composer-input"]');
    const composerBox = composerEl?.closest('div[class*="border-t"]') ?? composerEl?.parentElement;
    return {
      headerHeight: round(header?.getBoundingClientRect().height),
      headerTop: round(header?.getBoundingClientRect().top),
      headerLeft: round(header?.getBoundingClientRect().left),
      composerLeft: round(composerBox?.getBoundingClientRect().left),
      composerWidth: round(composerBox?.getBoundingClientRect().width),
      composerBottom: round(composerBox?.getBoundingClientRect().bottom),
      pageOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

test('UI Cloud khớp hội thoại thường khi tab qua lại', async ({ page }) => {
  await login(page);
  await page.goto('/chat');

  // Hội thoại thường làm mốc chuẩn.
  await page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first().click();
  await composer(page).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1200);
  const normal = await layoutMetrics(page);

  // Cloud.
  await cloudRow(page).click();
  await composer(page).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1200);
  const cloud = await layoutMetrics(page);

  // Quay lại hội thoại thường lần nữa — phải trở về đúng mốc ban đầu.
  await page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first().click();
  await composer(page).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1200);
  const normalAgain = await layoutMetrics(page);

  console.log('\n===== MỐC BỐ CỤC =====');
  console.log('hội thoại thường :', JSON.stringify(normal));
  console.log('Cloud            :', JSON.stringify(cloud));
  console.log('thường (lần 2)   :', JSON.stringify(normalAgain));

  // Header phải cùng chiều cao và cùng vị trí.
  expect(cloud.headerHeight, 'chiều cao header lệch').toBe(normal.headerHeight);
  expect(cloud.headerTop, 'vị trí header lệch').toBe(normal.headerTop);
  expect(cloud.headerLeft, 'lề trái header lệch').toBe(normal.headerLeft);

  // Ô nhập phải cùng lề trái, cùng bề rộng, cùng đáy.
  expect(cloud.composerLeft, 'lề trái ô nhập lệch').toBe(normal.composerLeft);
  expect(cloud.composerWidth, 'bề rộng ô nhập lệch').toBe(normal.composerWidth);
  expect(cloud.composerBottom, 'đáy ô nhập lệch').toBe(normal.composerBottom);

  // Không màn nào được tràn ngang.
  expect(cloud.pageOverflow, 'Cloud tràn ngang').toBeLessThanOrEqual(1);
  expect(normal.pageOverflow, 'hội thoại thường tràn ngang').toBeLessThanOrEqual(1);

  // Quay lại phải khớp mốc ban đầu (không để lại di chứng).
  expect(normalAgain, 'quay lại hội thoại thường bị lệch so với ban đầu').toEqual(normal);
});

test('bấm icon Cloud trên rail không nháy trắng cả màn', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await page.getByRole('option').filter({ hasNotText: /Cloud của tôi/i }).first().click();
  await composer(page).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1500); // để cache id Cloud kịp ghi

  // Theo dõi: trong lúc chuyển, sidebar danh sách chat có bị gỡ khỏi DOM không.
  // Nếu cả app bị thay bằng spinner toàn màn thì sidebar sẽ biến mất → nháy trắng.
  await page.evaluate(() => {
    (window as unknown as { __sidebarGone: boolean }).__sidebarGone = false;
    const observer = new MutationObserver(() => {
      const hasSidebar = Boolean(document.querySelector('[role="listbox"], [role="option"]'));
      if (!hasSidebar) (window as unknown as { __sidebarGone: boolean }).__sidebarGone = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Nút rail là icon, nhận diện qua href trỏ tới hội thoại Cloud (hoặc /cloud khi chưa cache).
  const cloudHref = await page.evaluate(() => {
    const id = localStorage.getItem('hacom-cloud:conversation-id');
    return id ? `/chat/${id}` : '/cloud';
  });
  await page.locator(`.hc-side-rail a[href="${cloudHref}"]`).first().click();
  await page.getByRole('heading', { name: /Cloud của tôi/i }).waitFor({ timeout: 40_000 });

  const flashed = await page.evaluate(
    () => (window as unknown as { __sidebarGone: boolean }).__sidebarGone,
  );
  expect(flashed, 'cả màn bị thay bằng màn chờ (nháy trắng) khi bấm icon rail').toBe(false);
});

test('nút kính lúp mở được panel tìm kiếm trong Cloud', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await cloudRow(page).click();
  await composer(page).waitFor({ timeout: 40_000 });

  const header = page.locator('header.chat-header');
  const searchButton = header.getByRole('button', { name: /Tìm trong cuộc trò chuyện/i }).first();
  await expect(searchButton).toBeVisible();
  await searchButton.click();

  // Panel tìm kiếm phải mở ra với ô nhập.
  await expect(page.getByPlaceholder(/Tìm/i).last()).toBeVisible({ timeout: 20_000 });
});

test('panel phải có đủ 3 mục: Ảnh/Video, Tệp, Link', async ({ page }) => {
  await login(page);
  await page.goto('/chat');
  await cloudRow(page).click();
  await composer(page).waitFor({ timeout: 40_000 });

  await page.getByRole('button', { name: /Bật hoặc tắt thông tin|thông tin/i }).first().click();
  await expect(page.getByText(/Ảnh và video gần đây/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Tệp gần đây/i)).toBeVisible();
  await expect(page.getByText(/Dung lượng lưu trữ/i)).toBeVisible();

  // Mục Link nằm cuối panel — cuộn vùng cuộn của panel xuống đáy.
  await page.evaluate(() => {
    const strong = Array.from(document.querySelectorAll('strong'))
      .find((el) => el.textContent?.trim() === 'Thông tin Hacom Cloud');
    const scroller = strong?.closest('aside')?.querySelector('.overflow-y-auto');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  // Tiêu đề mục kèm số đếm: "Link" + "(0)" nằm trong cùng một nút.
  await expect(page.getByRole('button', { name: /^Link\s*\(\d+\)$/ })).toBeVisible({ timeout: 20_000 });
});
