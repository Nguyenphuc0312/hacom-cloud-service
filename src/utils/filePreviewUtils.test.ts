import { describe, expect, it } from "vitest";
import {
  formatFilePreviewMetadata,
  formatFileSize,
} from "./filePreviewUtils";

describe("file preview metadata", () => {
  it("formats sender, absolute send time, and file size for the preview footer", () => {
    expect(
      formatFilePreviewMetadata(
        " Test User ",
        new Date(2026, 7, 21, 10, 45),
        69_222,
      ),
    ).toBe("Test User · 21/08/2026 10:45 · 67.6 KB");
  });

  it("drops invalid optional metadata but always keeps the file size", () => {
    expect(formatFilePreviewMetadata(" ", "invalid", undefined)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });
});
