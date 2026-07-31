import { describe, expect, it } from "vitest";
import { buildMentionMatch } from "./utils";

/** Caret sits at the end of `text`, which is how typing behaves. */
const atEnd = (text: string) => buildMentionMatch(text, text.length);

describe("buildMentionMatch", () => {
  it("opens the panel wherever @ is typed, including glued to a word", () => {
    // The old prefix rule (space/bracket required before @) silently blocked
    // these, which read to users as "tagging is broken".
    expect(atEnd("@")).not.toBeNull();
    expect(atEnd("bạn @")).not.toBeNull();
    expect(atEnd("bạn@")).not.toBeNull();
    expect(atEnd("abc,@")).not.toBeNull();
    expect(atEnd("a@b.com@")).not.toBeNull();
    expect(atEnd("(@")).not.toBeNull();
  });

  it("opens at the end of a long multi-line message that already has @all", () => {
    const text = [
      "Kính gửi HCNS các Đơn vị @all",
      "- Hiện tại đội phát triển phần mềm đã xử lí và phân quyền tất cả các tính năng.",
      "- VP TCT gửi lại hướng dẫn thực hiện bản PDF (chi tiết ở trên link đã gửi)",
      "- Mọi khó khăn vướng mắc có thể liên hệ trực tiếp bạn @",
    ].join("\n");

    expect(atEnd(text)).toEqual({
      start: text.lastIndexOf("@"),
      end: text.length,
      query: "",
    });
  });

  it("keeps matching while a Vietnamese name is being typed", () => {
    expect(atEnd("bạn @nhậ")?.query).toBe("nhậ");
    expect(atEnd("@Minh")?.query).toBe("Minh");
    expect(atEnd("@ho.va-ten_1")?.query).toBe("ho.va-ten_1");
  });

  it("stops matching once the query runs past a space or newline", () => {
    // Otherwise the panel would stay latched for the rest of the sentence.
    expect(atEnd("@Minh Quốc")).toBeNull();
    expect(atEnd("@Minh\nQuốc")).toBeNull();
  });

  it("matches against the caret, not the end of the text", () => {
    const text = "chào @ nhé";
    expect(buildMentionMatch(text, 6)).toEqual({ start: 5, end: 6, query: "" });
    // Caret before the "@" — nothing to match yet.
    expect(buildMentionMatch(text, 4)).toBeNull();
  });

  it("rejects an out-of-range caret", () => {
    expect(buildMentionMatch("@abc", -1)).toBeNull();
    expect(buildMentionMatch("@abc", 99)).toBeNull();
  });

  it("returns no match when there is no @ before the caret", () => {
    expect(atEnd("không có gì")).toBeNull();
  });
});
