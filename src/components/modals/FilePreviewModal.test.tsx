import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewTarget } from "../../hooks/useFilePreview";
import {
  FilePreviewModal,
  type FilePreviewModalProps,
} from "./FilePreviewModal";

vi.mock("../preview", () => ({
  FileTypeIcon: ({ fileName }: { fileName?: string }) => (
    <span>{fileName}</span>
  ),
  TextPreview: () => <div data-testid="text-preview" />,
  CsvPreview: () => <div data-testid="csv-preview" />,
  PdfPreview: () => <div data-testid="pdf-preview" />,
  ExcelPreview: ({ url }: { url: string }) => (
    <div data-testid="excel-preview" data-url={url} />
  ),
  WordPreview: () => <div data-testid="word-preview" />,
  DocumentPreview: () => <div data-testid="document-preview" />,
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
  useAuthStore: (
    selector: (state: { user: { id: string } }) => unknown,
  ): unknown => selector({ user: { id: "user-1" } }),
}));

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const signedUrl =
  "https://chat.hacomholdings.com.vn/files/bcc.xlsx?signature=valid";

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
  secureUrl: signedUrl,
  isLoadingUrl: false,
  urlError: null,
  hasPrev: false,
  hasNext: false,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRefreshUrl: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  downloadState.canOpenLocally = false;
  downloadState.canDownloadToLocal = false;
  downloadState.saveLocal.mockResolvedValue(true);
  downloadState.downloadToLocal.mockResolvedValue(true);
  downloadState.downloadResourceWithName.mockResolvedValue(undefined);
  downloadState.fetchResourceBlob.mockResolvedValue(new Blob(["file"]));
});

afterEach(cleanup);

describe("FilePreviewModal spreadsheet preview", () => {
  it("keeps a signed spreadsheet URL inside the app renderer", () => {
    render(<FilePreviewModal {...props()} />);

    expect(screen.getByTestId("excel-preview").getAttribute("data-url")).toBe(
      signedUrl,
    );
    expect(
      screen.getByRole("button", { name: "Ch\u1ecdn m\u1ee9c thu ph\u00f3ng" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Xem to\u00e0n m\u00e0n h\u00ecnh" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u0110\u00f3ng" })).toBeTruthy();
    expect(screen.queryByTestId("office-preview")).toBeNull();
  });

  it("detects a spreadsheet from MIME without a filename extension", () => {
    render(
      <FilePreviewModal {...props({ current: target("report", XLSX_MIME) })} />,
    );

    expect(screen.getByTestId("excel-preview")).toBeTruthy();
  });

  it("continues to use the internal renderer when navigating to another URL", () => {
    const { rerender } = render(<FilePreviewModal {...props()} />);
    const nextUrl =
      "https://chat.hacomholdings.com.vn/files/new.xlsx?signature=new";

    rerender(
      <FilePreviewModal
        {...props({
          currentIndex: 1,
          secureUrl: nextUrl,
          current: target("new.xlsx"),
        })}
      />,
    );

    expect(screen.getByTestId("excel-preview").getAttribute("data-url")).toBe(
      nextUrl,
    );
    expect(screen.queryByTestId("office-preview")).toBeNull();
  });

  it("does not change the Word renderer", () => {
    render(
      <FilePreviewModal
        {...props({
          current: target(
            "policy.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "document",
          ),
        })}
      />,
    );

    expect(screen.getByTestId("word-preview")).toBeTruthy();
  });

  it("does not render a preview when the server explicitly blocks it", () => {
    const blocked = target();
    blocked.attachment = { ...blocked.attachment, canPreview: false };

    render(<FilePreviewModal {...props({ current: blocked })} />);

    expect(
      screen.getByText(
        "T\u1ec7p ch\u01b0a s\u1eb5n s\u00e0ng \u0111\u1ec3 xem tr\u01b0\u1edbc.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("excel-preview")).toBeNull();
  });
});

describe("FilePreviewModal download flow", () => {
  it("uses the browser download path when running on web", async () => {
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }));

    await waitFor(() => {
      expect(downloadState.downloadResourceWithName).toHaveBeenCalledWith(
        signedUrl,
        "bcc-2026.xlsx",
        expect.objectContaining({
          expectedBytes: 4_282_174,
          totalBytesHint: 4_282_174,
          onProgress: expect.any(Function),
        }),
      );
    });
    expect(downloadState.markDownloaded).toHaveBeenCalledTimes(1);
    expect(downloadState.fetchResourceBlob).not.toHaveBeenCalled();
  });

  it("streams directly to the configured desktop folder without a Blob", async () => {
    downloadState.canDownloadToLocal = true;
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }));

    await waitFor(() => {
      expect(downloadState.downloadToLocal).toHaveBeenCalledWith(
        signedUrl,
        expect.objectContaining({ onProgress: expect.any(Function) }),
      );
    });
    expect(downloadState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(downloadState.saveLocal).not.toHaveBeenCalled();
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(downloadState.markDownloaded).not.toHaveBeenCalled();
  });

  it("saves only through the legacy managed desktop path when streaming is absent", async () => {
    downloadState.canOpenLocally = true;
    render(<FilePreviewModal {...props()} />);

    fireEvent.click(screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }));

    await waitFor(() => {
      expect(downloadState.saveLocal).toHaveBeenCalledTimes(1);
    });
    expect(downloadState.fetchResourceBlob).toHaveBeenCalledWith(
      signedUrl,
      expect.objectContaining({
        expectedBytes: 4_282_174,
        totalBytesHint: 4_282_174,
        onProgress: expect.any(Function),
      }),
    );
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(downloadState.markDownloaded).not.toHaveBeenCalled();
  });

  it("cancels an in-flight direct desktop transfer from the same action button", async () => {
    downloadState.canDownloadToLocal = true;
    let resolveDownload: ((result: boolean) => void) | undefined;
    let downloadSignal: AbortSignal | undefined;
    downloadState.downloadToLocal.mockImplementationOnce(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          downloadSignal = options?.signal;
          resolveDownload = resolve;
        }),
    );

    const view = render(<FilePreviewModal {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }));

    await waitFor(() => {
      expect(downloadState.downloadToLocal).toHaveBeenCalledTimes(1);
    });
    const blocked = target();
    blocked.attachment = { ...blocked.attachment, canDownload: false };
    view.rerender(<FilePreviewModal {...props({ current: blocked })} />);
    const cancelButton = screen.getByRole("button", {
      name: "Đang tải — hủy tải",
    });
    expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cancelButton);
    expect(downloadSignal?.aborted).toBe(true);

    resolveDownload?.(false);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" }),
      ).toBeTruthy();
    });
  });

  it("does not offer download when the server explicitly blocks it", () => {
    const blocked = target();
    blocked.attachment = { ...blocked.attachment, canDownload: false };

    render(<FilePreviewModal {...props({ current: blocked })} />);

    const button = screen.getByRole("button", { name: "T\u1ea3i v\u1ec1" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(downloadState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(downloadState.downloadToLocal).not.toHaveBeenCalled();
  });
});
