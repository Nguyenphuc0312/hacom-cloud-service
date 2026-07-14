import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("  Xin chào  ")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Xin chào");
  });

  it("falls back to a temporary textarea when Clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard("Dòng 1\nDòng 2")).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false and does not copy empty text", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("   ")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
