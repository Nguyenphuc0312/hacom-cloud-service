import { describe, expect, it } from "vitest";

import { resolveGroupAvatarStageLabel } from "./useGroupAvatarUpload";

describe("resolveGroupAvatarStageLabel", () => {
  it("không hiện gì khi chưa bắt đầu", () => {
    expect(resolveGroupAvatarStageLabel("idle", 0)).toBeNull();
  });

  it("hiện phần trăm khi đã có tiến độ, ẩn khi còn 0", () => {
    expect(resolveGroupAvatarStageLabel("uploading", 0)).toBe("Đang tải lên");
    expect(resolveGroupAvatarStageLabel("uploading", 42)).toBe(
      "Đang tải lên 42%",
    );
  });

  it("mỗi bước của luồng đều có nhãn riêng cho người dùng", () => {
    const stages = [
      "validating",
      "reserving",
      "uploading",
      "completing",
      "attaching",
      "success",
      "error",
    ] as const;

    const labels = stages.map((stage) =>
      resolveGroupAvatarStageLabel(stage, 0),
    );

    // Không bước nào bị bỏ trống...
    expect(labels.every((label) => Boolean(label))).toBe(true);
    // ...và không hai bước nào trùng nhãn (người dùng phân biệt được đang ở đâu).
    expect(new Set(labels).size).toBe(labels.length);
  });
});
