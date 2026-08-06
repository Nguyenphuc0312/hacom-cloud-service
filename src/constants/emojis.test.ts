import { describe, expect, it } from "vitest";
import { EMOJI_CATEGORIES, EXTENDED_REACTIONS, QUICK_REACTIONS } from "./emojis";

/**
 * Bảng emoji là data thuần, typecheck không bắt được lỗi.
 * Đã từng lọt: "🐈‍" (ZWJ treo → glyph vỡ) và nhiều bản trùng trong cùng nhóm.
 *
 * CÁCH ĐO LẠI khi thêm emoji mới (test ở đây không thay được việc mở browser):
 * mở app, chạy trong DevTools console — ô rộng gấp ~2 lần là bị tách rời:
 *
 *   const p = document.createElement("span");
 *   p.style.cssText = "position:absolute;visibility:hidden;font-size:32px";
 *   document.body.appendChild(p);
 *   p.textContent = "😀"; const unit = p.getBoundingClientRect().width;
 *   ["🐈‍⬛","🐕‍🦺"].forEach((e) => {
 *     p.textContent = e;
 *     const w = p.getBoundingClientRect().width;
 *     console.log(w > unit * 1.4 ? "TÁCH RỜI" : "ok", e, w);
 *   });
 */
describe("emoji catalog", () => {
  const allLists = [
    ...EMOJI_CATEGORIES.map((c) => ({ name: c.id, emojis: c.emojis })),
    { name: "quick", emojis: [...QUICK_REACTIONS] },
    { name: "extended", emojis: [...EXTENDED_REACTIONS] },
  ];

  it.each(allLists)("$name: không có ZWJ treo hoặc entry rỗng", ({ emojis }) => {
    const broken = emojis.filter((e) => e.length === 0 || /‍$/.test(e));
    expect(broken).toEqual([]);
  });

  it.each(allLists)("$name: không trùng trong cùng nhóm", ({ emojis }) => {
    const dup = emojis.filter((e, i) => emojis.indexOf(e) !== i);
    expect(dup).toEqual([]);
  });

  it.each(allLists)("$name: mọi entry đều là emoji", ({ emojis }) => {
    const notEmoji = emojis.filter((e) => !/\p{Extended_Pictographic}/u.test(e));
    expect(notEmoji).toEqual([]);
  });

  it.each(allLists)("$name: mỗi entry là MỘT khối liền, không tách rời", ({ emojis }) => {
    const seg = new Intl.Segmenter("vi", { granularity: "grapheme" });
    const split = emojis.filter((e) => [...seg.segment(e)].length !== 1);
    expect(split).toEqual([]);
  });

  /**
   * Chuỗi ZWJ chỉ hiện thành MỘT hình khi trình duyệt thật sự áp được
   * ligature của font. Nhiều chuỗi có ligature trong Noto v35 nhưng Chrome
   * vẫn tách rời — 🐈‍⬛ hiện thành "con mèo + ô vuông đen" đúng như user báo.
   *
   * Danh sách dưới đây là kết quả ĐO THẬT trên browser (e2e đo bề rộng: ô
   * tách rời rộng gấp ~2 lần ô thường), không suy từ phiên bản Unicode.
   * Thêm ZWJ mới thì phải đo lại, đừng đoán.
   */
  it("chỉ dùng chuỗi ZWJ nằm trong danh sách font vẽ được", () => {
    const ALLOWED_ZWJ = ["🐕‍🦺", "🏴‍☠️", "🏳️‍🌈"];
    const used = allLists
      .flatMap((l) => l.emojis)
      .filter((e) => e.includes("‍"));
    expect([...new Set(used)].sort()).toEqual(
      [...new Set(ALLOWED_ZWJ)].sort(),
    );
  });
});
