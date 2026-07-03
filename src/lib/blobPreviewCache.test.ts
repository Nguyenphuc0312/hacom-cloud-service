import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobPreviewCache } from "./blobPreviewCache";

describe("blobPreviewCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
      revokeObjectURL: vi.fn(),
    });
    blobPreviewCache.clear();
  });

  afterEach(() => {
    blobPreviewCache.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("revokes object URLs when entries expire", () => {
    blobPreviewCache.set("file-1", "blob:file-1", 1000);

    expect(blobPreviewCache.get("file-1")).toBe("blob:file-1");

    vi.advanceTimersByTime(1000);

    expect(blobPreviewCache.get("file-1")).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file-1");
  });

  it("bounds the cache and revokes the oldest entry", () => {
    for (let index = 0; index < 33; index += 1) {
      blobPreviewCache.set(`file-${index}`, `blob:file-${index}`, 60_000);
    }

    expect(blobPreviewCache.size()).toBe(32);
    expect(blobPreviewCache.get("file-0")).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file-0");
  });
});
