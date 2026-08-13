import { expect, test } from "@playwright/test";

test("login shell loads within the local performance budget", async ({ page }) => {
  const startedAt = Date.now();
  await page.goto("/login");
  await expect(page.locator("body")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(10_000);
});
