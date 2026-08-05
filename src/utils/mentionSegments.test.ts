import { describe, expect, it } from "vitest";
import { buildMentionSegments } from "./mentionSegments";
import type { Mention } from "../types";

const mention = (over: Partial<Mention> & { userId: string }): Mention => ({
  displayName: "",
  ...over,
});

describe("buildMentionSegments — đường dò theo tên (tin nhắn cũ)", () => {
  it("cắt được tag khi tên khớp displayName", () => {
    const segments = buildMentionSegments("chào @An Nguyen nhé", [
      mention({ userId: "u1", displayName: "An Nguyen" }),
    ]);

    expect(segments).toEqual([
      { text: "chào " },
      { text: "@An Nguyen", userId: "u1" },
      { text: " nhé" },
    ]);
  });

  it("tên dài thắng tên ngắn (không để '@An' ăn nửa '@An Nguyen')", () => {
    const segments = buildMentionSegments("@An Nguyen ơi", [
      mention({ userId: "u1", displayName: "An" }),
      mention({ userId: "u2", displayName: "An Nguyen" }),
    ]);

    expect(segments[0]).toEqual({ text: "@An Nguyen", userId: "u2" });
  });

  // Đây là bug người dùng báo: BE resolve display_name khác chữ FE đã chèn
  // (message-write.service.ts:117 vs ChatWindow.tsx:1034) → tag mất click.
  it("vẫn nhận ra tag khi chữ trong text khác mentions[].displayName", () => {
    const segments = buildMentionSegments(
      "@Hoàng Hải xem giúp",
      [mention({ userId: "u9", displayName: "Nguyen Hoang Hai" })],
      { u9: ["Hoàng Hải", "hoanghai"] },
    );

    expect(segments).toEqual([
      { text: "@Hoàng Hải", userId: "u9" },
      { text: " xem giúp" },
    ]);
  });

  it("bỏ highlight khi một tên trỏ về hai user (thà trượt còn hơn gán nhầm)", () => {
    const segments = buildMentionSegments("@Minh ơi", [
      mention({ userId: "u1", displayName: "Minh" }),
      mention({ userId: "u2", displayName: "Minh" }),
    ]);

    expect(segments).toEqual([{ text: "@Minh ơi" }]);
  });

  it("@all được đánh dấu riêng, không mang userId", () => {
    const segments = buildMentionSegments("@all họp nhé", [
      mention({ userId: "all", displayName: "all" }),
    ]);

    expect(segments[0]).toEqual({ text: "@all", isAll: true });
  });

  it("không khớp '@All' nằm trong '@Allen'", () => {
    const segments = buildMentionSegments("@Allen chào", [
      mention({ userId: "all", displayName: "all" }),
    ]);

    expect(segments).toEqual([{ text: "@Allen chào" }]);
  });

  it("không có mentions thì trả nguyên văn", () => {
    expect(buildMentionSegments("@ai đó", [])).toEqual([{ text: "@ai đó" }]);
  });

  // Bug người dùng báo 05-08-26: gõ tay "@Huy Hoàng" trong khi BE lưu
  // displayName là tên đầy đủ → tag hiện như chữ thường, không click được.
  it("nhận ra tag gọi bằng phần đuôi tên đầy đủ", () => {
    const segments = buildMentionSegments("… @Huy Hoàng xem nhé.", [
      mention({ userId: "u1", displayName: "Nguyễn Thế Huy Hoàng" }),
    ]);

    expect(segments).toEqual([
      { text: "… " },
      { text: "@Huy Hoàng", userId: "u1" },
      { text: " xem nhé." },
    ]);
  });

  it("hai người cùng đuôi tên → bỏ highlight, không tag nhầm", () => {
    const segments = buildMentionSegments("@Huy Hoàng ơi", [
      mention({ userId: "u1", displayName: "Nguyễn Thế Huy Hoàng" }),
      mention({ userId: "u2", displayName: "Trần Huy Hoàng" }),
    ]);

    expect(segments).toEqual([{ text: "@Huy Hoàng ơi" }]);
  });

  it("tên đầy đủ của người khác thắng đuôi tên", () => {
    const segments = buildMentionSegments("@Huy Hoàng ơi", [
      mention({ userId: "u1", displayName: "Nguyễn Thế Huy Hoàng" }),
      mention({ userId: "u2", displayName: "Huy Hoàng" }),
    ]);

    expect(segments[0]).toEqual({ text: "@Huy Hoàng", userId: "u2" });
  });

  it("đuôi một từ không được nhận (quá dễ trùng)", () => {
    const segments = buildMentionSegments("@Hoàng ơi", [
      mention({ userId: "u1", displayName: "Nguyễn Thế Huy Hoàng" }),
    ]);

    expect(segments).toEqual([{ text: "@Hoàng ơi" }]);
  });
});

describe("buildMentionSegments — đường range (sau khi BE ship)", () => {
  it("cắt theo offset/length, không quan tâm tên có khớp hay không", () => {
    const segments = buildMentionSegments(
      "hi @Bíp bíp nhé",
      [mention({ userId: "u1", displayName: "TÊN HOÀN TOÀN KHÁC", offset: 3, length: 8 })],
    );

    expect(segments).toEqual([
      { text: "hi " },
      { text: "@Bíp bíp", userId: "u1", isAll: false },
      { text: " nhé" },
    ]);
  });

  it("đếm bằng code point nên emoji ngoài BMP không làm lệch tag", () => {
    // "🎉" là 1 code point nhưng 2 UTF-16 unit — dùng String.length sẽ lệch 1.
    const content = "🎉 @Nam ơi";
    const segments = buildMentionSegments(content, [
      mention({ userId: "u1", displayName: "Nam", offset: 2, length: 4 }),
    ]);

    expect(segments[1]).toEqual({ text: "@Nam", userId: "u1", isAll: false });
  });

  it("range ưu tiên hơn dò tên khi có cả hai", () => {
    const segments = buildMentionSegments(
      "@Nam @Nam",
      [mention({ userId: "u1", displayName: "Nam", offset: 5, length: 4 })],
    );

    // Chỉ tag thứ hai (theo range) được nhận, tag đầu là chữ thường.
    expect(segments).toEqual([
      { text: "@Nam " },
      { text: "@Nam", userId: "u1", isAll: false },
    ]);
  });

  it("range chồng lấn → bỏ hẳn đường range, lùi về dò tên", () => {
    const segments = buildMentionSegments("@Nam @Bình", [
      mention({ userId: "u1", displayName: "Nam", offset: 0, length: 6 }),
      mention({ userId: "u2", displayName: "Bình", offset: 3, length: 5 }),
    ]);

    expect(segments).toEqual([
      { text: "@Nam", userId: "u1" },
      { text: " " },
      { text: "@Bình", userId: "u2" },
    ]);
  });

  it("range vượt quá độ dài nội dung → lùi về dò tên", () => {
    const segments = buildMentionSegments("@Nam", [
      mention({ userId: "u1", displayName: "Nam", offset: 0, length: 999 }),
    ]);

    expect(segments).toEqual([{ text: "@Nam", userId: "u1" }]);
  });

  it("@all theo range vẫn là isAll, không bấm được", () => {
    const segments = buildMentionSegments("@all nhé", [
      mention({ userId: "all", displayName: "all", offset: 0, length: 4 }),
    ]);

    expect(segments[0]).toEqual({ text: "@all", userId: undefined, isAll: true });
  });
});
