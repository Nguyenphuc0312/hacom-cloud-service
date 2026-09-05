import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../../types";
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
          value = value.replaceAll("{{" + name + "}}", String(replacement));
        }
      }
      return value;
    },
  }),
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
  canAutoOpenDownloadedFile: (fileName?: string) =>
    Boolean(fileName && !/\.(?:exe|bat|cmd)$/i.test(fileName)),
  fetchResourceBlob: testState.fetchResourceBlob,
  downloadResourceWithName: testState.downloadResourceWithName,
  downloadBlobWithName: testState.downloadBlobWithName,
}));

const MB = 1024 * 1024;
const attachment: Attachment = {
  id: "archive-1",
  type: FileType.ARCHIVE,
  fileName: "PC (1).rar",
  fileSize: 7,
  mimeType: "application/vnd.rar",
  objectKey: "attachments/archive-1.rar",
};

const renderCard = (file = attachment) =>
  render(
    <FileMessageCard conversationId="conversation-1" attachment={file} isOwn />,
  );

describe("FileMessageCard download-only files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.localStatus = "not-downloaded";
    testState.canOpenLocally = false;
    testState.resolveUrl.mockResolvedValue(
      "https://storage.example/archive-1.rar",
    );
    testState.fetchResourceBlob.mockResolvedValue(new Blob(["archive"]));
    testState.downloadResourceWithName.mockResolvedValue(undefined);
    testState.saveLocal.mockResolvedValue(true);
    testState.openLocal.mockResolvedValue({ ok: true });
    testState.reveal.mockResolvedValue({ ok: true });
  });

  it("makes an archive card clickable and starts one browser download", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByText("Tải về")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tải PC (1).rar" }));

    await waitFor(() => {
      expect(testState.downloadResourceWithName).toHaveBeenCalledTimes(1);
    });
    expect(testState.downloadResourceWithName).toHaveBeenCalledWith(
      "https://storage.example/archive-1.rar",
      "PC (1).rar",
      expect.objectContaining({ expectedBytes: 7, totalBytesHint: 7 }),
    );
    expect(testState.markDownloaded).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
  });

  it("reports one failed attempt and retries only after user action", async () => {
    const user = userEvent.setup();
    testState.downloadResourceWithName.mockRejectedValueOnce(
      new TypeError("network failed"),
    );
    renderCard();

    await user.click(screen.getByRole("button", { name: "Tải PC (1).rar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tải lỗi · Nhấn để thử lại",
    );
    expect(testState.downloadResourceWithName).toHaveBeenCalledTimes(1);
    expect(testState.markDownloaded).not.toHaveBeenCalled();

    await user.click(
      screen.getAllByRole("button", {
        name: "Thử tải lại PC (1).rar",
      })[0],
    );

    await waitFor(() =>
      expect(testState.markDownloaded).toHaveBeenCalledTimes(1),
    );
    expect(testState.downloadResourceWithName).toHaveBeenCalledTimes(2);
  });

  it("downloads once to the nhat desktop cache and opens it on the same click", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải và mở PC (1).rar" }),
    );

    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(1));
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.saveLocal).toHaveBeenCalledTimes(1);
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(
      testState.fetchResourceBlob.mock.invocationCallOrder[0],
    ).toBeLessThan(testState.saveLocal.mock.invocationCallOrder[0]);
    expect(testState.saveLocal.mock.invocationCallOrder[0]).toBeLessThan(
      testState.openLocal.mock.invocationCallOrder[0],
    );
  });

  it("falls back to a browser download when the desktop cache cannot be saved", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.saveLocal.mockResolvedValue(false);
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải và mở PC (1).rar" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Đã tải qua trình duyệt",
      );
    });
    expect(testState.downloadBlobWithName).toHaveBeenCalledTimes(1);
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("opens a cached desktop file without downloading it again", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    renderCard();

    await user.click(screen.getByRole("button", { name: "Mở PC (1).rar" }));

    expect(testState.openLocal).toHaveBeenCalledTimes(1);
    expect(testState.resolveUrl).not.toHaveBeenCalled();
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(testState.saveLocal).not.toHaveBeenCalled();
  });

  it("waits for the desktop cache check before enabling either download action", () => {
    testState.canOpenLocally = true;
    testState.localStatus = "unknown";
    renderCard();

    expect(screen.getByText("Đang kiểm tra file…")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Đang kiểm tra file…" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    ).toBeDisabled();
  });

  it("downloads again in the same click when a cached file disappeared", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    testState.openLocal
      .mockResolvedValueOnce({ ok: false, reason: "missing" })
      .mockResolvedValueOnce({ ok: true });
    renderCard();

    await user.click(screen.getByRole("button", { name: "Mở PC (1).rar" }));

    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(2));
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.saveLocal).toHaveBeenCalledTimes(1);
  });

  it("shows actual progress and ignores repeated activation while downloading", async () => {
    testState.canOpenLocally = true;
    let finishDownload: ((blob: Blob) => void) | undefined;
    testState.fetchResourceBlob.mockImplementation(
      async (
        _url: string,
        options: { onProgress?: (value: unknown) => void },
      ) => {
        options.onProgress?.({ loadedBytes: 32 * MB, totalBytes: 64 * MB });
        return new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        });
      },
    );
    renderCard();
    const card = screen.getByRole("button", {
      name: "Tải và mở PC (1).rar",
    });

    fireEvent.click(card);
    fireEvent.click(card);

    expect(await screen.findByText("Đang tải 50%")).toBeVisible();
    expect(testState.resolveUrl).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    finishDownload?.(new Blob(["archive"]));
    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(1));
  });

  it("lets the user cancel a heavy download and does not open a partial file", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    let downloadSignal: AbortSignal | undefined;
    testState.fetchResourceBlob.mockImplementation(
      async (
        _url: string,
        options: {
          signal: AbortSignal;
          onProgress?: (value: unknown) => void;
        },
      ) => {
        downloadSignal = options.signal;
        options.onProgress?.({ loadedBytes: 32 * MB, totalBytes: 64 * MB });
        return new Promise<Blob>((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Download aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải và mở PC (1).rar" }),
    );
    expect(await screen.findByText("Đang tải 50%")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Hủy tải PC (1).rar" }),
    );

    await waitFor(() => expect(downloadSignal?.aborted).toBe(true));
    expect(screen.getByText("Tải và mở")).toBeVisible();
    expect(testState.saveLocal).not.toHaveBeenCalled();
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("cancels immediately while the download URL is still resolving", async () => {
    const user = userEvent.setup();
    let finishResolve: ((url: string) => void) | undefined;
    testState.resolveUrl.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishResolve = resolve;
        }),
    );
    renderCard();

    await user.click(screen.getByRole("button", { name: "Tải PC (1).rar" }));
    await user.click(
      screen.getByRole("button", { name: "Hủy tải PC (1).rar" }),
    );

    expect(screen.getByRole("button", { name: "Tải PC (1).rar" })).toBeEnabled();
    await act(async () => {
      finishResolve?.("https://storage.example/archive-1.rar");
      await Promise.resolve();
    });
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(testState.markDownloaded).not.toHaveBeenCalled();
  });

  it("abandons an old transfer when the rendered attachment changes", async () => {
    const user = userEvent.setup();
    let finishResolve: ((url: string) => void) | undefined;
    testState.resolveUrl.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishResolve = resolve;
        }),
    );
    const view = renderCard();

    await user.click(screen.getByRole("button", { name: "Tải PC (1).rar" }));
    view.rerender(
      <FileMessageCard
        conversationId="conversation-1"
        attachment={{
          ...attachment,
          id: "archive-2",
          objectKey: "attachments/archive-2.rar",
          fileName: "Moi.rar",
        }}
        isOwn
      />,
    );

    await act(async () => {
      finishResolve?.("https://storage.example/archive-1.rar");
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Tải Moi.rar" })).toBeEnabled();
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
    expect(testState.saveLocal).not.toHaveBeenCalled();
    expect(testState.openLocal).not.toHaveBeenCalled();
    expect(testState.markDownloaded).not.toHaveBeenCalled();
  });

  it("downloads executable files without opening them automatically", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    renderCard({
      ...attachment,
      id: "unsafe-1",
      type: FileType.OTHER,
      fileName: "setup.exe",
      mimeType: "application/octet-stream",
    });

    await user.click(screen.getByRole("button", { name: "Tải setup.exe" }));

    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(1));
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("redownloads a missing cached executable without auto-opening it", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    testState.reveal.mockResolvedValue({ ok: false, reason: "missing" });
    renderCard({
      ...attachment,
      id: "unsafe-missing",
      type: FileType.OTHER,
      fileName: "setup.exe",
      mimeType: "application/octet-stream",
    });

    const [card] = screen.getAllByRole("button", {
      name: "Mở thư mục chứa setup.exe",
    });
    await user.click(card);

    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(1));
    expect(testState.reveal).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("supports keyboard activation and exposes a recoverable error", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.fetchResourceBlob.mockRejectedValue(new Error("network down"));
    renderCard();
    const card = screen.getByRole("button", {
      name: "Tải và mở PC (1).rar",
    });

    card.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tải lỗi · Nhấn để thử lại",
    );
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps desktop media cached and reuses the same bytes for the browser save", async () => {
    testState.canOpenLocally = true;
    let finishDownload: ((blob: Blob) => void) | undefined;
    testState.fetchResourceBlob.mockImplementation(
      async (
        _url: string,
        options: { onProgress?: (value: unknown) => void },
      ) => {
        options.onProgress?.({ loadedBytes: 32 * MB, totalBytes: 64 * MB });
        return new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        });
      },
    );
    const imageFile: Attachment = {
      ...attachment,
      id: "image-1",
      type: FileType.IMAGE,
      fileName: "photo.png",
      fileSize: 5,
      mimeType: "image/png",
      thumbnailUrl: "https://storage.example/photo-thumb.png",
    };
    renderCard(imageFile);

    fireEvent.click(screen.getByRole("button", { name: "chat:file.download" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đang tải 50%");
    expect(
      screen.getByRole("button", { name: "Hủy tải photo.png" }),
    ).toBeEnabled();

    finishDownload?.(new Blob(["image"]));

    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(1));
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.downloadBlobWithName).toHaveBeenCalledWith(
      expect.any(Blob),
      "photo.png",
    );
    expect(testState.downloadResourceWithName).not.toHaveBeenCalled();
  });

  it("does not auto-open after the card unmounts while desktop save is pending", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    let finishSave: ((saved: boolean) => void) | undefined;
    testState.saveLocal.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { unmount } = renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải và mở PC (1).rar" }),
    );
    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      finishSave?.(true);
      await Promise.resolve();
    });

    expect(testState.openLocal).not.toHaveBeenCalled();
  });
});
