import { expect, test } from "@playwright/test";

test.describe("Cloud của tôi release smoke", () => {
  test("serves the personal Cloud route and readiness proxy", async ({ page, request }) => {
    const health = await request.get("/cloud-api/health/ready");
    expect(health.status()).toBe(200);

    const response = await page.goto("/chat/my-documents", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
