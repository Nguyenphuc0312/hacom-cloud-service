import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "../types";
import { fileApi } from "../services/api";
import { runRegisteredStoreResets } from "../stores/storeResetRegistry";
import {
  clearAttachmentDownloadUrlCache,
  useAttachmentDownloadUrl,
} from "./useAttachmentDownloadUrl";

vi.mock("../services/api", () => ({
  fileApi: {
    getDownloadUrl: vi.fn(),
    getPreviewUrl: vi.fn(),
  },
}));

vi.mock("../config", () => ({
  resolvePublicResourceUrl: vi.fn((url: string | null | undefined) => url ?? null),
}));

vi.mock("../stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown): unknown =>
    selector({ user: { id: "account-a" } }),
}));

const expiresAt = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();

const attachment: Attachment = {
  id: "att-original",
  objectKey: "conv-a/att-original.pdf",
  fileName: "report.pdf",
  mimeType: "application/pdf",
  fileSize: 1_024,
} as Attachment;

beforeEach(() => {
  vi.clearAllMocks();
  clearAttachmentDownloadUrlCache();
});

describe("useAttachmentDownloadUrl", () => {
  it("requests the original descriptor without mode=view and never reuses a viewer URL", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://signed.example/download.pdf",
        expiresAt: expiresAt(),
      },
    } as never);
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment),
    );

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.resolveUrl(true);
    });

    expect(resolved).toBe("https://signed.example/download.pdf");
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fileApi.getDownloadUrl).mock.calls[0][0] as Record<string, unknown>;
    expect(request.conversationId).toBe("conv-a");
    expect(request.attachmentId).toBe("att-original");
    expect(request.objectKey).toBe("conv-a/att-original.pdf");
    expect(request.mode).toBeUndefined();
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves explicit view and image-preview intents without using an original download URL", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://signed.example/inline-audio",
        expiresAt: expiresAt(),
      },
    } as never);
    vi.mocked(fileApi.getPreviewUrl).mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://signed.example/image-preview",
        expiresAt: expiresAt(),
        variant: "preview",
      },
    } as never);

    const { result: view } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment, { intent: "view" }),
    );
    const { result: preview } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment, { intent: "preview" }),
    );

    await act(async () => {
      expect(await view.current.resolveUrl(true)).toBe(
        "https://signed.example/inline-audio",
      );
      expect(await preview.current.resolveUrl(true)).toBe(
        "https://signed.example/image-preview",
      );
    });

    expect(fileApi.getDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-a",
        attachmentId: "att-original",
        mode: "view",
      }),
    );
    expect(fileApi.getPreviewUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-a",
        attachmentId: "att-original",
      }),
    );
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("clears cached original sources through the registered logout resetters", async () => {
    vi.mocked(fileApi.getDownloadUrl)
      .mockResolvedValueOnce({
        success: true,
        data: {
          url: "https://signed.example/first-download.pdf",
          expiresAt: expiresAt(),
        },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: {
          url: "https://signed.example/second-download.pdf",
          expiresAt: expiresAt(),
        },
      } as never);
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment),
    );

    let first: string | undefined;
    await act(async () => {
      first = await result.current.resolveUrl();
    });
    await act(async () => {
      await runRegisteredStoreResets();
    });

    let second: string | undefined;
    await act(async () => {
      second = await result.current.resolveUrl();
    });

    expect(first).toBe("https://signed.example/first-download.pdf");
    expect(second).toBe("https://signed.example/second-download.pdf");
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("reissues an original descriptor at most once after authorization refresh", async () => {
    vi.mocked(fileApi.getDownloadUrl)
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          url: "https://signed.example/reissued.pdf",
          expiresAt: expiresAt(),
        },
      } as never);
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment),
    );

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.resolveUrl(true);
    });

    expect(resolved).toBe("https://signed.example/reissued.pdf");
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to a stale attachment URL when the authorized request fails", async () => {
    const rawDetail = "https://storage.example/report.pdf?signature=not-for-ui";
    vi.mocked(fileApi.getDownloadUrl).mockRejectedValueOnce(new Error(rawDetail));
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", {
        ...attachment,
        url: "https://stale.example/report.pdf",
      }),
    );

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.resolveUrl(true);
    });

    expect(resolved).toBeUndefined();
    await waitFor(() =>
      expect(result.current.error).toBe("Không thể lấy liên kết tải file."),
    );
    expect(result.current.error).not.toContain(rawDetail);
    expect(result.current.url).toBeUndefined();
  });

  it("propagates caller cancellation without leaving a failed download state", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockImplementationOnce(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }) as never,
    );
    const { result } = renderHook(() =>
      useAttachmentDownloadUrl("conv-a", attachment),
    );
    const controller = new AbortController();
    let resolved: string | undefined;

    await act(async () => {
      const pending = result.current.resolveUrl(true, controller.signal);
      controller.abort();
      resolved = await pending;
    });

    expect(resolved).toBeUndefined();
    expect(result.current.error).toBeNull();
  });
});
