import { expect, test } from "@playwright/test";

const hasLiveCloudBackend = Boolean(
  process.env.CLOUD_E2E_LOGIN && process.env.CLOUD_E2E_PASSWORD,
);

test.describe("Cloud route boundary", () => {
  test("keeps My Documents behind the existing Chat authentication guard", async ({
    page,
  }) => {
    await page.goto("/chat/my-documents");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test("exposes Cloud health through the frontend proxy", async ({
    request,
  }) => {
    test.skip(
      !hasLiveCloudBackend,
      "Set CLOUD_E2E_LOGIN and CLOUD_E2E_PASSWORD for a live Cloud integration run.",
    );
    const response = await request.get("/cloud-api/health/ready");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      status: "UP",
      service: "cloud-api",
    });
  });
});
