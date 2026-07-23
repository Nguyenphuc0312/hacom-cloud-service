import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MessageInput.tsx ~1.6k dòng và kéo theo Tiptap + nhiều store, render thật ở
 * unit test là quá đắt. Nên ở đây kiểm bằng cách đọc source — nhưng CHỈ với
 * những thứ mang tính hành vi (API geolocation nào được dùng, guard chống
 * callback cũ, nhãn người dùng đọc được). Tuyệt đối không assert vào class
 * Tailwind: đổi style là đỏ oan, làm mọi refactor UI trở nên đau đớn.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "MessageInput.tsx"),
  "utf8",
);

describe("MessageInput location composer flow", () => {
  it("lấy vị trí một lần, không theo dõi liên tục", () => {
    expect(source).toContain("navigator.geolocation.getCurrentPosition");
    // watchPosition sẽ bắn callback liên tục và rò pin/quyền riêng tư.
    expect(source).not.toContain("watchPosition");
  });

  it("bỏ qua callback của yêu cầu cũ (chống race khi bấm nhiều lần)", () => {
    expect(source).toContain("locationRequestSeqRef.current !== requestSeq");
    // Cả nhánh thành công lẫn nhánh lỗi đều phải có guard.
    const guardCount = source.split(
      "locationRequestSeqRef.current !== requestSeq",
    ).length - 1;
    expect(guardCount).toBeGreaterThanOrEqual(2);
  });

  it("huỷ luồng thì tăng seq để callback đang bay không ghi đè state", () => {
    expect(source).toContain("locationRequestSeqRef.current += 1");
  });

  it("có nhãn hành động và trạng thái cho người dùng", () => {
    expect(source).toContain("Gửi vị trí");
    expect(source).toContain("Đang gửi vị trí…");
    // Nút gửi phải có aria-label cho screen reader.
    expect(source).toContain('aria-label="Gửi vị trí"');
  });

  it("chặn lấy vị trí trên kết nối không bảo mật", () => {
    expect(source).toContain("isSecureContext");
  });
});
