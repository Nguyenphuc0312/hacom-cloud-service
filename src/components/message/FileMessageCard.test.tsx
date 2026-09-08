import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../../types";
import type { PreviewType } from "../../utils/formatFileSize";
import { FileMessageCard } from "./FileMessageCard";

const testState = vi.hoisted(() => ({
  localStatus: "not-downloaded" as "unknown" | "not-downloaded" | "downloaded",
  canOpenLocally: false,
  resolveUrl: vi.fn(),
  fetchResourceBlob: vi.fn(),
  downloadResourceWithName: vi.fn(),
  downloadBlobWithName: vi.fn(),
  saveLocal: vi.fn(),
  openLocal: vi.fn(),
  reveal: vi.fn(),
  markDownloaded: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let value = String(options?.defaultValue ?? key);
      for (const [name, replacement] of Object.entries(options ?? {})) {
        if (name !== "defaultValue") {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
      }
      return value;
    },
  }),
}));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: (
    selector: (state: { user: { id: string } }) => unknown,
  ): unknown => selector({ user: { id: "user-1" } }),
}));

vi.mock("../../hooks", () => ({
  useAttachmentDownloadUrl: () => ({
    url: undefined,
    isLoading: false,
    error: null,
    resolveUrl: testState.resolveUrl,
  }),
}));

vi.mock("../../hooks/useInViewport", () => ({
  useInViewport: () => false,
}));

vi.mock("../../hooks/useLocalFile", () => ({
  useLocalFile: () => ({
    status: testState.localStatus,
    canOpenLocally: testState.canOpenLocally,
    openLocal: testState.openLocal,
    reveal: testState.reveal,
    saveLocal: testState.saveLocal,
    markDownloaded: testState.markDownloaded,
  }),
}));

vi.mock("../../utils/downloadFile", () => ({
  canAutoOpenDownloadedFile: (fileName?: string | null) =>
    /\.(?:pdf|rar)$/i.test(fileName ?? ""),
  fetchResourceBlob: testState.fetchResourceBlob,
  downloadResourceWithName: testState.downloadResourceWithName,
  downloadBlobWithName: testState.downloadBlobWithName,
}));

const archive: Attachment = {
  id: "archive-1",
  type: FileType.ARCHIVE,
  fileName: "PC (1).rar",
  fileSize: 7,
  mimeType: "application/vnd.rar",
  objectKey: "attachments/archive-1.rar",
};

const previewableDocument: Attachment = {
  ...archive,
  id: "document-1",
  type: FileType.DOCUMENT,
  fileName: "Bao cao.pdf",
  mimeType: "application/pdf",
  objectKey: "attachments/document-1.pdf",
};

const renderCard = (
  file = archive,
  onPreview?: (attachment: Attachment, previewType: PreviewType) => void,
) =>
  render(
    <FileMessageCard
      conversationId="conversation-1"
      attachment={file}
      isOwn
      onPreview={onPreview}
    />,
  );

