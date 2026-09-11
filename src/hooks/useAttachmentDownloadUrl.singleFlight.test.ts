import { afterEach, describe, it, expect, vi } from "vitest";
import type { Attachment } from "../types";
import {
  buildAttachmentResolverCacheKey,
  dedupeSignedUrlRequest,
} from "./useAttachmentDownloadUrl";

afterEach(() => {
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

describe("buildAttachmentResolverCacheKey", () => {
  const attachment: Attachment = {
    id: "att-1",
    objectKey: "conv-a/report.pdf",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    fileSize: 1_024,
  } as Attachment;

  const keyFor = (
    overrides: Partial<{
      accountId: string;
      conversationId: string;
      purpose: "download" | "view" | "preview";
      variant: string;
      attachment: Attachment;
    }> = {},
  ) =>
    buildAttachmentResolverCacheKey({
      accountId: "account-a",
      conversationId: "conv-a",
      purpose: "view",
      variant: "original-view",
      attachment,
      ...overrides,
    });

  it("partitions a signed source by account, context, purpose, variant, and version fields", () => {
    const base = keyFor();
    expect(base).not.toBe(keyFor({ accountId: "account-b" }));
    expect(base).not.toBe(keyFor({ conversationId: "conv-b" }));
    expect(base).not.toBe(keyFor({ purpose: "download", variant: "original" }));
    expect(base).not.toBe(keyFor({ variant: "preview" }));
    expect(base).not.toBe(
      keyFor({
        attachment: { ...attachment, checksum: "new-content" } as Attachment,
      }),
    );
  });

  it("does not produce a cache key without both source identity and access context", () => {
    expect(keyFor({ conversationId: "" })).toBe("");
    expect(
      keyFor({
        attachment: { ...attachment, id: "", objectKey: "" } as Attachment,
      }),
    ).toBe("");
  });
});
