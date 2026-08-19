import { describe, expect, it } from "vitest";
import { shouldShowMessageMeta } from "./messageMetaVisibility";

describe("shouldShowMessageMeta", () => {
  it("shows meta on an edited message sitting mid-cluster", () => {
    // Đây là bug đã gặp: tin sửa ở giữa cụm mất nhãn, người đọc tưởng tin cuối
    // cụm mới là tin bị sửa.
    expect(shouldShowMessageMeta(false, { isEdited: true })).toBe(true);
  });

  it("keeps the cluster tail showing meta as before", () => {
    expect(shouldShowMessageMeta(true, { isEdited: false })).toBe(true);
  });

  it("keeps unedited mid-cluster messages collapsed", () => {
    expect(shouldShowMessageMeta(false, { isEdited: false })).toBe(false);
  });

  it("treats a missing flag as not edited", () => {
    expect(
      shouldShowMessageMeta(false, { isEdited: undefined as unknown as boolean }),
    ).toBe(false);
  });
});
