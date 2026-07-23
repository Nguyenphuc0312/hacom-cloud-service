import { beforeEach, describe, expect, it } from "vitest";

import { useUIStore } from "../stores/uiStore";
import type { Conversation } from "../types";
import {
  compareConversationsByActivity,
  createConversationActivityComparator,
  sortConversationsByActivity,
} from "./conversationRanking";

const conversation = (
  id: string,
  lastMessageAt: string,
  lastMessageId?: string,
): Conversation =>
  ({
    id,
    lastMessageAt,
    lastMessageId,
  }) as unknown as Conversation;

describe("createConversationActivityComparator", () => {
  it("xếp hội thoại hoạt động gần nhất lên trước", () => {
    const compare = createConversationActivityComparator(new Set());
    const older = conversation("a", "2026-01-01T00:00:00.000Z");
    const newer = conversation("b", "2026-02-01T00:00:00.000Z");

    expect(compare(newer, older)).toBeLessThan(0);
    expect(compare(older, newer)).toBeGreaterThan(0);
  });

  it("hội thoại ghim luôn đứng trước, bất kể thời gian", () => {
    const compare = createConversationActivityComparator(new Set(["old"]));
    const pinnedButOld = conversation("old", "2020-01-01T00:00:00.000Z");
    const freshButUnpinned = conversation("new", "2026-06-01T00:00:00.000Z");

    expect(compare(pinnedButOld, freshButUnpinned)).toBeLessThan(0);
  });

  it("hai hội thoại cùng ghim thì vẫn so theo hoạt động", () => {
    const compare = createConversationActivityComparator(new Set(["a", "b"]));
    const older = conversation("a", "2026-01-01T00:00:00.000Z");
    const newer = conversation("b", "2026-02-01T00:00:00.000Z");

    expect(compare(newer, older)).toBeLessThan(0);
  });

  it("thứ tự ổn định khi trùng mốc thời gian (tie-break theo id)", () => {
    const compare = createConversationActivityComparator(new Set());
    const same = "2026-03-01T00:00:00.000Z";
    const a = conversation("aaa", same);
    const b = conversation("bbb", same);

    // Không bao giờ trả 0 cho hai hội thoại khác nhau → sort tất định.
    expect(compare(a, b)).not.toBe(0);
    expect(Math.sign(compare(a, b))).toBe(-Math.sign(compare(b, a)));
  });

  it("là hàm thuần: cùng input thì cùng kết quả, không đọc store", () => {
    const compare = createConversationActivityComparator(new Set(["a"]));
    const a = conversation("a", "2026-01-01T00:00:00.000Z");
    const b = conversation("b", "2026-02-01T00:00:00.000Z");
    const first = compare(a, b);

    // Đổi store sau khi đã tạo comparator không được ảnh hưởng kết quả.
    useUIStore.setState({ pinnedConversationIds: ["b"] });

    expect(compare(a, b)).toBe(first);
  });
});

describe("compareConversationsByActivity (bản đọc store — giữ tương thích)", () => {
  beforeEach(() => {
    useUIStore.setState({ pinnedConversationIds: [] });
  });

  it("vẫn tôn trọng ghim lấy từ uiStore", () => {
    useUIStore.setState({ pinnedConversationIds: ["old"] });
    const pinnedButOld = conversation("old", "2020-01-01T00:00:00.000Z");
    const freshButUnpinned = conversation("new", "2026-06-01T00:00:00.000Z");

    expect(
      compareConversationsByActivity(pinnedButOld, freshButUnpinned),
    ).toBeLessThan(0);
  });

  it("sortConversationsByActivity không làm biến đổi mảng gốc", () => {
    const input = [
      conversation("a", "2026-01-01T00:00:00.000Z"),
      conversation("b", "2026-02-01T00:00:00.000Z"),
    ];
    const snapshot = [...input];

    const sorted = sortConversationsByActivity(input);

    expect(input).toEqual(snapshot);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("đầu vào không phải mảng thì trả mảng rỗng", () => {
    expect(sortConversationsByActivity(null)).toEqual([]);
    expect(sortConversationsByActivity(undefined)).toEqual([]);
  });
});