describe("FileMessageCard download flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.localStatus = "not-downloaded";
    testState.canOpenLocally = false;
    testState.resolveUrl.mockResolvedValue("https://storage.example/file");
    testState.fetchResourceBlob.mockResolvedValue(new Blob(["file"]));
    testState.downloadResourceWithName.mockResolvedValue(undefined);
    testState.saveLocal.mockResolvedValue(true);
    testState.openLocal.mockResolvedValue({ ok: true });
    testState.reveal.mockResolvedValue({ ok: true });
  });

  it("keeps an opaque file card non-activating and downloads only from its explicit action", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(
      screen.getByRole("button", { name: "Tải PC (1).rar" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );

    await waitFor(() => {
      expect(testState.downloadResourceWithName).toHaveBeenCalledWith(
        "https://storage.example/file",
        "PC (1).rar",
        expect.objectContaining({ expectedBytes: 7, totalBytesHint: 7 }),
      );
    });
    expect(testState.markDownloaded).toHaveBeenCalledTimes(1);
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("shows a recoverable error and retries only after an explicit action", async () => {
    const user = userEvent.setup();
    testState.downloadResourceWithName.mockRejectedValueOnce(
      new TypeError("network failed"),
    );
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tải lỗi · Thử lại",
    );

    await user.click(
      screen.getByRole("button", { name: "Thử tải lại PC (1).rar" }),
    );

    await waitFor(() => {
      expect(testState.downloadResourceWithName).toHaveBeenCalledTimes(2);
    });
    expect(testState.markDownloaded).toHaveBeenCalledTimes(1);
  });

  it("uses card click only for a supported preview and never starts a download", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    renderCard(previewableDocument, onPreview);

    await user.click(
      screen.getByRole("button", { name: "Xem trước Bao cao.pdf" }),
    );

    expect(onPreview).toHaveBeenCalledWith(previewableDocument, "pdf");
    expect(testState.resolveUrl).not.toHaveBeenCalled();
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(testState.saveLocal).not.toHaveBeenCalled();
  });

  it("saves an explicit desktop download without opening the file", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    renderCard(previewableDocument, vi.fn());

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải Bao cao.pdf" }),
    );

    await waitFor(() => {
      expect(testState.saveLocal).toHaveBeenCalledTimes(1);
    });
    expect(testState.fetchResourceBlob).toHaveBeenCalledWith(
      "https://storage.example/file",
      expect.objectContaining({ expectedBytes: 7, totalBytesHint: 7 }),
    );
    expect(testState.openLocal).not.toHaveBeenCalled();
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("downloads then opens a desktop document from its card", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    testState.canOpenLocally = true;
    renderCard(previewableDocument, onPreview);

    await user.click(
      screen.getByRole("button", { name: "Tải và mở Bao cao.pdf" }),
    );

    await waitFor(() => {
      expect(testState.saveLocal).toHaveBeenCalledTimes(1);
      expect(testState.openLocal).toHaveBeenCalledTimes(1);
    });
    expect(onPreview).not.toHaveBeenCalled();
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("keeps untrusted file types download-only on desktop", async () => {
    const user = userEvent.setup();
    const executable: Attachment = {
      ...archive,
      id: "executable-1",
      fileName: "setup.exe",
      mimeType: "application/octet-stream",
      objectKey: "attachments/setup.exe",
    };
    testState.canOpenLocally = true;
    renderCard(executable);

    expect(screen.getByRole("button", { name: "Tải setup.exe" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải setup.exe" }),
    );

    await waitFor(() => {
      expect(testState.saveLocal).toHaveBeenCalledTimes(1);
    });
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("shares one desktop byte transfer across duplicate file cards", async () => {
    testState.canOpenLocally = true;
    let finishDownload: ((blob: Blob) => void) | undefined;
    testState.fetchResourceBlob.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        }),
    );
    renderCard();
    renderCard();

    const downloads = screen.getAllByRole("button", {
      name: "Chỉ tải PC (1).rar",
    });
    fireEvent.click(downloads[0]);
    fireEvent.click(downloads[1]);

    await waitFor(() => {
      expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      finishDownload?.(new Blob(["archive"]));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(testState.saveLocal).toHaveBeenCalledTimes(2);
    });
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("falls back to the browser only when desktop save fails", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.saveLocal.mockResolvedValue(false);
    const blob = new Blob(["file"]);
    testState.fetchResourceBlob.mockResolvedValue(blob);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );

    await waitFor(() => {
      expect(testState.downloadBlobWithName).toHaveBeenCalledWith(
        blob,
        "PC (1).rar",
      );
    });
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("opens a saved desktop document from its card and keeps reveal explicit", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    renderCard(previewableDocument, onPreview);

    const openActions = screen.getAllByRole("button", {
      name: "Mở Bao cao.pdf",
    });
    expect(openActions).toHaveLength(2);
    await user.click(openActions[0]);
    await user.click(
      screen.getByRole("button", {
        name: "Mở thư mục chứa Bao cao.pdf",
      }),
    );

    expect(onPreview).not.toHaveBeenCalled();
    expect(testState.openLocal).toHaveBeenCalledTimes(1);
    expect(testState.reveal).toHaveBeenCalledTimes(1);
    expect(testState.resolveUrl).not.toHaveBeenCalled();
  });
});
