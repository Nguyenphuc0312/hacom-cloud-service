import { expect, test } from "@playwright/test";

test("My Documents route responds within the local smoke budget", async ({ request }) => {
  const startedAt = performance.now();
  const response = await request.get("/chat/my-documents");
  const durationMs = performance.now() - startedAt;

  expect(response.status()).toBe(200);
  expect(durationMs).toBeLessThan(3_000);
});
