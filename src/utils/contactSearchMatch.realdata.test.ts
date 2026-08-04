import { describe, expect, it } from "vitest";
import { matchesContactQuery } from "./contactSearchMatch";

// Dữ liệu THẬT lấy từ GET /users/search?q=chiến trên chat.hacomholdings.com.vn
// (tài khoản minhnhatcff, 04-08-2026) — đúng danh sách đang lỗi trên UI.
const REAL_SEARCH_RESULTS = [
  { name: "Hoàng Đình Chiến", username: "HC000444" },
  { name: "Trần Phú Chiến", username: "HC000001" },
  { name: "Trần Chung", username: "HC000602" },
  { name: "Lê Thị Nụ", username: "HC000034" },
  { name: "Nguyễn Tam Kỳ", username: "HC000379" },
  { name: "Nguyễn Thị Nhung", username: "HC000022" },
  { name: "Nguyễn Thị Thanh", username: "HC000019" },
  { name: "Nguyễn Văn Thản", username: "HC000914" },
  { name: "Trần Thị Trung", username: "HC000116" },
  { name: "Trịnh Thị Minh", username: "HC000449" },
  { name: "Bùi Văn Đức", username: "HC000742" },
  { name: "Huỳnh Hữu Đức", username: "HC000591" },
  { name: "Huỳnh Nguyên Anh", username: "HC000604" },
  { name: "Nguyễn Thành Tuấn", username: "HC000461" },
  { name: "Ngư Hoàng Huy", username: "HC000852" },
  { name: "Quảng Đại Nghiệm", username: "HC000987" },
  { name: "Trượng Văn Ninh", username: "HC001001" },
  { name: "Đỗ Quốc Kiệt", username: "HC000603" },
  { name: "Nguyễn Thị Thắm", username: "HC000109" },
  { name: "Phạm Thị Yên", username: "HC000344" },
];

describe("lọc kết quả /users/search thật với từ khóa 'chiến'", () => {
  const kept = REAL_SEARCH_RESULTS.filter((u) =>
    matchesContactQuery("chiến", [u.name, u.username]),
  );

  it("chỉ giữ đúng 2 người thật sự tên Chiến", () => {
    expect(kept.map((u) => u.name)).toEqual([
      "Hoàng Đình Chiến",
      "Trần Phú Chiến",
    ]);
  });

  it("loại 18/20 kết quả nhiễu do subsequence", () => {
    expect(REAL_SEARCH_RESULTS.length - kept.length).toBe(18);
  });
});
