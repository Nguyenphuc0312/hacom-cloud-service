import { describe, it, expect } from "vitest";
import { FileType, type Attachment } from "../../../types";
import { estimateAttachmentHeight } from "./SimpleVirtualizedChatTimeline";

const att = (overrides: Partial<Attachment>): Attachment =>
  ({ id: "a1", type: FileType.IMAGE, ...overrides }) as Attachment;

describe("estimateAttachmentHeight (dimension-aware reserved size)", () => {
  it("uses real width/height (capped at 320) for images", () => {
    // 640x480 → display width capped to 320, ratio 4:3 → 240
    expect(estimateAttachmentHeight(att({ width: 640, height: 480 }))).toBe(240);
    // portrait 300x600 → ratio 0.5 → 300/0.5 = 600
    expect(estimateAttachmentHeight(att({ width: 300, height: 600 }))).toBe(600);
  });

  it("falls back gracefully when dimensions are missing", () => {
    // No dims at all → 280-wide 4:3 box = 210.
    expect(estimateAttachmentHeight(att({}))).toBe(210);
    // Width but no height → capped width (320) with 4:3 fallback ratio = 240.
    expect(estimateAttachmentHeight(att({ width: 800 }))).toBe(240);
  });

  it("treats video like images and audio as a fixed strip", () => {
    expect(estimateAttachmentHeight(att({ type: FileType.VIDEO, width: 320, height: 320 }))).toBe(320);
    expect(estimateAttachmentHeight(att({ type: FileType.AUDIO }))).toBe(56);
  });

  it("reserves no extra media height for generic files", () => {
    expect(estimateAttachmentHeight(att({ type: FileType.FILE }))).toBe(0);
  });

  it("is meaningfully larger than the old flat estimate for a single image", () => {
    // Old heuristic for 1 image item: (56 + 1*56) * 1.3 = 145.
    // New base+media for a 280-fallback image: 112 + 210 = 322 → closer to real.
    const base = 56 + 1 * 56;
    expect(base + estimateAttachmentHeight(att({}))).toBeGreaterThan(145);
  });
});
