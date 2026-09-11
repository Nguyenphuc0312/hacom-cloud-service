import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPreviewUrlCache,
  type PreviewTarget,
  useFilePreview,
} from "./useFilePreview";
import { fileApi } from "../services/api";
import { runRegisteredStoreResets } from "../stores/storeResetRegistry";

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

const pdfTarget: PreviewTarget = {
  attachment: {
    id: "att-pdf",
    objectKey: "conv-a/att-pdf.pdf",
    fileName: "report.pdf",
    mimeType: "application/pdf",
  },
  conversationId: "conv-a",
  previewType: "pdf",
};

const imageTarget: PreviewTarget = {
  attachment: {
    id: "att-image",
    objectKey: "conv-a/att-image.png",
    fileName: "photo.png",
    mimeType: "image/png",
  },
  conversationId: "conv-a",
  previewType: "image",
};

const officeTarget: PreviewTarget = {
  attachment: {
    id: "att-office",
    objectKey: "conv-a/att-office.docx",
    fileName: "plan.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  conversationId: "conv-a",
  previewType: "document",
};

beforeEach(() => {
  vi.clearAllMocks();
  clearPreviewUrlCache();
});

describe("useFilePreview", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useFilePreview());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.current).toBeNull();
    expect(result.current.secureUrl).toBeNull();
  });

  it("uses a view descriptor for an in-app PDF renderer", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: { url: "https://signed.example/view.pdf", expiresAt: expiresAt() },
    } as never);

    const { result } = renderHook(() => useFilePreview());
    act(() => result.current.open(pdfTarget));

    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/view.pdf"));
    expect(fileApi.getDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: "att-pdf", mode: "view" }),
    );
  });

  it("uses the image-preview endpoint instead of a download descriptor", async () => {
    vi.mocked(fileApi.getPreviewUrl).mockResolvedValueOnce({
      success: true,
      data: { url: "https://signed.example/preview.png", expiresAt: expiresAt(), variant: "preview" },
    } as never);

    const { result } = renderHook(() => useFilePreview());
    act(() => result.current.open(imageTarget));

    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/preview.png"));
    expect(fileApi.getPreviewUrl).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: "att-image" }),
    );
    expect(fileApi.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not issue a signed view URL for Office fallback", async () => {
    const { result } = renderHook(() => useFilePreview());
    act(() => result.current.open(officeTarget));

    await waitFor(() => expect(result.current.isLoadingUrl).toBe(false));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.secureUrl).toBeNull();
    expect(result.current.urlError).toBeNull();
    expect(fileApi.getDownloadUrl).not.toHaveBeenCalled();
    expect(fileApi.getPreviewUrl).not.toHaveBeenCalled();
  });

  it("caches a view source only within the same scoped target", async () => {
    vi.mocked(fileApi.getDownloadUrl).mockResolvedValueOnce({
      success: true,
      data: { url: "https://signed.example/cached.pdf", expiresAt: expiresAt() },
    } as never);
    const { result } = renderHook(() => useFilePreview());

    act(() => result.current.open(pdfTarget));
    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/cached.pdf"));
    act(() => result.current.close());
    act(() => result.current.open(pdfTarget));
    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/cached.pdf"));
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("clears cached view sources through the registered logout resetters", async () => {
    vi.mocked(fileApi.getDownloadUrl)
      .mockResolvedValueOnce({
        success: true,
        data: { url: "https://signed.example/first-view.pdf", expiresAt: expiresAt() },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: { url: "https://signed.example/second-view.pdf", expiresAt: expiresAt() },
      } as never);
    const { result } = renderHook(() => useFilePreview());

    act(() => result.current.open(pdfTarget));
    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/first-view.pdf"));
    await act(async () => {
      await runRegisteredStoreResets();
    });
    act(() => result.current.close());
    act(() => result.current.open(pdfTarget));

    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/second-view.pdf"));
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("reissues a source exactly once after an authorization retry", async () => {
    vi.mocked(fileApi.getDownloadUrl)
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({
        success: true,
        data: { url: "https://signed.example/refreshed.pdf", expiresAt: expiresAt() },
      } as never);
    const { result } = renderHook(() => useFilePreview());

    act(() => result.current.open(pdfTarget));
    await waitFor(() => expect(result.current.secureUrl).toBe("https://signed.example/refreshed.pdf"));
    expect(fileApi.getDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("never falls back to a stale attachment URL after an authorized request fails", async () => {
    const rawDetail = "https://storage.example/file.pdf?signature=not-for-ui";
    vi.mocked(fileApi.getDownloadUrl).mockRejectedValueOnce(new Error(rawDetail));
    const target: PreviewTarget = {
      ...pdfTarget,
      attachment: { ...pdfTarget.attachment, url: "https://stale.example/file.pdf" },
    };
    const { result } = renderHook(() => useFilePreview());

    act(() => result.current.open(target));
    await waitFor(() => expect(result.current.isLoadingUrl).toBe(false));
    expect(result.current.secureUrl).toBeNull();
    expect(result.current.urlError).toBe("Không thể lấy liên kết xem file.");
    expect(result.current.urlError).not.toContain(rawDetail);
  });

  it("does not open a server-blocked preview", () => {
    const blocked: PreviewTarget = {
      ...pdfTarget,
      attachment: { ...pdfTarget.attachment, canPreview: false },
    };
    const { result } = renderHook(() => useFilePreview());
    act(() => result.current.open(blocked));

    expect(result.current.isOpen).toBe(false);
    expect(fileApi.getDownloadUrl).not.toHaveBeenCalled();
  });
});
