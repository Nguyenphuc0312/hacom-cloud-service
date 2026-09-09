import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewTarget } from "../../hooks/useFilePreview";
import { FilePreviewModal, type FilePreviewModalProps } from "./FilePreviewModal";

const resolverState = vi.hoisted(() => ({
  resolveUrl: vi.fn(),
}));

vi.mock("../../hooks/useAttachmentDownloadUrl", () => ({
  useAttachmentDownloadUrl: () => ({ resolveUrl: resolverState.resolveUrl }),
}));

vi.mock("../preview", () => ({
  FileTypeIcon: ({ fileName }: { fileName?: string }) => <span>{fileName}</span>,
  TextPreview: () => <div data-testid="text-preview" />,
  CsvPreview: () => <div data-testid="csv-preview" />,
  PdfJsViewer: ({ url, fileName }: { url: string; fileName: string }) => (
    <div data-testid="pdf-viewer" data-url={url} data-file-name={fileName} />
  ),
  DocumentPreview: ({
    fileName,
    canDownload,
    onDownload,
  }: {
    fileName: string;
    canDownload?: boolean;
    onDownload?: () => void;
  }) => (
    <section data-testid="document-preview" data-can-download={String(Boolean(canDownload))}>
      <span>{fileName}</span>
      {onDownload && (
        <button type="button" onClick={onDownload} disabled={!canDownload}>
          Tải bản gốc
        </button>
      )}
    </section>
  ),
  ArchivePreview: () => <div data-testid="archive-preview" />,
}));

vi.mock("../common/SafeImage", () => ({
  SafeImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

const downloadState = vi.hoisted(() => ({
  canOpenLocally: false,
  canDownloadToLocal: false,
  saveLocal: vi.fn(),
  downloadToLocal: vi.fn(),
  markDownloaded: vi.fn(),
  downloadResourceWithName: vi.fn(),
  fetchResourceBlob: vi.fn(),
  downloadBlobWithName: vi.fn(),
}));

vi.mock("../../utils/downloadFile", () => ({
  downloadResourceWithName: downloadState.downloadResourceWithName,
  fetchResourceBlob: downloadState.fetchResourceBlob,
  downloadBlobWithName: downloadState.downloadBlobWithName,
}));

vi.mock("../../hooks/useLocalFile", () => ({
  useLocalFile: () => ({
    canOpenLocally: downloadState.canOpenLocally,
    canDownloadToLocal: downloadState.canDownloadToLocal,
    saveLocal: downloadState.saveLocal,
    downloadToLocal: downloadState.downloadToLocal,
    markDownloaded: downloadState.markDownloaded,
  }),
}));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown): unknown =>
    selector({ user: { id: "user-1" } }),
}));

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const viewUrl = "https://chat.hacomholdings.com.vn/files/bcc.xlsx?signature=view";
const downloadUrl = "https://chat.hacomholdings.com.vn/files/bcc.xlsx?signature=download";

const target = (
  fileName = "bcc-2026.xlsx",
  mimeType = XLSX_MIME,
  previewType: PreviewTarget["previewType"] = "spreadsheet",
): PreviewTarget => ({
  attachment: {
    id: "attachment-" + fileName,
    fileName,
    mimeType,
    fileSize: 4_282_174,
  },
  conversationId: "cloud-conversation",
  previewType,
  uploaderName: "Test User",
});

const props = (
  overrides: Partial<FilePreviewModalProps> = {},
): FilePreviewModalProps => ({
  isOpen: true,
  onClose: vi.fn(),
  current: target(),
  currentIndex: 0,
  totalItems: 1,
  secureUrl: viewUrl,
  isLoadingUrl: false,
  urlError: null,
  hasPrev: false,
  hasNext: false,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRefreshUrl: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  resolverState.resolveUrl.mockResolvedValue(downloadUrl);
  downloadState.canOpenLocally = false;
  downloadState.canDownloadToLocal = false;
  downloadState.saveLocal.mockResolvedValue(true);
  downloadState.downloadToLocal.mockResolvedValue(true);
  downloadState.downloadResourceWithName.mockResolvedValue(undefined);
  downloadState.fetchResourceBlob.mockResolvedValue(new Blob(["file"]));
});

afterEach(cleanup);

