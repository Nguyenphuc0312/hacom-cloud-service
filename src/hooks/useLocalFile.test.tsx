import "@testing-library/jest-dom/vitest";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, type Attachment } from "../types";
import {
  clearDownloadedFiles,
  markFileDownloaded,
} from "../utils/downloadedFiles";
import { useLocalFile } from "./useLocalFile";

const attachment: Attachment = {
  id: "archive-1",
  type: FileType.ARCHIVE,
  fileName: "PC (1).rar",
  fileSize: 64 * 1024 * 1024,
  mimeType: "application/vnd.rar",
  objectKey: "attachments/archive-1.rar",
};

describe("useLocalFile desktop cache", () => {
  let resolveExists:
    | ((value: { exists: boolean; size?: number }) => void)
    | undefined;
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearDownloadedFiles();
    resolveExists = undefined;
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
    const { result } = renderHook(() => useLocalFile(attachment));

    expect(result.current.status).toBe("unknown");
    await act(async () => {
      expect(await result.current.saveLocal(new Blob(["archive"]))).toBe(true);
    });
    expect(result.current.status).toBe("downloaded");

    await act(async () => {
      resolveExists?.({ exists: false });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("downloaded");
  });

  it("does not trust a cached file whose byte size is incomplete", async () => {
    const { result } = renderHook(() => useLocalFile(attachment));

    expect(result.current.status).toBe("unknown");
    await act(async () => {
      resolveExists?.({ exists: true, size: attachment.fileSize - 1 });
      await Promise.resolve();
    });

    expect(result.current.status).toBe("not-downloaded");
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
      ({ file }) => useLocalFile(file),
      { initialProps: { file: attachment } },
    );

    expect(result.current.status).toBe("downloaded");
    rerender({ file: otherAttachment });

    expect(result.current.status).toBe("not-downloaded");
  });
});
