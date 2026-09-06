import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../../types";
import { FileMessageCard } from "./FileMessageCard";

const testState = vi.hoisted(() => ({
  localStatus: "not-downloaded" as "unknown" | "not-downloaded" | "downloaded",
  canOpenLocally: false,
  canSaveAsLocally: false,
  resolveUrl: vi.fn(),
  fetchResourceBlob: vi.fn(),
  downloadResourceWithName: vi.fn(),
  downloadBlobWithName: vi.fn(),
  saveLocal: vi.fn(),
  saveAsLocal: vi.fn(),
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
    canSaveAsLocally: testState.canSaveAsLocally,
    openLocal: testState.openLocal,
    reveal: testState.reveal,
    saveLocal: testState.saveLocal,
    saveAsLocal: testState.saveAsLocal,
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
    testState.canSaveAsLocally = false;
    testState.resolveUrl.mockResolvedValue(
      "https://storage.example/archive-1.rar",
    );
    testState.fetchResourceBlob.mockResolvedValue(new Blob(["archive"]));
    testState.downloadResourceWithName.mockResolvedValue(undefined);
    testState.saveLocal.mockResolvedValue(true);
    testState.saveAsLocal.mockResolvedValue({ ok: true });
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
      "Tải lỗi · Thử lại",
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

  it("opens native Save As from the cached copy without downloading again", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.localStatus = "downloaded";
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải lại PC (1).rar" }),
    );

    expect(testState.saveAsLocal).toHaveBeenCalledTimes(1);
    expect(testState.saveAsLocal).toHaveBeenCalledWith(undefined);
    expect(testState.resolveUrl).not.toHaveBeenCalled();
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(testState.openLocal).not.toHaveBeenCalled();
  });

  it("opens only one native Save As dialog while the first one is pending", async () => {
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.localStatus = "downloaded";
    let finishSaveAs:
      ((result: { ok: boolean; reason?: string }) => void) | undefined;
    testState.saveAsLocal.mockImplementation(
      () =>
        new Promise<{ ok: boolean; reason?: string }>((resolve) => {
          finishSaveAs = resolve;
        }),
    );
    renderCard();
    const download = screen.getByRole("button", {
      name: "Tải lại PC (1).rar",
    });

    fireEvent.click(download);
    fireEvent.click(download);

    expect(testState.saveAsLocal).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishSaveAs?.({ ok: false, reason: "canceled" });
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stops before resolving a URL when canceled during the native cache probe", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    let finishProbe:
      ((result: { ok: boolean; reason?: string }) => void) | undefined;
    testState.saveAsLocal.mockImplementation(
      () =>
        new Promise<{ ok: boolean; reason?: string }>((resolve) => {
          finishProbe = resolve;
        }),
    );
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Hủy tải PC (1).rar" }),
    );
    await act(async () => {
      finishProbe?.({ ok: false, reason: "missing" });
      await Promise.resolve();
    });

    expect(testState.resolveUrl).not.toHaveBeenCalled();
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(testState.saveLocal).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    ).toBeEnabled();
  });

  it("downloads once, caches, then opens native Save As without auto-opening", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.saveAsLocal
      .mockResolvedValueOnce({ ok: false, reason: "missing" })
      .mockResolvedValueOnce({ ok: true });
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );

    await waitFor(() => expect(testState.saveAsLocal).toHaveBeenCalledTimes(2));
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.saveLocal).toHaveBeenCalledTimes(1);
    expect(testState.saveAsLocal).toHaveBeenNthCalledWith(1, undefined);
    expect(testState.saveAsLocal).toHaveBeenNthCalledWith(2, undefined);
    expect(testState.openLocal).not.toHaveBeenCalled();
    expect(testState.downloadBlobWithName).not.toHaveBeenCalled();
  });

  it("reuses the one fetched blob for Save As when the managed cache write fails", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["archive"]);
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.fetchResourceBlob.mockResolvedValue(blob);
    testState.saveLocal.mockResolvedValue(false);
    testState.saveAsLocal
      .mockResolvedValueOnce({ ok: false, reason: "missing" })
      .mockResolvedValueOnce({ ok: true });
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Chỉ tải PC (1).rar" }),
    );

    await waitFor(() => expect(testState.saveAsLocal).toHaveBeenCalledTimes(2));
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.saveAsLocal).toHaveBeenNthCalledWith(2, blob);
    expect(testState.openLocal).not.toHaveBeenCalled();
    expect(testState.downloadBlobWithName).not.toHaveBeenCalled();
  });

  it("still opens the cached file from the card after Save As fails", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.localStatus = "downloaded";
    testState.saveAsLocal.mockResolvedValue({
      ok: false,
      reason: "save-failed",
    });
    renderCard();

    await user.click(
      screen.getByRole("button", { name: "Tải lại PC (1).rar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tải lỗi · Thử lại",
    );

    await user.click(screen.getByRole("button", { name: "Mở PC (1).rar" }));

    expect(testState.openLocal).toHaveBeenCalledTimes(1);
    expect(testState.resolveUrl).not.toHaveBeenCalled();
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
  });

  it("shares one byte transfer across two mounted cards for the same attachment", async () => {
    testState.canOpenLocally = true;
    testState.canSaveAsLocally = true;
    testState.saveAsLocal
      .mockResolvedValueOnce({ ok: false, reason: "missing" })
      .mockResolvedValueOnce({ ok: false, reason: "missing" })
      .mockResolvedValue({ ok: true });
    let finishDownload: ((blob: Blob) => void) | undefined;
    testState.fetchResourceBlob.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        }),
    );
    renderCard();
    renderCard();
    const downloadButtons = screen.getAllByRole("button", {
      name: "Chỉ tải PC (1).rar",
    });

    fireEvent.click(downloadButtons[0]);
    fireEvent.click(downloadButtons[1]);

    await waitFor(() =>
      expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      finishDownload?.(new Blob(["archive"]));
      await Promise.resolve();
    });
    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(2));
    expect(testState.openLocal).not.toHaveBeenCalled();
    expect(testState.downloadBlobWithName).not.toHaveBeenCalled();
  });

  it("shares one delayed URL resolution and byte fetch across mounted cards", async () => {
    testState.canOpenLocally = true;
    let finishResolve: ((url: string) => void) | undefined;
    testState.resolveUrl.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishResolve = resolve;
        }),
    );
    renderCard();
    renderCard();
    const cards = screen.getAllByRole("button", {
      name: "Tải và mở PC (1).rar",
    });

    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);

    await waitFor(() => expect(testState.resolveUrl).toHaveBeenCalledTimes(1));
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
    await act(async () => {
      finishResolve?.("https://storage.example/archive-1.rar");
      await Promise.resolve();
    });
    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(2));
    expect(testState.resolveUrl).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    expect(testState.saveLocal).toHaveBeenCalledTimes(2);
  });

  it("keeps the shared blob until every joined cache write finishes", async () => {
    testState.canOpenLocally = true;
    let finishDownload: ((blob: Blob) => void) | undefined;
    const finishSaves: Array<(saved: boolean) => void> = [];
    testState.fetchResourceBlob.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        }),
    );
    testState.saveLocal.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishSaves.push(resolve);
        }),
    );
    renderCard();
    renderCard();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Tải và mở PC (1).rar",
      })[0],
    );
    await waitFor(() =>
      expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      finishDownload?.(new Blob(["archive"]));
      await Promise.resolve();
    });
    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Tải và mở PC (1).rar",
      })[1],
    );

    await waitFor(() => expect(testState.saveLocal).toHaveBeenCalledTimes(2));
    expect(testState.resolveUrl).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    await act(async () => {
      for (const finishSave of finishSaves) finishSave(true);
      await Promise.resolve();
    });
    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(2));
  });

  it("opens a cached desktop file only once while the first open is pending", async () => {
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    let finishOpen: ((result: { ok: boolean }) => void) | undefined;
    testState.openLocal.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          finishOpen = resolve;
        }),
    );
    renderCard();
    const card = screen.getByRole("button", { name: "Mở PC (1).rar" });

    fireEvent.click(card);
    fireEvent.click(card);

    expect(testState.openLocal).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishOpen?.({ ok: true });
      await Promise.resolve();
    });
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

  it("replays the latest shared progress to a late consumer", async () => {
    testState.canOpenLocally = true;
    let reportProgress: ((value: unknown) => void) | undefined;
    let finishDownload: ((blob: Blob) => void) | undefined;
    testState.fetchResourceBlob.mockImplementation(
      async (
        _url: string,
        options: { onProgress?: (value: unknown) => void },
      ) => {
        reportProgress = options.onProgress;
        return new Promise<Blob>((resolve) => {
          finishDownload = resolve;
        });
      },
    );
    renderCard();
    renderCard();

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Tải và mở PC (1).rar",
      })[0],
    );
    await waitFor(() =>
      expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1),
    );
    act(() => {
      reportProgress?.({ loadedBytes: 32 * MB, totalBytes: 64 * MB });
    });
    expect(screen.getAllByText("Đang tải 50%")).toHaveLength(1);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Tải và mở PC (1).rar",
      })[1],
    );

    await waitFor(() =>
      expect(screen.getAllByText("Đang tải 50%")).toHaveLength(2),
    );
    expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishDownload?.(new Blob(["archive"]));
      await Promise.resolve();
    });
    await waitFor(() => expect(testState.openLocal).toHaveBeenCalledTimes(2));
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

    expect(
      screen.getByRole("button", { name: "Tải PC (1).rar" }),
    ).toBeEnabled();
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

  it("redownloads a missing cached executable from the card without auto-opening it", async () => {
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

  it("does not download when the folder button finds that a cached file is missing", async () => {
    const user = userEvent.setup();
    testState.canOpenLocally = true;
    testState.localStatus = "downloaded";
    testState.reveal.mockResolvedValue({ ok: false, reason: "missing" });
    renderCard({
      ...attachment,
      id: "unsafe-missing-folder",
      type: FileType.OTHER,
      fileName: "setup.exe",
      mimeType: "application/octet-stream",
    });

    const buttons = screen.getAllByRole("button", {
      name: "Mở thư mục chứa setup.exe",
    });
    await user.click(buttons[1]);

    expect(testState.reveal).toHaveBeenCalledTimes(1);
    expect(testState.fetchResourceBlob).not.toHaveBeenCalled();
    expect(testState.saveLocal).not.toHaveBeenCalled();
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
      "Tải lỗi · Thử lại",
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

  it.each([
    [FileType.IMAGE, "photo.png", "image/png"],
    [FileType.VIDEO, "clip.mp4", "video/mp4"],
  ])(
    "uses native Save As for a desktop %s download button without opening it",
    async (type, fileName, mimeType) => {
      const user = userEvent.setup();
      testState.canOpenLocally = true;
      testState.canSaveAsLocally = true;
      testState.saveAsLocal
        .mockResolvedValueOnce({ ok: false, reason: "missing" })
        .mockResolvedValueOnce({ ok: true });
      renderCard({
        ...attachment,
        id: `${type}-native-save-as`,
        type,
        fileName,
        mimeType,
        thumbnailUrl: `https://storage.example/${fileName}`,
      });

      await user.click(
        screen.getByRole("button", { name: "chat:file.download" }),
      );

      await waitFor(() =>
        expect(testState.saveAsLocal).toHaveBeenCalledTimes(2),
      );
      expect(testState.fetchResourceBlob).toHaveBeenCalledTimes(1);
      expect(testState.saveLocal).toHaveBeenCalledTimes(1);
      expect(testState.openLocal).not.toHaveBeenCalled();
      expect(testState.downloadBlobWithName).not.toHaveBeenCalled();
    },
  );

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
