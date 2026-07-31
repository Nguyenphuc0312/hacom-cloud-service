import { describe, it, expect } from "vitest";
import { splitTagSegments, tagBeforeCursor } from "./tagText";

/** Danh sách lệnh như user thường (2 tag cá nhân) + 1 tag cấp. */
const TAGS = ["#congviectuan", "#baocaocongviec", "#TBP_baocao"];

describe("splitTagSegments", () => {
  /**
   * Bất biến quan trọng nhất: ghép lại phải ra đúng chuỗi gốc. Lớp phủ nằm khít
   * dưới textarea nên lệch một ký tự là chữ bị bóng đôi.
   */
  const rejoin = (s: string) =>
    splitTagSegments(s, TAGS)
      .map((seg) => seg.text)
      .join("");

  it("giữ nguyên chuỗi khi ghép lại", () => {
    for (const s of [
      "",
      "không có tag",
      "#congviectuan",
      "nộp #TBP_baocao tuần này",
      "#congviectuan #baocaocongviec",
      "xong #",
      "#congviectuanad",
    ]) {
      expect(rejoin(s)).toBe(s);
    }
  });

  it("tô đúng phần là tag", () => {
    expect(splitTagSegments("nộp #TBP_baocao nhé", TAGS)).toEqual([
      { text: "nộp ", isTag: false },
      { text: "#TBP_baocao", isTag: true },
      { text: " nhé", isTag: false },
    ]);
  });

  it("gõ thêm chữ sau tag → KHÔNG nuốt chữ đó vào chip", () => {
    // Bug thật: "#congviectuanad" từng tô xanh cả "ad" và dính liền vào tag.
    expect(splitTagSegments("#congviectuanad", TAGS)).toEqual([
      { text: "#congviectuanad", isTag: false },
    ]);
  });

  it("mỗi dấu # → không tô gì (không hiện chip rỗng)", () => {
    expect(splitTagSegments("#", TAGS)).toEqual([{ text: "#", isTag: false }]);
  });

  it("tag gõ dở chưa khớp lệnh nào → chưa tô", () => {
    expect(splitTagSegments("#congvie", TAGS)).toEqual([
      { text: "#congvie", isTag: false },
    ]);
  });

  it("không phân biệt hoa thường (BE nhận cả hai)", () => {
    expect(splitTagSegments("#tbp_baocao", TAGS)).toEqual([
      { text: "#tbp_baocao", isTag: true },
    ]);
  });

  it("tô được nhiều tag trong một câu", () => {
    const tags = splitTagSegments("#congviectuan rồi #TBP_baocao", TAGS)
      .filter((s) => s.isTag)
      .map((s) => s.text);
    expect(tags).toEqual(["#congviectuan", "#TBP_baocao"]);
  });

  it("tag không có trong danh sách quyền → không tô", () => {
    expect(splitTagSegments("#LDDV_baocao", TAGS)).toEqual([
      { text: "#LDDV_baocao", isTag: false },
    ]);
  });

  it("danh sách lệnh rỗng → không tô gì", () => {
    expect(splitTagSegments("#congviectuan", [])).toEqual([
      { text: "#congviectuan", isTag: false },
    ]);
  });

  it("chuỗi rỗng → không có đoạn nào", () => {
    expect(splitTagSegments("", TAGS)).toEqual([]);
  });
});

describe("tagBeforeCursor — Backspace xóa trọn tag", () => {
  it("con trỏ ngay sau tag hoàn chỉnh → trả vị trí đầu tag", () => {
    const v = "nộp #TBP_baocao";
    expect(tagBeforeCursor(v, v.length, TAGS)).toEqual({ start: 4 });
  });

  it("tag gõ dở → null, Backspace xóa từng ký tự như bình thường", () => {
    expect(tagBeforeCursor("#congvie", 8, TAGS)).toBeNull();
  });

  it("có chữ thừa sau tag → null (không xóa oan cả cụm)", () => {
    expect(tagBeforeCursor("#congviectuanad", 15, TAGS)).toBeNull();
  });

  it("sau khoảng trắng → null", () => {
    expect(tagBeforeCursor("#congviectuan ", 14, TAGS)).toBeNull();
  });

  it("chữ thường không phải tag → null", () => {
    expect(tagBeforeCursor("báo cáo", 7, TAGS)).toBeNull();
  });

  it("chỉ mỗi dấu # → null", () => {
    expect(tagBeforeCursor("#", 1, TAGS)).toBeNull();
  });

  it("con trỏ ở đầu chuỗi → null", () => {
    expect(tagBeforeCursor("#congviectuan", 0, TAGS)).toBeNull();
  });

  it("con trỏ GIỮA tag → null (chỉ xóa trọn khi đứng ngay sau tag đủ)", () => {
    expect(tagBeforeCursor("#congviectuan", 6, TAGS)).toBeNull();
  });
});
