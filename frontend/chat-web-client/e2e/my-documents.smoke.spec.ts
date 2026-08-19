import { expect, test } from "@playwright/test";

test.describe("My Documents release smoke", () => {
  test("serves the My Documents route and Cloud readiness proxy", async ({ page, request }) => {
    const health = await request.get("/cloud-api/health/ready");
    expect(health.status()).toBe(200);

    const response = await page.goto("/chat/my-documents", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
