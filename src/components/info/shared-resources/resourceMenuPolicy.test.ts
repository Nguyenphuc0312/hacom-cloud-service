import { describe, expect, it } from "vitest";
import { buildResourceDeleteMenuItems } from "./resourceMenuPolicy";

describe("buildResourceDeleteMenuItems", () => {
  it("keeps personal cloud deletion as a single local delete action", () => {
    expect(buildResourceDeleteMenuItems(true, "Xóa cho cả hai phía")).toEqual([
      { mode: "FOR_ME", label: "Xóa" },
    ]);
  });

  it("shows both local delete and recall outside personal cloud", () => {
    expect(
      buildResourceDeleteMenuItems(false, "Xóa cho cả nhóm (Thu hồi)"),
    ).toEqual([
      { mode: "FOR_ME", label: "Xóa chỉ ở phía tôi" },
      { mode: "FOR_EVERYONE", label: "Xóa cho cả nhóm (Thu hồi)" },
    ]);
  });
});
