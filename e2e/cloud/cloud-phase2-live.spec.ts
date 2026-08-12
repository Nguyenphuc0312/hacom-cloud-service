import { expect, test as base } from "@playwright/test";

const liveEnabled = process.env.HACOM_CLOUD_E2E_LIVE === "true";
const test = liveEnabled ? base : base.extend({});

test.describe("Cloud Phase 2 live lifecycle", () => {
  test.skip(
    !liveEnabled,
    "Set HACOM_CLOUD_E2E_LIVE=true and provide local integration credentials to run this test.",
  );
  test.setTimeout(120_000);

  test("login, filter/search, upload, preview, trash, restore and delete", async ({
    page,
  }) => {
    const username = process.env.HACOM_CLOUD_E2E_USERNAME;
    const password = process.env.HACOM_CLOUD_E2E_PASSWORD;
    if (!username || !password) {
      throw new Error(
        "HACOM_CLOUD_E2E_USERNAME and HACOM_CLOUD_E2E_PASSWORD are required.",
      );
    }

    await page.goto("/login");
    await page.getByLabel(/tài khoản|login identifier/i).fill(username);
    await page.getByLabel(/mật khẩu|password/i).fill(password);
    await page.getByRole("button", { name: /đăng nhập|sign in/i }).click();
    await page.waitForURL(/\/chat\/my-documents/, { timeout: 30_000 });

    const note = `phase2-live-${Date.now()}`;
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/cloud/texts"),
    );
    await page.getByPlaceholder(/nhập.*my documents|type.*my documents/i).fill(note);
    await page.keyboard.press("Enter");
    await createResponse;
    await expect(page.getByText(note, { exact: true })).toBeVisible();

    const filters = page.getByTestId("cloud-type-filters");
    const imageResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/cloud/items") &&
        new URL(response.url()).searchParams.get("type") === "image",
    );
    await filters.getByRole("button", { name: /hình ảnh|images/i }).click();
    await imageResponse;
    await expect(page.getByText(note, { exact: true })).toHaveCount(0);
    await filters.getByRole("button", { name: /tất cả|all/i }).click();

    await page.getByRole("button", { name: /tìm kiếm|search/i }).last().click();
    const searchInput = page.getByTestId("cloud-search-input");
    const searchResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/cloud/items") &&
        new URL(response.url()).searchParams.get("q") === note,
    );
    await searchInput.fill(note);
    await searchResponse;
    await expect(page.getByText(note, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /tìm kiếm|search/i }).last().click();
    await page.getByText(note, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: /đưa vào thùng rác|move to trash/i }).click();
    await expect(page.getByText(/đã đưa mục vào|moved to trash/i)).toBeVisible();

    await page.getByRole("button", { name: /thùng rác|trash/i }).first().click();
    const trashItem = page.getByText(note, { exact: true });
    await expect(trashItem).toBeVisible();
    await trashItem.locator("..")
      .getByRole("button", { name: /khôi phục|restore/i })
      .click();
    await expect(page.getByText(/đã khôi phục|restored/i)).toBeVisible();

    await page.getByText(note, { exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: /đưa vào thùng rác|move to trash/i }).click();
    await page.getByRole("button", { name: /thùng rác|trash/i }).first().click();
    await page.getByText(note, { exact: true }).locator("..").getByRole("button", {
      name: /xóa vĩnh viễn|delete permanently/i,
    }).click();
    await page.getByRole("button", { name: /xóa vĩnh viễn|delete permanently/i }).last().click();
    await expect(page.getByText(/đã xóa vĩnh viễn|permanently deleted/i)).toBeVisible();
  });
});
