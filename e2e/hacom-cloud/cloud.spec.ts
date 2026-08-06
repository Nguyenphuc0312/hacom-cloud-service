import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const loginIdentifier = process.env.HACOM_CLOUD_E2E_LOGIN ?? 'cloud.user@local.test';
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;
// Two browser tabs establish independent auth sessions against the full local stack.
test.setTimeout(90_000);
let context: BrowserContext;
let first: Page;
let second: Page;

const login = async (page: Page) => {
  if (!password) throw new Error('HACOM_CLOUD_E2E_PASSWORD is required for the disposable local E2E principal.');
  await page.goto('/login');
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

const openCloud = async (page: Page) => {
  await page.goto('/cloud');
  await page.waitForURL('**/cloud');
  await expect(page.getByRole('heading', { name: /Cloud của tôi/i, level: 1 })).toBeVisible();
};

const resolveCloudConversationId = async (page: Page) => {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/cloud/ensure') && response.request().method() === 'POST',
  );
  await openCloud(page);
  const payload = await (await responsePromise).json() as { data?: { conversationId?: string } };
  if (!payload.data?.conversationId) {
    throw new Error('Cloud ensure response did not include the canonical conversationId.');
  }
  return payload.data.conversationId;
};

const openCloudFromChat = async (page: Page) => {
  await page.goto('/chat');
  await Promise.all([
    page.waitForURL('**/cloud'),
    page.getByRole('option', { name: /Cloud của tôi/i }).click(),
  ]);
  await expect(page.getByRole('heading', { name: /Cloud của tôi/i, level: 1 })).toBeVisible();
};

test.describe.serial('Hacom Cloud browser flow', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(90_000);
    context = await browser.newContext();
    first = await context.newPage();
    await login(first);
    // The second tab obtains its in-memory access token through the HttpOnly
    // refresh-cookie bootstrap, as a real same-browser multi-tab session does.
    second = await context.newPage();
    await openCloud(second);
    await openCloudFromChat(first);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('uses the shared chat workspace to create a note and upload a real file', async () => {
    const note = `browser-e2e-${Date.now()}`;
    const composer = first.getByTestId('chat-composer-input');
    await composer.fill(note);
    await composer.press('Enter');
    await expect(first.getByText(note)).toBeVisible();

    await first.locator('input[type="file"]').setInputFiles({
      name: 'browser-cloud.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Hacom Cloud browser E2E fixture', 'utf8'),
    });
    await expect(first.getByText('browser-cloud.txt')).toBeVisible();
    await expect(first.getByRole('heading', { name: /Dung lượng lưu trữ/i })).toBeVisible();
  });

  test('syncs a Cloud upload to another active tab without reload', async () => {
    const filename = `browser-cloud-sync-${Date.now()}.txt`;
    await first.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('Hacom Cloud multi-tab fixture', 'utf8'),
    });
    await expect(first.getByText(filename)).toBeVisible();
    await expect(second.getByText(filename).first()).toBeVisible({ timeout: 15_000 });
  });

  test('synchronizes a Cloud note to another active tab without reload', async () => {
    const note = `browser-cloud-realtime-${Date.now()}`;
    await first.getByTestId('chat-composer-input').fill(note);
    await first.getByTestId('chat-composer-input').press('Enter');
    await expect(second.getByText(note)).toBeVisible({ timeout: 15_000 });
  });

  test('redirects a saved Cloud chat URL before group UI can mount', async () => {
    const cloudConversationId = await resolveCloudConversationId(second);
    await second.goto(`/chat/${cloudConversationId}`);
    await second.waitForURL('**/cloud');
    await expect(second.getByRole('heading', { name: /Cloud cá»§a tĂ´i/i, level: 1 })).toBeVisible();
    await expect(second.getByText(/Target conversation is not a group/i)).toHaveCount(0);
  });
});
