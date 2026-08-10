import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { FileType } from "../types";
import { cloudApi } from "../features/cloud/api/cloudApi";
import { clearCloudFileAccessCache } from "../features/cloud/utils/cloudFileAccessCache";
import { dedupeSignedUrlRequest, useAttachmentDownloadUrl } from "./useAttachmentDownloadUrl";

afterEach(() => {
  clearCloudFileAccessCache();
  vi.restoreAllMocks();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("dedupeSignedUrlRequest", () => {
  it("collapses concurrent requests for the same key into one fetch", async () => {
    const d = deferred<string | undefined>();
    const fetcher = vi.fn(() => d.promise);

    const a = dedupeSignedUrlRequest("conv:file1", fetcher);
    const b = dedupeSignedUrlRequest("conv:file1", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    d.resolve("https://signed/file1");
    await expect(a).resolves.toBe("https://signed/file1");
    await expect(b).resolves.toBe("https://signed/file1");
  });

  it("does not dedupe across different keys", () => {
    const fetcher = vi.fn(() => Promise.resolve("x"));
    dedupeSignedUrlRequest("conv:fileA", fetcher);
    dedupeSignedUrlRequest("conv:fileB", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the in-flight request settles", async () => {
    const fetcher = vi.fn(() => Promise.resolve("first"));
    await dedupeSignedUrlRequest("conv:file2", fetcher);
    // Slot cleared after settle → a later call runs the fetcher again.
    await dedupeSignedUrlRequest("conv:file2", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never dedupes when the key is empty (no stable identity)", () => {
    const fetcher = vi.fn(() => Promise.resolve("x"));
    dedupeSignedUrlRequest("", fetcher);
    dedupeSignedUrlRequest("", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clears the slot on rejection so a retry can fetch again", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(dedupeSignedUrlRequest("conv:file3", failing)).rejects.toThrow(
      "boom",
    );
    const ok = vi.fn(() => Promise.resolve("recovered"));
    await expect(dedupeSignedUrlRequest("conv:file3", ok)).resolves.toBe(
      "recovered",
    );
    expect(failing).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe("Cloud attachment URL routing", () => {
  it("refreshes a Cloud attachment through the Cloud access endpoint", async () => {
    const getAccess = vi.spyOn(cloudApi, "getFileAccess").mockResolvedValue({
      itemId: "item-1",
      url: "https://objects.example.com/item-1?signature=fresh",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      fileName: "item-1.txt",
      contentType: "text/plain",
      sizeBytes: 4,
    });
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("cloud-conversation", {
        id: "item-1",
        objectKey: "cloud:user-1:item-1",
        type: FileType.DOCUMENT,
        url: "https://objects.example.com/item-1?signature=expired",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.resolveUrl(true);
    });

    expect(resolved).toContain("signature=fresh");
    expect(getAccess).toHaveBeenCalledWith("user-1", "item-1", undefined);
  });
});
