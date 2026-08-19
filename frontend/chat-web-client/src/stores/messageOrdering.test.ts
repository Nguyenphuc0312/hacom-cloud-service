import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import {
  compareMessages,
  matchesMessage,
  resolveMessageMatchIndex,
  sortMessages,
} from "./messageOrdering";
import { toMessageIdentityKeys } from "../features/chat/domain/messageIdentityMatching";

const message = (partial: Partial<Message>): Message =>
  ({ id: "m1", ...partial }) as Message;

describe("compareMessages — thứ tự timeline", () => {
  it("serverSeq là tiêu chí mạnh nhất", () => {
    const older = message({ id: "a", serverSeq: 1 });
    const newer = message({ id: "b", serverSeq: 2 });
    expect(compareMessages(older, newer)).toBeLessThan(0);
  });

  it("tin đã có serverSeq luôn đứng trước tin chưa có (optimistic)", () => {
    const confirmed = message({ id: "a", serverSeq: 5 });
    const pending = message({ id: "b" });
    expect(compareMessages(confirmed, pending)).toBeLessThan(0);
    expect(compareMessages(pending, confirmed)).toBeGreaterThan(0);
  });

  it("cùng seq thì xét serverTs", () => {
    const a = message({ id: "a", serverSeq: 1, serverTs: "2026-01-01T00:00:00.000Z" });
    const b = message({ id: "b", serverSeq: 1, serverTs: "2026-02-01T00:00:00.000Z" });
    expect(compareMessages(a, b)).toBeLessThan(0);
  });

  it("hai tin optimistic xếp theo localOrder", () => {
    const first = message({ id: "a", localOrder: 1 });
    const second = message({ id: "b", localOrder: 2 });
    expect(compareMessages(first, second)).toBeLessThan(0);
  });

  it("thiếu localOrder thì bị đẩy về cuối, không lên đầu", () => {
    const withOrder = message({ id: "a", localOrder: 1 });
    const withoutOrder = message({ id: "b" });
    expect(compareMessages(withOrder, withoutOrder)).toBeLessThan(0);
  });

  it("trùng mọi mốc vẫn cho thứ tự tất định (không trả 0)", () => {
    const a = message({ id: "aaa", serverSeq: 1 });
    const b = message({ id: "bbb", serverSeq: 1 });
    expect(compareMessages(a, b)).not.toBe(0);
    expect(Math.sign(compareMessages(a, b))).toBe(
      -Math.sign(compareMessages(b, a)),
    );
  });
});

describe("sortMessages", () => {
  it("không làm biến đổi mảng gốc", () => {
    const input = [
      message({ id: "b", serverSeq: 2 }),
      message({ id: "a", serverSeq: 1 }),
    ];
    const snapshot = [...input];
    const sorted = sortMessages(input);

    expect(input).toEqual(snapshot);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("matchesMessage — nhận dạng cùng một tin", () => {
  it("khớp qua stableId", () => {
    expect(
      matchesMessage(
        message({ id: "x", stableId: "s1" }),
        message({ id: "y", stableId: "s1" }),
      ),
    ).toBe(true);
  });

  it("khớp qua clientMessageId (ack thay optimistic)", () => {
    expect(
      matchesMessage(
        message({ id: "temp-1", clientMessageId: "c1" }),
        message({ id: "server-1", clientMessageId: "c1" }),
      ),
    ).toBe(true);
  });

  it("khớp chéo localId ↔ id theo cả hai chiều", () => {
    expect(
      matchesMessage(message({ id: "temp-1" }), message({ id: "s", localId: "temp-1" })),
    ).toBe(true);
    expect(
      matchesMessage(message({ id: "s", localId: "temp-1" }), message({ id: "temp-1" })),
    ).toBe(true);
  });

  it("hai tin khác nhau thì không khớp", () => {
    expect(
      matchesMessage(message({ id: "a" }), message({ id: "b" })),
    ).toBe(false);
  });

  it("undefined không được coi là bằng nhau", () => {
    expect(
      matchesMessage(
        message({ id: "a", stableId: undefined }),
        message({ id: "b", stableId: undefined }),
      ),
    ).toBe(false);
  });
});

describe("resolveMessageMatchIndex", () => {
  const buildIndex = (messages: Message[]): Map<string, number> => {
    const keyToIndex = new Map<string, number>();
    messages.forEach((item, index) => {
      toMessageIdentityKeys(item).forEach((key) => {
        if (!keyToIndex.has(key)) keyToIndex.set(key, index);
      });
    });
    return keyToIndex;
  };

  it("tìm đúng vị trí tin optimistic khi ack về", () => {
    const current = [
      message({ id: "m0", serverSeq: 1 }),
      message({ id: "temp-1", clientMessageId: "c1" }),
    ];
    const index = resolveMessageMatchIndex(
      current,
      buildIndex(current),
      message({ id: "server-1", clientMessageId: "c1" }),
    );
    expect(index).toBe(1);
  });

  it("không có tin tương ứng thì trả -1", () => {
    const current = [message({ id: "m0" })];
    expect(
      resolveMessageMatchIndex(current, buildIndex(current), message({ id: "moi" })),
    ).toBe(-1);
  });
});
