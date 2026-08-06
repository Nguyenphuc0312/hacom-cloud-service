import { expect, test } from "@playwright/test";

const hasLiveCloudCredentials = Boolean(
  process.env.CLOUD_E2E_LOGIN &&
    process.env.CLOUD_E2E_PASSWORD &&
    process.env.CLOUD_E2E_MUTATION === "true",
);

test.describe("Cloud Phase 2 full lifecycle", () => {
  test.skip(
    !hasLiveCloudCredentials,
    "Set CLOUD_E2E_LOGIN, CLOUD_E2E_PASSWORD and CLOUD_E2E_MUTATION=true for a live Hacom integration run.",
  );

  test("login → upload → preview → Trash → restore → permanent delete", async ({
    page,
  }) => {
    const fileName = `cloud-phase2-e2e-${Date.now()}.txt`;

    await page.goto("/login");
    await page.getByLabel(/tài khoản|username|email/i).first().fill(
      process.env.CLOUD_E2E_LOGIN!,
    );
    await page.getByLabel(/mật khẩu|password/i).first().fill(
      process.env.CLOUD_E2E_PASSWORD!,
    );
    await page.getByRole("button", { name: /đăng nhập|log in|sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });

    await page.goto("/chat/my-documents");
    await expect(page.getByText("My Documents").first()).toBeVisible();

    await page.locator('input[type="file"]').last().setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("Cloud Phase 2 end-to-end preview"),
    });

    const message = page.locator('[data-testid^="message-item-"]').filter({
      hasText: fileName,
    }).first();
    await expect(message).toBeVisible({ timeout: 30_000 });
    await message.getByRole("button", { name: /xem trước|preview/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /đóng|close/i }).last().click();

    await message.hover();
    await message.getByTestId("message-action-more").click();
    await page.getByRole("menuitem", { name: /xóa|delete/i }).first().click();
    await page.getByRole("button", { name: /đưa vào thùng rác|move to trash/i }).click();
    await expect(message).toHaveCount(0);

    await page.getByRole("button", { name: /toggle info|thông tin/i }).click();
    await page.getByRole("button", { name: /thùng rác|trash/i }).click();
    const trashMessage = page.locator("article.cloud-trash-message").filter({
      hasText: fileName,
    });
    await expect(trashMessage).toBeVisible({ timeout: 15_000 });
    await trashMessage.getByRole("button", { name: /khôi phục|restore/i }).click();
    await expect(trashMessage).toHaveCount(0);

    await page.getByRole("button", { name: /tất cả|all/i }).click();
    const restoredMessage = page.locator('[data-testid^="message-item-"]').filter({
      hasText: fileName,
    }).first();
    await expect(restoredMessage).toBeVisible({ timeout: 15_000 });
    await restoredMessage.hover();
    await restoredMessage.getByTestId("message-action-more").click();
    await page.getByRole("menuitem", { name: /xóa|delete/i }).first().click();
    await page.getByRole("button", { name: /xóa ngay|delete now/i }).click();
    await expect(restoredMessage).toHaveCount(0);
  });
});
