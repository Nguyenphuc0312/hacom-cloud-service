import { describe, expect, it } from "vitest";
import type { CloudItem } from "../types";
import {
  formatBytes,
  getTrashCountdown,
  getTrashExpiry,
  getCloudItemPreview,
  getCloudItemTitle,
  isTrashItemExpired,
  isSafeExternalUrl,
  normalizeCloudItemType,
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
    const item = { ...baseItem, content: "  N?i dung ghi ch?  " };
    expect(
      getCloudItemTitle(item, {
        text: "Ghi ch?",
        link: "Li?n k?t",
        file: "T?p",
      }),
    ).toBe("N?i dung ghi ch?");
    expect(getCloudItemPreview(item)).toBe("N?i dung ghi ch?");
  });

  it("allows only safe HTTP(S) external links", () => {
    expect(isSafeExternalUrl("https://hacom.vn/cloud")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:8080")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("not-a-url")).toBe(false);
  });

  it("calculates trash countdowns at the exact expiry boundary", () => {
    const now = new Date("2026-07-31T03:00:00Z").getTime();
    expect(
      getTrashCountdown("2026-07-31T05:30:00Z", now),
    ).toMatchObject({
      expired: false,
      hours: 2,
      minutes: 30,
    });
    expect(getTrashCountdown("2026-07-31T03:00:00Z", now)).toEqual({
      expired: true,
      hours: 0,
      minutes: 0,
    });
  });

  it("uses the server deadline and falls back to the 24-hour trash policy", () => {
    expect(getTrashExpiry("2026-07-31T05:30:00Z", "2026-07-30T08:00:00Z")).toBe("2026-07-31T05:30:00Z");
    expect(getTrashExpiry(undefined, "2026-07-30T08:00:00Z")).toBe("2026-07-31T08:00:00.000Z");
    expect(getTrashExpiry(undefined, "invalid")).toBeUndefined();
  });

  it("removes Trash items at the retention boundary", () => {
    const now = new Date("2026-07-31T08:00:00Z").getTime();
    expect(
      isTrashItemExpired(
        { purgeAfter: "2026-07-31T08:00:00Z", deletedAt: "2026-07-30T08:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isTrashItemExpired(
        { purgeAfter: "2026-07-31T08:00:01Z", deletedAt: "2026-07-30T08:00:00Z" },
        now,
      ),
    ).toBe(false);
    // An optimistic item without lifecycle timestamps is retained until the API
    // returns its authoritative purge deadline.
    expect(isTrashItemExpired({}, now)).toBe(false);
  });

  it("keeps CSV resources as files when an old projection says image", () => {
    const item = normalizeCloudItemType({
      ...baseItem,
      type: "image",
      title: "don-hang-3520.csv",
      contentType: "text/csv",
    });
    expect(item.type).toBe("file");
  });
});
