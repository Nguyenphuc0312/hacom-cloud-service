import { expect, test, type Page, type Request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const loginIdentifier =
  process.env.HACOM_CLOUD_E2E_LOGIN ?? "cloud.user@local.test";
const password = process.env.HACOM_CLOUD_E2E_PASSWORD;
const fixturePath = path.resolve(
  process.cwd(),
  "../performance/media-db-optimization/artifacts/runtime-fixture.json",
);
const artifactPath = path.resolve(
  process.cwd(),
  "../performance/media-db-optimization/artifacts/browser-waterfall.json",
);
const fixture = fs.existsSync(fixturePath)
  ? (JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
      conversationId: string;
    })
  : null;

test.skip(!fixture, `Requires benchmark fixture: ${fixturePath}`);

type WaterfallEntry = {
  phase: "cold" | "warm";
  method: string;
  path: string;
  queryKeys: string[];
  limit: string | null;
  resourceType: string;
  status: number;
  durationMs: number | null;
  responseBodyBytes: number | null;
  responseHeaderBytes: number | null;
  fromServiceWorker: boolean;
};

const trackedPath = (pathname: string): boolean =>
  pathname.includes(
    `/conversations/${fixture?.conversationId ?? "__missing__"}/messages`,
  ) ||
  pathname.endsWith("/files/batch-thumbnail-urls") ||
  pathname.startsWith("/chat-files/");

const login = async (page: Page): Promise<void> => {
  if (!password) throw new Error("HACOM_CLOUD_E2E_PASSWORD is required");
  await page.goto("/login");
  await page.getByLabel(/Email hoặc mã nhân viên/i).fill(loginIdentifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Đăng nhập ngay/i }).click();
  await page.waitForURL(/\/(?:chat|cloud|$)/, { timeout: 20_000 });
};

const scrollTimelineToTop = async (page: Page): Promise<void> => {
  const log = page.getByRole("log", { name: "Tin nhắn trong cuộc trò chuyện" });
  await log.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator('img[alt^="runtime-image-"]').first()).toBeVisible({
    timeout: 20_000,
  });
};

test("captures a sanitized cold/warm media waterfall", async ({ page }) => {
  test.setTimeout(120_000);
  if (!fixture) return;
  await login(page);

  let phase: WaterfallEntry["phase"] = "cold";
  const entries: WaterfallEntry[] = [];
  const pending: Array<Promise<void>> = [];

  page.on("requestfinished", (request: Request) => {
    const eventPhase = phase;
    const parsedUrl = new URL(request.url());
    const pathname = parsedUrl.pathname;
    if (!trackedPath(pathname)) return;

    pending.push(
      (async () => {
        const [response, sizes] = await Promise.all([
          request.response(),
          request.sizes().catch(() => null),
        ]);
        const timing = request.timing();
        entries.push({
          phase: eventPhase,
          method: request.method(),
          path: pathname,
          queryKeys: Array.from(parsedUrl.searchParams.keys()).sort(),
          limit: parsedUrl.searchParams.get("limit"),
          resourceType: request.resourceType(),
          status: response?.status() ?? 0,
          durationMs:
            timing.responseEnd >= 0
              ? Math.round(timing.responseEnd * 100) / 100
              : null,
          responseBodyBytes: sizes?.responseBodySize ?? null,
          responseHeaderBytes: sizes?.responseHeadersSize ?? null,
          fromServiceWorker: response?.fromServiceWorker() ?? false,
        });
      })(),
    );
  });

  const coldStartedAt = Date.now();
  await page.goto(`/chat/${fixture.conversationId}`);
  await scrollTimelineToTop(page);
  const coldFirstVisibleImageMs = Date.now() - coldStartedAt;
  await page.waitForTimeout(1_000);

  const currentUrl = page.url();
  const alternate = page
    .getByRole("option")
    .filter({ hasNotText: /Cloud của tôi/i })
    .nth(1);
  await alternate.click();
  await expect(page).not.toHaveURL(currentUrl);

  phase = "warm";
  const warmStartedAt = Date.now();
  await page.goBack();
  await expect(page).toHaveURL(currentUrl);
  await scrollTimelineToTop(page);
  const warmFirstVisibleImageMs = Date.now() - warmStartedAt;
  await page.waitForTimeout(1_000);
  await Promise.all(pending);

  const summarize = (targetPhase: WaterfallEntry["phase"]) => {
    const scoped = entries.filter((entry) => entry.phase === targetPhase);
    return {
      requestCount: scoped.length,
      apiRequests: scoped.filter((entry) => entry.path.startsWith("/api/"))
        .length,
      batchRequests: scoped.filter((entry) =>
        entry.path.endsWith("/files/batch-thumbnail-urls"),
      ).length,
      variantRequests: scoped.filter((entry) =>
        entry.path.startsWith("/chat-files/variants/"),
      ).length,
      originalImageRequests: scoped.filter((entry) =>
        entry.path.includes("runtime-image-"),
      ).length,
      videoObjectRequests: scoped.filter((entry) =>
        entry.path.includes("runtime-video-"),
      ).length,
      genericFileRequests: scoped.filter((entry) =>
        entry.path.includes("runtime-document-"),
      ).length,
      responseBodyBytes: scoped.reduce(
        (total, entry) => total + (entry.responseBodyBytes ?? 0),
        0,
      ),
    };
  };

  const artifact = {
    generatedAt: new Date().toISOString(),
    conversationId: fixture.conversationId,
    timings: { coldFirstVisibleImageMs, warmFirstVisibleImageMs },
    cold: summarize("cold"),
    warm: summarize("warm"),
    entries: entries.sort((left, right) =>
      left.phase.localeCompare(right.phase),
    ),
  };
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  expect(artifact.cold.variantRequests).toBeGreaterThan(0);
  expect(
    entries.filter(
      (entry) =>
        entry.phase === "cold" &&
        entry.path.endsWith("/messages") &&
        entry.queryKeys.length === 1 &&
        entry.queryKeys[0] === "limit" &&
        entry.limit === "50",
    ),
  ).toHaveLength(1);
  expect(artifact.cold.originalImageRequests).toBe(0);
  expect(artifact.cold.videoObjectRequests).toBe(0);
  expect(artifact.cold.genericFileRequests).toBe(0);
  expect(artifact.warm.originalImageRequests).toBe(0);
  expect(artifact.warm.videoObjectRequests).toBe(0);
  expect(artifact.warm.genericFileRequests).toBe(0);
});
