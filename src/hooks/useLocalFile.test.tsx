import "@testing-library/jest-dom/vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../types";
import {
  clearDownloadedFiles,
  isFileDownloaded,
  markFileDownloaded,
} from "../utils/downloadedFiles";
import { useLocalFile } from "./useLocalFile";
import { buildLocalFileName } from "../utils/desktopBridge";

const attachment: Attachment = {
  id: "archive-1",
  type: FileType.ARCHIVE,
  fileName: "PC (1).rar",
  fileSize: 64 * 1024 * 1024,
  mimeType: "application/vnd.rar",
  objectKey: "attachments/archive-1.rar",
};

const scope = {
  currentUserId: "user-1",
  conversationId: "conversation-1",
};
const expectedLocalName = buildLocalFileName(
  { ...scope, attachmentKey: attachment.id },
  attachment.fileName,
);

describe("useLocalFile desktop files", () => {
  let downloadProgressListener:
    | ((progress: {
        id: string;
        status: "started" | "progress" | "completed" | "canceled" | "failed";
        loadedBytes: number;
        totalBytes?: number;
        reason?: string;
      }) => void)
    | undefined;
  let resolveExists:
    ((value: { exists: boolean; size?: number }) => void) | undefined;
  const files = {
    exists: vi.fn(
      () =>
        new Promise<{ exists: boolean; size?: number }>((resolve) => {
          resolveExists = resolve;
        }),
    ),
    save: vi.fn().mockResolvedValue({ ok: true }),
    open: vi.fn().mockResolvedValue({ ok: true }),
    reveal: vi.fn().mockResolvedValue({ ok: true }),
    getDownloadDirectory: vi.fn().mockResolvedValue({ ok: true }),
    chooseDownloadDirectory: vi.fn().mockResolvedValue({ ok: true }),
    download: vi.fn().mockResolvedValue({ ok: true, bytes: attachment.fileSize }),
    cancelDownload: vi.fn().mockResolvedValue({ ok: true }),
    onDownloadProgress: vi.fn((callback) => {
      downloadProgressListener = callback;
      return vi.fn();
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearDownloadedFiles();
    resolveExists = undefined;
    downloadProgressListener = undefined;
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: { files },
    });
  });

  afterEach(() => {
    clearDownloadedFiles();
    Reflect.deleteProperty(window, "chatDesktop");
  });

  it("does not let a pending exists result overwrite a completed save", async () => {
    const blob = new Blob(["archive"]);
    const matchingAttachment = { ...attachment, fileSize: blob.size };
    const { result } = renderHook(() => useLocalFile(matchingAttachment, scope));

    expect(result.current.status).toBe("unknown");
    await act(async () => {
      expect(await result.current.saveLocal(blob)).toBe(true);
    });
    expect(files.save).toHaveBeenCalledWith(
      expectedLocalName,
      expect.any(ArrayBuffer),
      "PC (1).rar",
    );
    expect(result.current.status).toBe("downloaded");

    await act(async () => {
      resolveExists?.({ exists: false });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("downloaded");
  });

  it("broadcasts a completed save to every mounted hook for the same file", async () => {
    const blob = new Blob(["archive"]);
    const matchingAttachment = { ...attachment, fileSize: blob.size };
    files.exists
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: false });
    const first = renderHook(() => useLocalFile(matchingAttachment, scope));
    const second = renderHook(() => useLocalFile(matchingAttachment, scope));
    await waitFor(() => {
      expect(first.result.current.status).toBe("not-downloaded");
      expect(second.result.current.status).toBe("not-downloaded");
    });

    await act(async () => {
      expect(await first.result.current.saveLocal(blob)).toBe(true);
    });

    expect(first.result.current.status).toBe("downloaded");
    expect(second.result.current.status).toBe("downloaded");
  });

  it("keeps a save broadcast missing for a hook expecting another byte size", async () => {
    const blob = new Blob(["archive"]);
    const matchingAttachment = { ...attachment, fileSize: blob.size };
    files.exists
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: false });
    const first = renderHook(() => useLocalFile(matchingAttachment, scope));
    const second = renderHook(() =>
      useLocalFile({ ...matchingAttachment, fileSize: blob.size + 1 }, scope),
    );
    await waitFor(() => {
      expect(first.result.current.status).toBe("not-downloaded");
      expect(second.result.current.status).toBe("not-downloaded");
    });

    await act(async () => {
      expect(await first.result.current.saveLocal(blob)).toBe(true);
    });

    expect(first.result.current.status).toBe("downloaded");
    expect(second.result.current.status).toBe("not-downloaded");
  });

  it.each(["openLocal", "reveal"] as const)(
    "rechecks actual byte size before broadcasting a successful %s",
    async (operation) => {
      const observedSize = 7;
      const matchingAttachment = { ...attachment, fileSize: observedSize };
      files.exists
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true, size: observedSize });
      const first = renderHook(() => useLocalFile(matchingAttachment, scope));
      const second = renderHook(() =>
        useLocalFile(
          { ...matchingAttachment, fileSize: observedSize + 1 },
          scope,
        ),
      );
      await waitFor(() => {
        expect(first.result.current.status).toBe("not-downloaded");
        expect(second.result.current.status).toBe("not-downloaded");
      });

      await act(async () => {
        await expect(first.result.current[operation]()).resolves.toEqual({
          ok: true,
        });
      });

      await waitFor(() => {
        expect(first.result.current.status).toBe("downloaded");
        expect(second.result.current.status).toBe("not-downloaded");
      });
      expect(files.exists).toHaveBeenCalledTimes(3);
    },
  );

  it("validates a shared disk observation against each hook's expected size", async () => {
    let resolveSharedExists:
      | ((value: { exists: boolean; size?: number }) => void)
      | undefined;
    const sharedExists = new Promise<{ exists: boolean; size?: number }>(
      (resolve) => {
        resolveSharedExists = resolve;
      },
    );
    files.exists
      .mockReturnValueOnce(sharedExists)
      .mockReturnValueOnce(sharedExists);
    const first = renderHook(() => useLocalFile(attachment, scope));
    const second = renderHook(() =>
      useLocalFile({ ...attachment, fileSize: attachment.fileSize + 1 }, scope),
    );

    await act(async () => {
      resolveSharedExists?.({ exists: true, size: attachment.fileSize });
      await sharedExists;
    });

    expect(first.result.current.status).toBe("downloaded");
    expect(second.result.current.status).toBe("not-downloaded");
  });

  it("does not trust a cached file whose byte size is incomplete", async () => {
    const { result } = renderHook(() => useLocalFile(attachment, scope));

    expect(result.current.status).toBe("unknown");
    await act(async () => {
      resolveExists?.({ exists: true, size: attachment.fileSize - 1 });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("not-downloaded");
  });

  it("streams the authorized URL directly through the native bridge without Blob save", async () => {
    const expectedBytes = 7;
    const matchingAttachment = { ...attachment, fileSize: expectedBytes };
    files.exists.mockResolvedValueOnce({ exists: false });
    files.download.mockResolvedValueOnce({ ok: true, bytes: expectedBytes });
    const onProgress = vi.fn();
    const { result } = renderHook(() => useLocalFile(matchingAttachment, scope));

    await act(async () => {
      const download = result.current.downloadToLocal(
        "https://chat.hacomholdings.com.vn/chat-files/attachments/archive-1.rar",
        { onProgress },
      );
      downloadProgressListener?.({
        id: expectedLocalName,
        status: "progress",
        loadedBytes: 3,
        totalBytes: expectedBytes,
      });
      await expect(download).resolves.toBe(true);
    });

    expect(files.download).toHaveBeenCalledWith(
      expectedLocalName,
      "https://chat.hacomholdings.com.vn/chat-files/attachments/archive-1.rar",
      "PC (1).rar",
      expectedBytes,
    );
    expect(onProgress).toHaveBeenCalledWith({
      loadedBytes: 3,
      totalBytes: expectedBytes,
    });
    expect(files.save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("downloaded");
  });

  it("cancels a direct native download through the same opaque local identity", async () => {
    let finishDownload:
      | ((result: { ok: boolean; reason?: string }) => void)
      | undefined;
    files.exists.mockResolvedValueOnce({ exists: false });
    files.download.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
    const controller = new AbortController();
    const { result } = renderHook(() => useLocalFile(attachment, scope));

    let pendingDownload: Promise<boolean>;
    act(() => {
      pendingDownload = result.current.downloadToLocal(
        "https://chat.hacomholdings.com.vn/chat-files/attachments/archive-1.rar",
        { signal: controller.signal },
      );
    });
    await waitFor(() => expect(files.download).toHaveBeenCalledTimes(1));

    act(() => controller.abort());
    expect(files.cancelDownload).toHaveBeenCalledWith(expectedLocalName);
    await act(async () => {
      finishDownload?.({ ok: false, reason: "canceled" });
      await expect(pendingDownload!).resolves.toBe(false);
    });
    expect(result.current.status).not.toBe("downloaded");
  });

  it("keeps markDownloaded browser-only when the desktop bridge is present", () => {
    const { result } = renderHook(() => useLocalFile(attachment, scope));

    act(() => result.current.markDownloaded());

    expect(isFileDownloaded(attachment.id)).toBe(false);
    expect(result.current.status).toBe("unknown");
  });

  it("falls back to browser state for a legacy desktop shell without folder settings", async () => {
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: {
        files: {
          save: files.save,
          open: files.open,
          reveal: files.reveal,
          exists: files.exists,
        },
      },
    });
    const { result } = renderHook(() => useLocalFile(attachment, scope));

    expect(result.current.canOpenLocally).toBe(false);
    await act(async () => {
      expect(await result.current.saveLocal(new Blob(["archive"]))).toBe(false);
    });

    expect(files.save).not.toHaveBeenCalled();
    expect(isFileDownloaded(attachment.id)).toBe(true);
  });

  it("recomputes browser status when the attachment identity changes", () => {
    Reflect.deleteProperty(window, "chatDesktop");
    markFileDownloaded(attachment.id);
    const otherAttachment: Attachment = {
      ...attachment,
      id: "archive-2",
      objectKey: "attachments/archive-2.rar",
    };
    const { result, rerender } = renderHook(
      ({ file }) => useLocalFile(file, scope),
      {
        initialProps: { file: attachment },
      },
    );

    expect(result.current.status).toBe("downloaded");
    rerender({ file: otherAttachment });

    expect(result.current.status).toBe("not-downloaded");
  });
});