describe("FilePreviewModal Phase 3 routing", () => {
  it("uses the safe Office fallback without a view URL or Office/zoom renderer", () => {
    render(<FilePreviewModal {...props({ secureUrl: null })} />);

    expect(screen.getByTestId("document-preview").getAttribute("data-can-download")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Tải bản gốc" })).toBeTruthy();
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
    expect(screen.queryByLabelText("Chọn mức thu phóng")).toBeNull();
    expect(screen.queryByLabelText("Xem toàn màn hình")).toBeNull();
  });

  it("routes PDFs to the lazy in-app PdfJsViewer with the view-only source", () => {
    render(
      <FilePreviewModal
        {...props({
          current: target("report.pdf", "application/pdf", "pdf"),
          secureUrl: viewUrl,
        })}
      />,
    );

    expect(screen.getByTestId("pdf-viewer").getAttribute("data-url")).toBe(viewUrl);
    expect(screen.getByTestId("pdf-viewer").getAttribute("data-file-name")).toBe("report.pdf");
    expect(screen.getByLabelText("Chọn mức thu phóng")).toBeTruthy();
  });
});

describe("FilePreviewModal original download flow", () => {
  it("resolves a distinct original-download URL instead of reusing the viewer source", async () => {
    render(
      <FilePreviewModal
        {...props({
          current: target("report.pdf", "application/pdf", "pdf"),
          secureUrl: viewUrl,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));

    await waitFor(() => {
      expect(resolverState.resolveUrl).toHaveBeenCalledWith(
        true,
        expect.any(AbortSignal),
      );
      expect(downloadState.downloadResourceWithName).toHaveBeenCalledWith(
        downloadUrl,
        "report.pdf",
        expect.objectContaining({
          expectedBytes: 4_282_174,
          totalBytesHint: 4_282_174,
          onProgress: expect.any(Function),
        }),
      );
    });
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalledWith(
      viewUrl,
      expect.anything(),
      expect.anything(),
    );
    expect(downloadState.markDownloaded).not.toHaveBeenCalled();
  });

  it("uses the same original resolver when the Office fallback action is chosen", async () => {
    render(<FilePreviewModal {...props({ secureUrl: null })} />);

    fireEvent.click(screen.getByRole("button", { name: "Tải bản gốc" }));

    await waitFor(() => {
      expect(resolverState.resolveUrl).toHaveBeenCalledWith(
        true,
        expect.any(AbortSignal),
      );
      expect(downloadState.downloadResourceWithName).toHaveBeenCalledWith(
        downloadUrl,
        "bcc-2026.xlsx",
        expect.any(Object),
      );
    });
  });

  it("streams the original URL to the configured desktop folder without a Blob", async () => {
    downloadState.canDownloadToLocal = true;
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));

    await waitFor(() => {
      expect(downloadState.downloadToLocal).toHaveBeenCalledWith(
        downloadUrl,
        expect.objectContaining({ onProgress: expect.any(Function) }),
      );
    });
    expect(downloadState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(downloadState.saveLocal).not.toHaveBeenCalled();
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("uses the legacy managed desktop path only when direct native streaming is unavailable", async () => {
    downloadState.canOpenLocally = true;
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));

    await waitFor(() => {
      expect(downloadState.fetchResourceBlob).toHaveBeenCalledWith(
        downloadUrl,
        expect.objectContaining({
          expectedBytes: 4_282_174,
          totalBytesHint: 4_282_174,
          onProgress: expect.any(Function),
        }),
      );
      expect(downloadState.saveLocal).toHaveBeenCalledTimes(1);
    });
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("cancels an in-flight native transfer from the same action button", async () => {
    const transfer = deferred<boolean>();
    downloadState.canDownloadToLocal = true;
    downloadState.downloadToLocal.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) => {
        options.signal.addEventListener("abort", () => transfer.resolve(false), { once: true });
        return transfer.promise;
      },
    );
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));
    await waitFor(() => expect(downloadState.downloadToLocal).toHaveBeenCalledTimes(1));

    const [, options] = downloadState.downloadToLocal.mock.calls[0] as [
      string,
      { signal: AbortSignal },
    ];
    fireEvent.click(screen.getByRole("button", { name: "Đang tải — hủy tải" }));

    expect(options.signal.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tải về" })).toBeTruthy(),
    );
  });

  it("does not start a transfer when no original descriptor is available", async () => {
    resolverState.resolveUrl.mockResolvedValueOnce(undefined);
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "Tải về" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Thử tải lại" })).toBeTruthy(),
    );
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("disables both Office fallback and footer download when the server blocks download", () => {
    const blocked = target();
    blocked.attachment = { ...blocked.attachment, canDownload: false };
    render(<FilePreviewModal {...props({ current: blocked, secureUrl: null })} />);

    expect(screen.getByRole("button", { name: "Tải bản gốc" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Tải về" }).hasAttribute("disabled")).toBe(true);
  });
});
