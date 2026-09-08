import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAutoOpenDownloadedFile,
  canExplicitlyOpenDownloadedFile,
  downloadResourceWithName,
  fetchResourceBlob,
} from "./downloadFile";

describe("downloaded file open policy", () => {
  it.each(["bao-cao.docx", "du-lieu.xlsx", "tai-lieu.pdf", "anh.png"])(
    "allows one-gesture card open for standard files: %s",
    (fileName) => {
      expect(canAutoOpenDownloadedFile(fileName)).toBe(true);
    },
  );

  it.each([
    "PC (1).rar",
    "ban-ve.dwg",
    "video.mkv",
    "note.txt",
    "export.csv",
    "unknown.custom",
  ])("keeps specialized files download-first: %s", (fileName) => {
    expect(canAutoOpenDownloadedFile(fileName)).toBe(false);
    expect(canExplicitlyOpenDownloadedFile(fileName)).toBe(true);
  });

  it.each([
    "setup.exe",
    "invoice.pdf.EXE",
    "run.ps1. ",
    "shortcut.lnk",
    "macro.docm",
    "macro.sldm",
    "diagram.svg",
    "compressed.svgz",
    "installer.command",
    "launcher.desktop",
    "tool.appimage",
    "automation.scpt",
    "manual.chm",
    "page.html",
    "automation.js",
    "README",
  ])("never opens unsafe names: %s", (fileName) => {
    expect(canAutoOpenDownloadedFile(fileName)).toBe(false);
    expect(canExplicitlyOpenDownloadedFile(fileName)).toBe(false);
  });
});

describe("fetchResourceBlob", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("streams one response and reports transferred bytes", async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([3, 4, 5]),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };
    const response = {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-length"
            ? "5"
            : name.toLowerCase() === "content-type"
              ? "application/octet-stream"
              : null,
      },
      body: { getReader: () => reader },
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const onProgress = vi.fn();

    const blob = await fetchResourceBlob("https://storage.example/file.rar", {
      onProgress,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(blob.size).toBe(5);
    expect(blob.type).toBe("application/octet-stream");
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      loadedBytes: 2,
      totalBytes: 5,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      loadedBytes: 5,
      totalBytes: 5,
    });
  });

  it("uses the attachment size when Content-Length is unavailable", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      blob: vi.fn().mockResolvedValue(new Blob(["hello"])),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const onProgress = vi.fn();

    await fetchResourceBlob("https://storage.example/file.rar", {
      totalBytesHint: 5,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({
      loadedBytes: 5,
      totalBytes: 5,
    });
  });

  it("stops a streamed response before it can exceed the memory cap", async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4]) }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      fetchResourceBlob("https://storage.example/file.rar", {
        maxBytes: 3,
      }),
    ).rejects.toThrow("in-memory size limit");
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });
});

describe("downloadResourceWithName", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a managed download failure without starting a second request", async () => {
    const networkError = new TypeError("network failed");
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadResourceWithName("https://storage.example/file.rar", "file.rar", {
        onProgress: vi.fn(),
      }),
    ).rejects.toBe(networkError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("rejects a truncated managed response before starting a download", async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode("short"),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
    } as unknown as Response;
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      downloadResourceWithName("https://storage.example/file.rar", "file.rar", {
        expectedBytes: 7,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("does not match attachment");
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("keeps the direct-url fallback for legacy unmanaged callers", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("CORS blocked"));
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadResourceWithName("https://storage.example/file.rar", "file.rar"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});
