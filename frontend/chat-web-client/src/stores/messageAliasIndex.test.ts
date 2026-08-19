import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import {
  getMessageAliasCandidates,
  getMessageQueueKey,
  getStableMessageId,
  matchesMessageIdentityValue,
  rebuildConversationMessageAliasIndex,
  resolveCanonicalMessageIdentity,
} from "./messageAliasIndex";

const message = (partial: Partial<Message>): Message =>
  ({ id: "m1", ...partial }) as Message;

describe("getMessageAliasCandidates", () => {
  it("gom mọi định danh của một tin, khử trùng lặp", () => {
    const result = getMessageAliasCandidates(
      message({ id: "a", localId: "a", clientMessageId: "c", stableId: "s" }),
    );
    expect(result.sort()).toEqual(["a", "c", "s"]);
  });

  it("bỏ qua giá trị rỗng / không phải chuỗi", () => {
    expect(
      getMessageAliasCandidates(
        message({ id: "a", localId: "", clientMessageId: undefined }),
      ),
    ).toEqual(["a"]);
  });
});

describe("rebuildConversationMessageAliasIndex", () => {
  it("mọi bí danh đều trỏ về cùng một id chuẩn", () => {
    const index = rebuildConversationMessageAliasIndex([
      message({ id: "server-1", localId: "temp-1", stableId: "s1" }),
    ]);
    const canonical = index["server-1"];
    expect(index["temp-1"]).toBe(canonical);
    expect(index["s1"]).toBe(canonical);
  });

  it("danh sách rỗng → index rỗng, không ném lỗi", () => {
    expect(rebuildConversationMessageAliasIndex([])).toEqual({});
  });

  it("tin sau ghi đè bí danh trùng của tin trước", () => {
    const index = rebuildConversationMessageAliasIndex([
      message({ id: "a", stableId: "chung" }),
      message({ id: "b", stableId: "chung" }),
    ]);
    expect(index["chung"]).toBe(getStableMessageId(message({ id: "b", stableId: "chung" })));
  });
});

describe("matchesMessageIdentityValue", () => {
  it("khớp với bất kỳ định danh nào của tin", () => {
    const m = message({
      id: "a",
      localId: "temp",
      clientMessageId: "c",
      stableId: "s",
    });
    for (const identity of ["a", "temp", "c", "s"]) {
      expect(matchesMessageIdentityValue(m, identity)).toBe(true);
    }
  });

  it("chuỗi rỗng không khớp gì cả — tránh khớp nhầm hàng loạt", () => {
    expect(matchesMessageIdentityValue(message({ id: "a" }), "")).toBe(false);
  });

  it("định danh lạ thì không khớp", () => {
    expect(matchesMessageIdentityValue(message({ id: "a" }), "x")).toBe(false);
  });
});

describe("resolveCanonicalMessageIdentity", () => {
  it("tra qua index trước (đường nhanh)", () => {
    expect(
      resolveCanonicalMessageIdentity([], { "temp-1": "server-1" }, "temp-1"),
    ).toBe("server-1");
  });

  it("không có trong index thì quét danh sách", () => {
    const m = message({ id: "server-1", localId: "temp-1", stableId: "s1" });
    expect(
      resolveCanonicalMessageIdentity([m], undefined, "temp-1"),
    ).toBe(getStableMessageId(m));
  });

  it("không tìm thấy thì TRẢ LẠI chính nó, không trả rỗng", () => {
    expect(resolveCanonicalMessageIdentity([], undefined, "la")).toBe("la");
  });

  it("định danh rỗng thì trả nguyên, không đi tra", () => {
    expect(resolveCanonicalMessageIdentity([], { "": "x" }, "")).toBe("");
  });
});

describe("getMessageQueueKey", () => {
  it("khoá gắn với hội thoại — cùng tin ở hai hội thoại là hai khoá", () => {
    const m = message({ id: "a" });
    expect(getMessageQueueKey("c1", m)).not.toBe(getMessageQueueKey("c2", m));
  });

  it("cùng tin trong cùng hội thoại luôn ra cùng khoá", () => {
    const m = message({ id: "a", stableId: "s" });
    expect(getMessageQueueKey("c1", m)).toBe(getMessageQueueKey("c1", m));
  });
});
