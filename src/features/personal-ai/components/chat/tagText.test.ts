import { describe, it, expect } from "vitest";
import { splitTagSegments, tagBeforeCursor } from "./tagText";

describe("splitTagSegments", () => {
  /**
   * Bất biến quan trọng nhất: ghép lại phải ra đúng chuỗi gốc. Lớp phủ nằm khít
   * dưới textarea nên lệch một ký tự là chữ bị bóng đôi.
   */
  const rejoin = (s: string) =>
    splitTagSegments(s)
      .map((seg) => seg.text)
      .join("");

  it("giữ nguyên chuỗi khi ghép lại", () => {
    for (const s of [
      "",
      "không có tag",
      "#congviectuan",
      "nộp #TBP_baocao tuần này",
      "#a #b #c",
      "xong #",
    ]) {
      expect(rejoin(s)).toBe(s);
    }
  });

  it("đánh dấu đúng phần là tag", () => {
    expect(splitTagSegments("nộp #TBP_baocao nhé")).toEqual([
      { text: "nộp ", isTag: false },
      { text: "#TBP_baocao", isTag: true },
      { text: " nhé", isTag: false },
    ]);
  });

  it("tô màu cả tag đang gõ dở (không nhảy màu ở ký tự cuối)", () => {
    expect(splitTagSegments("#congvie")).toEqual([
      { text: "#congvie", isTag: true },
    ]);
  });

  it("tách được nhiều tag trong một câu", () => {
    const tags = splitTagSegments("#a rồi #b")
      .filter((s) => s.isTag)
      .map((s) => s.text);
    expect(tags).toEqual(["#a", "#b"]);
  });

  it("chuỗi rỗng → không có đoạn nào", () => {
    expect(splitTagSegments("")).toEqual([]);
  });
});

describe("tagBeforeCursor — Backspace xóa trọn tag", () => {
  it("con trỏ ngay sau tag → trả vị trí đầu tag", () => {
    const v = "nộp #TBP_baocao";
    expect(tagBeforeCursor(v, v.length)).toEqual({ start: 4 });
  });

  it("con trỏ giữa tag → xóa từ đầu tag tới con trỏ", () => {
    // "#congviectuan", con trỏ sau "#congvie"
    expect(tagBeforeCursor("#congviectuan", 8)).toEqual({ start: 0 });
  });

  it("sau khoảng trắng → null, để Backspace chạy bình thường", () => {
    expect(tagBeforeCursor("#congviectuan ", 14)).toBeNull();
  });

  it("chữ thường không phải tag → null", () => {
    expect(tagBeforeCursor("báo cáo", 7)).toBeNull();
  });

  it("chỉ mỗi dấu # → null (xóa 1 ký tự là hành vi bình thường)", () => {
    expect(tagBeforeCursor("#", 1)).toBeNull();
  });

  it("con trỏ ở đầu chuỗi → null", () => {
    expect(tagBeforeCursor("#congviectuan", 0)).toBeNull();
  });
});
