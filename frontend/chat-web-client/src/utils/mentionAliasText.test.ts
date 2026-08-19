import { describe, expect, it } from "vitest";
import type { Mention } from "../types";
import { applyMentionAliases, parseMentionDetails } from "./mentionAliasText";

const mention = (userId: string, displayName: string): Mention =>
  ({ userId, displayName }) as Mention;

describe("applyMentionAliases", () => {
  it("đổi tag sang tên gợi nhớ, giữ nguyên phần chữ còn lại", () => {
    expect(
      applyMentionAliases(
        "@Nguyễn Minh Quang xem giúp nhé",
        [mention("u1", "Nguyễn Minh Quang")],
        { u1: "Sếp deadline" },
      ),
    ).toBe("@Sếp deadline xem giúp nhé");
  });

  it("chỉ đổi người CÓ alias, người khác giữ tên thật", () => {
    expect(
      applyMentionAliases(
        "@Nguyễn Minh Quang @Vũ Minh Quốc họp nhé",
        [mention("u1", "Nguyễn Minh Quang"), mention("u2", "Vũ Minh Quốc")],
        { u1: "Sếp deadline" },
      ),
    ).toBe("@Sếp deadline @Vũ Minh Quốc họp nhé");
  });

  it("không alias thì trả về đúng nguyên văn", () => {
    const content = "@Nguyễn Minh Quang xem giúp nhé";
    const mentions = [mention("u1", "Nguyễn Minh Quang")];
    expect(applyMentionAliases(content, mentions, {})).toBe(content);
    expect(applyMentionAliases(content, mentions, { u1: "   " })).toBe(content);
    expect(applyMentionAliases(content, undefined, { u1: "Sếp" })).toBe(content);
  });

  it("@all không bị đụng tới dù người xem có alias", () => {
    expect(
      applyMentionAliases(
        "@all và @Nguyễn Minh Quang",
        [mention("all", "all"), mention("u1", "Nguyễn Minh Quang")],
        { u1: "Sếp deadline" },
      ),
    ).toBe("@all và @Sếp deadline");
  });

  it("dùng range khi BE ship offset/length — đếm theo code point", () => {
    // "🎉 " = 1 code point (emoji) + dấu cách ⇒ tag bắt đầu ở 2, dài 18.
    // Đếm bằng String.length thì emoji tính thành 2 ⇒ lệch một nhịp, cắt vỡ chữ.
    const ranged = {
      ...mention("u1", "Nguyễn Minh Quang"),
      offset: 2,
      length: 18,
    } as Mention;
    expect(
      applyMentionAliases("🎉 @Nguyễn Minh Quang ơi", [ranged], {
        u1: "Sếp deadline",
      }),
    ).toBe("🎉 @Sếp deadline ơi");
  });

  it("range không bao gồm '@' thì không sinh ra '@@'", () => {
    // BE có thể đánh dấu range trỏ NGAY SAU '@' (chỉ phần tên).
    const ranged = {
      ...mention("u1", "Nguyễn Minh Quang"),
      offset: 1,
      length: 17,
    } as Mention;
    expect(
      applyMentionAliases("@Nguyễn Minh Quang ơi", [ranged], {
        u1: "Sếp deadline",
      }),
    ).toBe("@Sếp deadline ơi");
  });
});

describe("parseMentionDetails", () => {
  it("giữ object có userId, bỏ userId thuần và rác", () => {
    expect(
      parseMentionDetails([
        { userId: "u1", displayName: "A" },
        "u2",
        null,
        { displayName: "không có userId" },
        { userId: "  " },
      ]),
    ).toEqual([{ userId: "u1", displayName: "A" }]);
  });

  it("dữ liệu không phải mảng thì trả mảng rỗng", () => {
    expect(parseMentionDetails(undefined)).toEqual([]);
    expect(parseMentionDetails({ userId: "u1" })).toEqual([]);
  });
});
