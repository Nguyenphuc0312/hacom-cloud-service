import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const batchThumbnailUrls = vi.fn();

vi.mock("../services/api", () => ({
  fileApi: {
    batchThumbnailUrls: (...args: unknown[]) => batchThumbnailUrls(...args),
  },
}));
vi.mock("../lib/apiContract", () => ({
  unwrapApiSuccess: (r: unknown) => r,
}));
vi.mock("../config", () => ({
  resolvePublicResourceUrl: (u: string | null) => u,
}));
vi.mock("../utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  useBatchThumbnailUrl,
  markPreviewReady,
} from "./useBatchThumbnailUrl";

const processingItem = (fileId: string) => ({
  fileId,
  url: null,
  expiresAt: null,
  status: "processing",
  isRetryable: true,
  retryAfterMs: 5000,
  cacheTtlMs: 5000,
});

const readyItem = (fileId: string) => ({
  fileId,
  url: `https://signed/${fileId}.jpg`,
  expiresAt: null,
  status: "ready",
  variant: "thumbnail",
  isRetryable: false,
  retryAfterMs: null,
  cacheTtlMs: 300000,
});

describe("useBatchThumbnailUrl preview signal", () => {
  beforeEach(() => {
    batchThumbnailUrls.mockReset();
  });

  it("refetches and resolves to ready when markPreviewReady fires", async () => {
    // Unique id per test run to avoid the module-level TTL cache bleeding across tests.
    const fileId = `file-${Math.random().toString(36).slice(2)}`;
    batchThumbnailUrls.mockResolvedValueOnce({ items: [processingItem(fileId)] });

    const { result } = renderHook(() =>
      useBatchThumbnailUrl("conv-1", [fileId], { autoFetch: true }),
    );

    await waitFor(() => {
      expect(result.current.urls[fileId]?.status).toBe("processing");
    });
    expect(batchThumbnailUrls).toHaveBeenCalledTimes(1);

    // Simulate the WS preview_ready event arriving: next fetch returns READY.
    batchThumbnailUrls.mockResolvedValueOnce({ items: [readyItem(fileId)] });
    await act(async () => {
      markPreviewReady(fileId);
    });

    await waitFor(() => {
      expect(result.current.urls[fileId]?.status).toBe("ready");
      expect(result.current.urls[fileId]?.url).toContain(fileId);
    });
    // One initial fetch + one signal-triggered fetch.
    expect(batchThumbnailUrls).toHaveBeenCalledTimes(2);
  });

  it("markPreviewReady is a no-op for empty fileId", () => {
    expect(() => markPreviewReady("")).not.toThrow();
  });
});
