import { describe, expect, it } from "vitest";

import type { Conversation } from "../types";
import {
  buildConversationIndexState,
  computeCanonicalTotalUnreadCount,
  computeConversationCursor,
  computeConversationUpdatedAfterCursor,
  getConversationCursorIdentity,
  getConversationCursorTimestamp,
  toConversationVersion,
  toDateValue,
  toFiniteNumber,
} from "./conversationCursor";

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({ id: "c1", ...partial }) as Conversation;

describe("toDateValue", () => {
  it("đọc được Date, chuỗi ISO và số epoch", () => {
    expect(toDateValue(new Date(1000))).toBe(1000);
    expect(toDateValue("2026-03-01T00:00:00.000Z")).toBe(
      Date.parse("2026-03-01T00:00:00.000Z"),
    );
    expect(toDateValue(1234)).toBe(1234);
  });

  it("giá trị không đọc được thì là 0, không NaN", () => {
    for (const bad of ["rac", null, undefined, {}, NaN]) {
      expect(toDateValue(bad)).toBe(0);
    }
  });
});

describe("toFiniteNumber", () => {
  it("chỉ nhận số hữu hạn", () => {
    expect(toFiniteNumber(5)).toBe(5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber("5")).toBeNull();
  });
});

describe("toConversationVersion", () => {
  it("thiếu hoặc không hợp lệ thì coi như 0", () => {
    expect(toConversationVersion(null)).toBe(0);
    expect(toConversationVersion(conversation({}))).toBe(0);
    expect(
      toConversationVersion(conversation({ summaryVersion: NaN })),
    ).toBe(0);
    expect(toConversationVersion(conversation({ summaryVersion: 7 }))).toBe(7);
  });
});

describe("getConversationCursorTimestamp", () => {
  it("lấy mốc lớn nhất trong các trường hoạt động", () => {
    const value = getConversationCursorTimestamp(
      conversation({
        lastMessageSortAt: "2026-01-01T00:00:00.000Z",
        lastActivityAt: "2026-03-01T00:00:00.000Z",
        lastMessageAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    expect(value).toBe(Date.parse("2026-03-01T00:00:00.000Z"));
  });

  it("không có mốc hoạt động nào thì lùi về updatedAt", () => {
    expect(
      getConversationCursorTimestamp(
        conversation({ updatedAt: "2026-05-01T00:00:00.000Z" }),
      ),
    ).toBe(Date.parse("2026-05-01T00:00:00.000Z"));
  });

  it("null / rỗng thì trả 0", () => {
    expect(getConversationCursorTimestamp(null)).toBe(0);
    expect(getConversationCursorTimestamp(conversation({}))).toBe(0);
  });
});

describe("getConversationCursorIdentity", () => {
  it("phân biệt được hai hội thoại cùng mốc thời gian", () => {
    const base = { lastActivityAt: "2026-03-01T00:00:00.000Z" };
    const a = getConversationCursorIdentity(conversation({ ...base, id: "a" }));
    const b = getConversationCursorIdentity(conversation({ ...base, id: "b" }));
    expect(a).not.toBe(b);
  });

  it("đổi version thì đổi identity (phát hiện được dữ liệu mới)", () => {
    const base = { id: "a", lastActivityAt: "2026-03-01T00:00:00.000Z" };
    expect(
      getConversationCursorIdentity(conversation({ ...base, summaryVersion: 1 })),
    ).not.toBe(
      getConversationCursorIdentity(conversation({ ...base, summaryVersion: 2 })),
    );
  });

  it("không có hội thoại thì trả 'unknown', không ném lỗi", () => {
    expect(getConversationCursorIdentity(null)).toBe("unknown");
  });
});

describe("computeConversationCursor", () => {
  it("lấy theo phần tử ĐẦU danh sách (đã sắp sẵn)", () => {
    const first = conversation({ id: "a", lastActivityAt: "2026-01-01T00:00:00.000Z" });
    const second = conversation({ id: "b", lastActivityAt: "2026-09-01T00:00:00.000Z" });
    expect(computeConversationCursor([first, second])).toBe(
      getConversationCursorIdentity(first),
    );
  });

  it("danh sách rỗng thì null", () => {
    expect(computeConversationCursor([])).toBeNull();
  });
});

describe("computeConversationUpdatedAfterCursor", () => {
  it("lấy mốc MỚI NHẤT trong cả danh sách, không phụ thuộc thứ tự", () => {
    const result = computeConversationUpdatedAfterCursor([
      conversation({ id: "a", lastActivityAt: "2026-01-01T00:00:00.000Z" }),
      conversation({ id: "b", lastActivityAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(result).toBe("2026-09-01T00:00:00.000Z");
  });

  it("không có mốc nào hợp lệ thì null", () => {
    expect(computeConversationUpdatedAfterCursor([])).toBeNull();
    expect(
      computeConversationUpdatedAfterCursor([conversation({})]),
    ).toBeNull();
  });
});

describe("computeCanonicalTotalUnreadCount", () => {
  it("cộng dồn unread, bỏ qua giá trị âm", () => {
    expect(
      computeCanonicalTotalUnreadCount([
        conversation({ id: "a", unreadCount: 3 }),
        conversation({ id: "b", unreadCount: -5 }),
        conversation({ id: "c" }),
        conversation({ id: "d", unreadCount: 2 }),
      ]),
    ).toBe(5);
  });
});

describe("buildConversationIndexState", () => {
  it("dựng index tra cứu O(1) và giữ nguyên thứ tự id", () => {
    const list = [conversation({ id: "a" }), conversation({ id: "b" })];
    const state = buildConversationIndexState(list);
    expect(state.orderedConversationIds).toEqual(["a", "b"]);
    expect(state.conversationById.a).toBe(list[0]);
  });
});
