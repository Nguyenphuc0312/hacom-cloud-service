import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalFileName,
  getDesktopFiles,
  getManagedDesktopFiles,
  getStreamingDesktopFiles,
} from "./desktopBridge";

const identity = {
  currentUserId: "user-1",
  conversationId: "conversation-1",
  attachmentKey: "archive-1",
};

describe("buildLocalFileName", () => {
  it("is stable for one full cache identity", () => {
    expect(buildLocalFileName(identity, "PC (1).rar")).toBe(
      buildLocalFileName({ ...identity }, "PC (1).rar"),
    );
  });

  it("separates the same attachment across users and conversations", () => {
    const original = buildLocalFileName(identity, "PC (1).rar");

    expect(
      buildLocalFileName(
        { ...identity, currentUserId: "user-2" },
        "PC (1).rar",
      ),
    ).not.toBe(original);
    expect(
      buildLocalFileName(
        { ...identity, conversationId: "conversation-2" },
        "PC (1).rar",
      ),
    ).not.toBe(original);
  });

  it("does not probe the legacy eight-character cache name", () => {
    expect(buildLocalFileName(identity, "PC (1).rar")).not.toBe(
      "PC (1)_rchive-1.rar",
    );
  });

  it("stays Windows-safe and within the desktop store byte limit", () => {
    const localName = buildLocalFileName(
      identity,
      `${"Báo cáo<>:\"/\\|?*".repeat(30)}.xlsx`,
    );

    expect(localName).not.toMatch(/[\u0000-\u001f<>:"/\\|?*]/);
    expect(
      new TextEncoder().encode(localName).byteLength,
    ).toBeLessThanOrEqual(180);
    expect(localName).toMatch(/\.xlsx$/);
  });
});

describe("getManagedDesktopFiles", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "chatDesktop");
  });

  it("does not route downloads into a legacy shell without folder settings", () => {
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: {
        files: {
          save: vi.fn(),
          open: vi.fn(),
          reveal: vi.fn(),
          exists: vi.fn(),
        },
      },
    });

    expect(getDesktopFiles()).not.toBeNull();
    expect(getManagedDesktopFiles()).toBeNull();
  });

  it("accepts the folder-aware native contract", () => {
    const files = {
      save: vi.fn(),
      open: vi.fn(),
      reveal: vi.fn(),
      exists: vi.fn(),
      getDownloadDirectory: vi.fn(),
      chooseDownloadDirectory: vi.fn(),
    };
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: { files },
    });

    expect(getManagedDesktopFiles()).toBe(files);
    expect(getStreamingDesktopFiles()).toBeNull();
  });

  it("accepts only the complete direct-stream native contract", () => {
    const files = {
      save: vi.fn(),
      open: vi.fn(),
      reveal: vi.fn(),
      exists: vi.fn(),
      getDownloadDirectory: vi.fn(),
      chooseDownloadDirectory: vi.fn(),
      download: vi.fn(),
      cancelDownload: vi.fn(),
      onDownloadProgress: vi.fn(),
    };
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: { files },
    });

    expect(getStreamingDesktopFiles()).toBe(files);
  });
});
