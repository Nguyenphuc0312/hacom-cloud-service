import { describe, it, expect } from "vitest";
import { isoToVn, vnToIso } from "../../../components/ui/dateFieldVNUtils";

describe("vnToIso — dd/mm/yyyy → yyyy-mm-dd cho native picker", () => {
  it("chuyển ngày hợp lệ", () => {
    expect(vnToIso("15/07/2026")).toBe("2026-07-15");
    expect(vnToIso("01/01/2026")).toBe("2026-01-01");
    expect(vnToIso(" 29/02/2024 ")).toBe("2024-02-29"); // năm nhuận, có trim
  });

  it("từ chối ngày không tồn tại / sai định dạng → rỗng", () => {
    expect(vnToIso("32/01/2026")).toBe(""); // ngày 32
    expect(vnToIso("31/04/2026")).toBe(""); // tháng 4 không có 31
    expect(vnToIso("29/02/2025")).toBe(""); // 2025 không nhuận
    expect(vnToIso("2026-07-15")).toBe(""); // sai định dạng
    expect(vnToIso("")).toBe("");
    expect(vnToIso("7/7/2026")).toBe(""); // thiếu số 0
  });
});

describe("isoToVn — yyyy-mm-dd → dd/mm/yyyy", () => {
  it("chuyển đúng, sai định dạng → rỗng", () => {
    expect(isoToVn("2026-07-15")).toBe("15/07/2026");
    expect(isoToVn("")).toBe("");
    expect(isoToVn("15/07/2026")).toBe("");
  });
});
