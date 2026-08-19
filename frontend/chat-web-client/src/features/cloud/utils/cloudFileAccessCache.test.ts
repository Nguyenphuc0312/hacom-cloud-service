import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudApi } from "../api/cloudApi";
import type { CloudFileAccess } from "../types";
import {
  clearCloudFileAccessCache,
  getCachedCloudFileAccess,
} from "./cloudFileAccessCache";

const access = (overrides: Partial<CloudFileAccess> = {}): CloudFileAccess => ({
  itemId: "item-1",
  url: "http://localhost:9000/object/item-1?signature=1",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  fileName: "item.txt",
  contentType: "text/plain",
  sizeBytes: 4,
  ...overrides,
});
describe("cloud file access cache", () => {
  afterEach(() => {
    clearCloudFileAccessCache();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent access requests for the same item", async () => {
    const request = vi
      .spyOn(cloudApi, "getFileAccess")
      .mockResolvedValue(access());

    const [first, second] = await Promise.all([
      getCachedCloudFileAccess("user-1", "item-1"),
      getCachedCloudFileAccess("user-1", "item-1"),
    ]);

    expect(first).toEqual(second);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh URL and refreshes one that is near expiry", async () => {
    const request = vi
      .spyOn(cloudApi, "getFileAccess")
      .mockResolvedValueOnce(access())
      .mockResolvedValueOnce(
        access({
          url: "http://localhost:9000/object/item-1?signature=2",
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        }),
      );

    await getCachedCloudFileAccess("user-1", "item-1");
    await getCachedCloudFileAccess("user-1", "item-1");
    expect(request).toHaveBeenCalledTimes(1);

    await getCachedCloudFileAccess("user-1", "item-1", {
      force: true,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
