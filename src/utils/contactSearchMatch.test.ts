import { describe, expect, it } from "vitest";
import {
  matchesContactQuery,
  normalizeSearchText,
  scoreSearchMatch,
} from "./contactSearchMatch";

describe("normalizeSearchText", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(normalizeSearchText("Chiến")).toBe("chien");
    expect(normalizeSearchText("Nguyễn Thị Nhung")).toBe("nguyen thi nhung");
  });

  it("map đ/Đ (NFD không tách được)", () => {
    expect(normalizeSearchText("Đậu Cao Minh Nhật")).toBe("dau cao minh nhat");
  });
});

describe("matchesContactQuery", () => {
  it("khớp tên có dấu khi gõ không dấu và ngược lại", () => {
    expect(matchesContactQuery("chien", ["Hoàng Đình Chiến"])).toBe(true);
    expect(matchesContactQuery("Chiến", ["Hoang Dinh Chien"])).toBe(true);
  });

  // Đây là hồi quy chính: các tên dưới đây từng lọt vào kết quả "chiến"
  // vì `/users/search` khớp subsequence c-h-i-ê-n rời rạc.
  it("KHÔNG khớp subsequence rời rạc", () => {
    expect(matchesContactQuery("chien", ["Trần Chung"])).toBe(false);
    expect(matchesContactQuery("chien", ["Nguyễn Thị Nhung"])).toBe(false);
    expect(matchesContactQuery("chien", ["Bùi Văn Đức"])).toBe(false);
    expect(matchesContactQuery("chien", ["Đỗ Quốc Kiệt"])).toBe(false);
  });

  it("khớp nhiều từ không phụ thuộc thứ tự", () => {
    expect(matchesContactQuery("duc van", ["Bùi Văn Đức"])).toBe(true);
    expect(matchesContactQuery("van duc", ["Bùi Văn Đức"])).toBe(true);
    expect(matchesContactQuery("duc hoang", ["Bùi Văn Đức"])).toBe(false);
  });

  it("khớp theo username / mã nhân sự", () => {
    expect(
      matchesContactQuery("HC000444", ["Hoàng Đình Chiến", "HC000444"]),
    ).toBe(true);
    expect(matchesContactQuery("hc000444", [null, "HC000444"])).toBe(true);
  });

  it("chấp nhận username có tiền tố @", () => {
    expect(matchesContactQuery("@HC000444", ["HC000444"])).toBe(true);
  });

  it("từ khóa rỗng thì không lọc", () => {
    expect(matchesContactQuery("", ["bất kỳ"])).toBe(true);
    expect(matchesContactQuery("   ", ["bất kỳ"])).toBe(true);
  });

  it("không khớp khi mọi trường đều rỗng", () => {
    expect(matchesContactQuery("chien", [null, undefined, ""])).toBe(false);
  });
});

describe("scoreSearchMatch", () => {
  it("xếp exact cao hơn prefix, token và contains", () => {
    expect(scoreSearchMatch("quoc", ["Quốc"])).toBe(100);
    expect(scoreSearchMatch("quoc", ["Quốc Minh"])).toBe(80);
    expect(scoreSearchMatch("quoc", ["Minh Quốc"])).toBe(65);
    expect(scoreSearchMatch("quoc", ["MinhQuốcTest"])).toBe(50);
  });

  it("khớp tên gợi nhớ và không phân biệt dấu", () => {
    expect(
      scoreSearchMatch("vptct nguyen minh quang", [
        "VPTCT-Nguyễn Minh Quang",
        "Nguyễn Minh Quang",
      ]),
    ).toBeGreaterThanOrEqual(0);
  });

  it("không kéo kết quả chỉ vì các ký tự xuất hiện rải rác", () => {
    expect(scoreSearchMatch("hc000975", ["Phòng Hành chính 0075"])).toBe(-1);
    expect(scoreSearchMatch("chien", ["Cài đặt chung"])).toBe(-1);
  });
});
