/**
 * Đối chứng: bản `compareMessages` trong chatStore và bản trong
 * `domain/messageOrdering` có cùng hành vi không?
 *
 * Nếu tương đương trên mọi trường hợp dưới đây thì gộp về một nguồn là an toàn.
 * Test này tồn tại để CHỨNG MINH việc gộp, không phải để chạy mãi mãi — nhưng
 * giữ lại cũng vô hại: nó khoá luôn hợp đồng của bản còn lại.
 */
import { describe, expect, it } from "vitest";

import type { Message } from "../types";
import { compareMessages as domainCompare } from "../features/chat/domain/messageOrdering";
import { compareMessages as storeCompare } from "./messageOrdering";

const message = (partial: Partial<Message>): Message =>
  ({ id: "m", ...partial }) as Message;

const cases: Array<[string, Message, Message]> = [
  ["seq khác nhau", message({ id: "a", serverSeq: 1 }), message({ id: "b", serverSeq: 2 })],
  ["một bên thiếu seq", message({ id: "a", serverSeq: 5 }), message({ id: "b" })],
  [
    "cùng seq, khác serverTs",
    message({ id: "a", serverSeq: 1, serverTs: "2026-01-01T00:00:00.000Z" }),
    message({ id: "b", serverSeq: 1, serverTs: "2026-02-01T00:00:00.000Z" }),
  ],
  [
    "hai tin optimistic khác localOrder",
    message({ id: "a", localOrder: 1 }),
    message({ id: "b", localOrder: 2 }),
  ],
  [
    "một bên thiếu localOrder",
    message({ id: "a", localOrder: 1 }),
    message({ id: "b" }),
  ],
  [
    "khác createdAt",
    message({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" as never }),
    message({ id: "b", createdAt: "2026-03-01T00:00:00.000Z" as never }),
  ],
  [
    "chỉ khác stableId",
    message({ id: "a", stableId: "s-a" }),
    message({ id: "b", stableId: "s-b" }),
  ],
  ["chỉ khác id", message({ id: "aaa" }), message({ id: "bbb" })],
  ["giống hệt nhau", message({ id: "a" }), message({ id: "a" })],
];

describe("compareMessages — chatStore vs domain", () => {
  it.each(cases)("cùng kết quả: %s", (_label, left, right) => {
    expect(Math.sign(storeCompare(left, right))).toBe(
      Math.sign(domainCompare(left, right)),
    );
    expect(Math.sign(storeCompare(right, left))).toBe(
      Math.sign(domainCompare(right, left)),
    );
  });

  it("khác biệt DUY NHẤT: bản domain còn đọc `messageSeq` làm seq dự phòng", () => {
    // Đặt id sao cho tie-break theo id đi NGƯỢC với thứ tự theo seq, để tách
    // bạch hai nguyên nhân: nếu chỉ tie-break theo id thì "z" phải đứng sau.
    const withMessageSeq = message({ id: "z", messageSeq: 1 } as never);
    const plain = message({ id: "a" });

    // Bản domain coi messageSeq là seq → tin này đứng TRƯỚC dù id lớn hơn.
    expect(domainCompare(withMessageSeq, plain)).toBeLessThan(0);
    // Bản store bỏ qua messageSeq → rơi xuống tie-break id → đứng SAU.
    expect(storeCompare(withMessageSeq, plain)).toBeGreaterThan(0);
  });
});
