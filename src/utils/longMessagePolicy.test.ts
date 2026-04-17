import { describe, expect, it } from "vitest";

import {
  LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD,
  estimateTextLineCount,
  getCollapsedTextPreview,
  hasInlineUrl,
  isLongMessageContent,
} from "./longMessagePolicy";

describe("longMessagePolicy", () => {
  it("estimates wrapped line count for whitespace-heavy and no-space text", () => {
    expect(estimateTextLineCount("short line")).toBe(1);
    expect(estimateTextLineCount("a".repeat(120), 40)).toBe(3);
    expect(estimateTextLineCount(`line one\n${"b".repeat(90)}`, 30)).toBe(4);
  });

  it("marks pathological long content as collapsible", () => {
    expect(isLongMessageContent("a".repeat(LONG_MESSAGE_COLLAPSE_CHAR_THRESHOLD + 1))).toBe(
      true,
    );
    expect(isLongMessageContent(Array.from({ length: 30 }, () => "word").join("\n"))).toBe(
      true,
    );
  });

  it("builds a shortened preview with ellipsis", () => {
    const preview = getCollapsedTextPreview("x".repeat(32), 16);
    expect(preview).toHaveLength(17);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("detects inline urls for dynamic text rows", () => {
    expect(hasInlineUrl("see https://example.com")).toBe(true);
    expect(hasInlineUrl("plain text only")).toBe(false);
  });
});
