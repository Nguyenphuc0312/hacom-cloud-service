import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const batchThumbnailUrls = vi.fn();

vi.mock("../services/api", () => ({
  fileApi: { batchThumbnailUrls: (...args: unknown[]) => batchThumbnailUrls(...args) },
}));
vi.mock("../lib/apiContract", () => ({ unwrapApiSuccess: (value: unknown) => value }));
vi.mock("../config", () => ({ resolvePublicResourceUrl: (value: string) => value }));
vi.mock("../utils/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../lib/blobPreviewCache", () => ({ blobPreviewCache: { delete: vi.fn() } }));

import {
  __thumbnailCacheTestUtils,
  fetchThumbnailUrlsShared,
} from "./useBatchThumbnailUrl";

const readyItem = (fileId: string) => ({
  fileId,
  url: `https://example.test/${fileId}`,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  status: "ready",
  variant: "thumbnail",
  isRetryable: false,
  retryAfterMs: null,
  cacheTtlMs: 120_000,
});

describe("thumbnail batch coordinator", () => {
  beforeEach(() => {
    batchThumbnailUrls.mockReset();
    __thumbnailCacheTestUtils.clearThumbnailCache();
    __thumbnailCacheTestUtils.clearBatchQueues();
  });

  afterEach(() => __thumbnailCacheTestUtils.clearBatchQueues());

  it("coalesces 20 cold visible attachment lookups into one API batch", async () => {
    batchThumbnailUrls.mockImplementation(async ({ fileIds }: { fileIds: string[] }) => ({
      items: fileIds.map(readyItem),
    }));

    const ids = Array.from({ length: 20 }, (_, index) => `file-${index}`);
    const results = await Promise.all(ids.map((fileId) => fetchThumbnailUrlsShared("conversation-1", [fileId])));

    expect(batchThumbnailUrls).toHaveBeenCalledTimes(1);
    expect(batchThumbnailUrls).toHaveBeenCalledWith({ conversationId: "conversation-1", fileIds: ids });
    expect(results.every((result, index) => result[ids[index]]?.status === "ready")).toBe(true);
  });

  it("dedupes duplicate attachment callers before issuing the batch", async () => {
    batchThumbnailUrls.mockImplementation(async ({ fileIds }: { fileIds: string[] }) => ({
      items: fileIds.map(readyItem),
    }));

    await Promise.all([
      fetchThumbnailUrlsShared("conversation-1", ["same-file"]),
      fetchThumbnailUrlsShared("conversation-1", ["same-file"]),
    ]);

    expect(batchThumbnailUrls).toHaveBeenCalledTimes(1);
    expect(batchThumbnailUrls).toHaveBeenCalledWith({ conversationId: "conversation-1", fileIds: ["same-file"] });
  });

  it("uses a warm URL cache without minting another signed URL", async () => {
    batchThumbnailUrls.mockResolvedValueOnce({ items: [readyItem("warm-file")] });
    await fetchThumbnailUrlsShared("conversation-1", ["warm-file"]);
    await fetchThumbnailUrlsShared("conversation-1", ["warm-file"]);
    expect(batchThumbnailUrls).toHaveBeenCalledTimes(1);
  });

  it("keeps partial batch success available to the resolved attachment", async () => {
    batchThumbnailUrls.mockResolvedValue({ items: [readyItem("ready-file")] });
    const result = await fetchThumbnailUrlsShared("conversation-1", ["ready-file", "missing-file"]);
    expect(result["ready-file"]?.url).toContain("ready-file");
    expect(result["missing-file"]).toBeUndefined();
  });
});
