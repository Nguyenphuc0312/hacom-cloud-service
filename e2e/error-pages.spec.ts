import { expect, test } from "@playwright/test";

test("unknown route renders the production 404 page", async ({ page }) => {
  await page.goto("/does-not-exist");

  await expect(
    page.getByRole("heading", { name: "Không tìm thấy trang" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Về trang chat" })).toBeVisible();
  await expect(page.getByText("Đường dẫn này không tồn tại")).toBeVisible();
});
