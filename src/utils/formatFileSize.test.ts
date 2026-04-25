import { describe, expect, it } from "vitest";
import { getPreviewType, isPreviewable } from "./formatFileSize";

describe("formatFileSize preview helpers", () => {
  it("falls back to file extension when mime type is missing", () => {
    expect(getPreviewType(undefined, "photo.jpeg")).toBe("image");
    expect(getPreviewType(undefined, "clip.mp4")).toBe("video");
    expect(getPreviewType(undefined, "voice-note.m4a")).toBe("audio");
    expect(getPreviewType(undefined, "spec.pdf")).toBe("pdf");
  });

  it("prefers mime type when available", () => {
    expect(getPreviewType("image/webp", "file.bin")).toBe("image");
    expect(getPreviewType("audio/ogg", "file.bin")).toBe("audio");
  });

  it("reports previewability using both mime type and file name", () => {
    expect(isPreviewable(undefined, "banner.png")).toBe(true);
    expect(isPreviewable("application/octet-stream", "invoice.pdf")).toBe(true);
    expect(isPreviewable("application/zip", "archive.zip")).toBe(false);
  });
});
