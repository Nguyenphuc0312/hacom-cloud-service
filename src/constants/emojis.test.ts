import { describe, expect, it } from "vitest";
import { EMOJI_CATEGORIES, EXTENDED_REACTIONS, QUICK_REACTIONS } from "./emojis";

/**
 * Bảng emoji là data thuần, typecheck không bắt được lỗi.
 * Đã từng lọt: "🐈‍" (ZWJ treo → glyph vỡ) và nhiều bản trùng trong cùng nhóm.
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
});
