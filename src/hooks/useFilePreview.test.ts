import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFilePreview, clearPreviewUrlCache, type PreviewTarget } from "./useFilePreview";
import { fileApi } from "../services/api";

vi.mock("../services/api", () => ({
  fileApi: {
    getDownloadUrl: vi.fn(),
  },
}));

vi.mock("../config", () => ({
  resolvePublicResourceUrl: vi.fn((url: string | null | undefined) => url ?? null),
}));

describe("useFilePreview", () => {
  const mockTarget1: PreviewTarget = {
    attachment: {
      id: "att-1",
      fileName: "test1.pdf",
      mimeType: "application/pdf",
      objectKey: "obj-key-1",
    },
    conversationId: "conv-1",
    previewType: "pdf",
  };

  const mockTarget2: PreviewTarget = {
    attachment: {
      id: "att-2",
      fileName: "test2.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      objectKey: "obj-key-2",
    },
    conversationId: "conv-1",
    previewType: "document",
  };

  const mockTarget3: PreviewTarget = {
    attachment: {
      id: "att-3",
      fileName: "test3.png",
      mimeType: "image/png",
      objectKey: "obj-key-3",
    },
    conversationId: "conv-1",
    previewType: "image",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPreviewUrlCache();
  });

  it("initializes with closed state", () => {
    const { result } = renderHook(() => useFilePreview());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.current).toBeNull();
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.secureUrl).toBeNull();
    expect(result.current.isLoadingUrl).toBe(false);
    expect(result.current.urlError).toBeNull();
  });

  it("opens gallery and fetches download URL for active item", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://signed.storage.com/test1.pdf",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    } as never);

    const { result } = renderHook(() => useFilePreview());

    act(() => {
      result.current.open(mockTarget1, [mockTarget1, mockTarget2]);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.totalItems).toBe(2);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoadingUrl).toBe(false);
      expect(result.current.secureUrl).toBe("https://signed.storage.com/test1.pdf");
    });
  });

  it("resolves from cache on subsequent view without staying in loading state", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://signed.storage.com/cached-file.pdf",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    } as never);

    const { result } = renderHook(() => useFilePreview());

    act(() => {
      result.current.open(mockTarget1, [mockTarget1]);
    });

    await waitFor(() => {
      expect(result.current.secureUrl).toBe("https://signed.storage.com/cached-file.pdf");
      expect(result.current.isLoadingUrl).toBe(false);
    });

    // Close and reopen same item
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.open(mockTarget1, [mockTarget1]);
    });

    // Cache hit: immediately resolved and isLoadingUrl is FALSE
    await waitFor(() => {
      expect(result.current.secureUrl).toBe("https://signed.storage.com/cached-file.pdf");
      expect(result.current.isLoadingUrl).toBe(false);
    });
    // API was only called once
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("handles fast switching (< >) without getting stuck in isLoadingUrl state", async () => {
    let resolveAtt3: ((value: unknown) => void) | null = null;

    vi.mocked(fileApi.getDownloadUrl).mockImplementation((params) => {
      if (params.attachmentId === "att-1") {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                data: { url: "https://signed/1", expiresAt: new Date(Date.now() + 600000).toISOString() },
              } as never),
            100,
          );
        });
      }
      if (params.attachmentId === "att-2") {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                data: { url: "https://signed/2", expiresAt: new Date(Date.now() + 600000).toISOString() },
              } as never),
            100,
          );
        });
      }
      if (params.attachmentId === "att-3") {
        return new Promise((resolve) => {
          resolveAtt3 = resolve;
        });
      }
      return Promise.reject(new Error("unknown"));
    });

    const { result } = renderHook(() => useFilePreview());

    act(() => {
      result.current.open(mockTarget1, [mockTarget1, mockTarget2, mockTarget3]);
    });

    // Rapidly switch 0 -> 1 -> 2 -> 1 -> 2
    act(() => {
      result.current.next(); // to index 1 (mockTarget2)
    });
    act(() => {
      result.current.next(); // to index 2 (mockTarget3)
    });
    act(() => {
      result.current.prev(); // to index 1 (mockTarget2)
    });
    act(() => {
      result.current.next(); // to index 2 (mockTarget3)
    });

    expect(result.current.currentIndex).toBe(2);
    expect(result.current.current?.attachment.id).toBe("att-3");

    // Resolve att-3 now
    act(() => {
      if (resolveAtt3) {
        resolveAtt3({
          success: true,
          data: { url: "https://signed/3", expiresAt: new Date(Date.now() + 600000).toISOString() },
        });
      }
    });

    await waitFor(() => {
      expect(result.current.isLoadingUrl).toBe(false);
      expect(result.current.secureUrl).toBe("https://signed/3");
    });
  });

  it("handles error during URL fetch cleanly without remaining in loading state", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockRejectedValueOnce(
      new Error("Network error or 429 rate limit"),
    );

    const { result } = renderHook(() => useFilePreview());

    act(() => {
      result.current.open(mockTarget1, [mockTarget1]);
    });

    await waitFor(() => {
      expect(result.current.isLoadingUrl).toBe(false);
      expect(result.current.urlError).toBe("Network error or 429 rate limit");
    });
  });

  it("bypasses an inline URL only for the item being manually refreshed", async () => {
    const inlineTarget: PreviewTarget = {
      ...mockTarget2,
      attachment: {
        ...mockTarget2.attachment,
        downloadUrl: "https://signed/inline.docx",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    };
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValue({
      success: true,
      data: {
        url: "https://signed/refreshed.pdf",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    } as never);

    const { result } = renderHook(() => useFilePreview());
    act(() => result.current.open(mockTarget1, [mockTarget1, inlineTarget]));
    await waitFor(() =>
      expect(result.current.secureUrl).toBe("https://signed/refreshed.pdf"),
    );

    await act(async () => result.current.refreshUrl());
    await waitFor(() => expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2));

    act(() => result.current.next());
    await waitFor(() =>
      expect(result.current.secureUrl).toBe("https://signed/inline.docx"),
    );
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2);
  });
});
