import { describe, expect, it } from "vitest";
import { fileTypeOf, withinDateRange } from "./useGlobalSearch";

describe("fileTypeOf", () => {
  it("maps mime prefixes to coarse buckets", () => {
    expect(fileTypeOf("image/png", "a.png")).toBe("image");
    expect(fileTypeOf("video/mp4", "a.mp4")).toBe("video");
    expect(fileTypeOf("audio/mpeg", "a.mp3")).toBe("audio");
  });

  it("falls back to document for pdf/office/unknown", () => {
    expect(fileTypeOf("application/pdf", "a.pdf")).toBe("document");
    expect(fileTypeOf("application/vnd.ms-excel", "a.xls")).toBe("document");
    expect(fileTypeOf("application/octet-stream", "a.bin")).toBe("document");
  });
});

describe("withinDateRange", () => {
  const day = "2026-07-06T10:00:00+07:00";

  it("passes when no bounds", () => {
    expect(withinDateRange(day, null, null)).toBe(true);
  });

  it("respects from (inclusive of start of day)", () => {
    expect(withinDateRange(day, "2026-07-06", null)).toBe(true);
    expect(withinDateRange(day, "2026-07-07", null)).toBe(false);
  });

  it("respects to (inclusive of end of day)", () => {
    expect(withinDateRange(day, null, "2026-07-06")).toBe(true);
    expect(withinDateRange(day, null, "2026-07-05")).toBe(false);
  });

  it("does not exclude on an unparseable timestamp", () => {
    expect(withinDateRange("not-a-date", "2026-07-06", "2026-07-06")).toBe(true);
  });
});
