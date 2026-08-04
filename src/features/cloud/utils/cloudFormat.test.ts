import { describe, expect, it } from "vitest";
import type { CloudItem } from "../types";
import {
  formatBytes,
  getCloudItemPreview,
  getCloudItemTitle,
  isSafeExternalUrl,
} from "./cloudFormat";

const baseItem: CloudItem = {
  id: "item-1",
  type: "text",
  status: "ready",
  sizeBytes: 12,
  createdAt: "2026-07-30T08:00:00Z",
  updatedAt: "2026-07-30T08:00:00Z",
};

describe("cloudFormat", () => {
  it("formats decimal storage units used by the backend contract", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(5_000_000_000)).toBe("5 GB");
  });

  it("derives note titles without inventing durable data", () => {
    const item = { ...baseItem, content: "  Nội dung ghi chú  " };
    expect(
      getCloudItemTitle(item, {
        text: "Ghi chú",
        link: "Liên kết",
        file: "Tệp",
      }),
    ).toBe("Nội dung ghi chú");
    expect(getCloudItemPreview(item)).toBe("Nội dung ghi chú");
  });

  it("allows only safe HTTP(S) external links", () => {
    expect(isSafeExternalUrl("https://hacom.vn/cloud")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:8080")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("not-a-url")).toBe(false);
  });
});
