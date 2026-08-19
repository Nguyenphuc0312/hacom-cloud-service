import { describe, it, expect } from "vitest";
import type { Message } from "../../types";
import { dedupeByReminderId } from "./ReminderHistoryList";

const card = (
  id: string,
  reminderId: string,
  seq: number,
  isFireNotice?: boolean,
): Message =>
  ({
    id,
    messageSeq: seq,
    metadata: {
      reminder: {
        id: reminderId,
        content: "đi lấy cơm",
        remindAt: "2026-07-16T04:55:00.000Z",
        repeat: "daily",
        creatorId: "u1",
        isCancelled: false,
        isFired: Boolean(isFireNotice),
        participants: [],
        ...(isFireNotice === undefined ? {} : { isFireNotice }),
      },
    },
  }) as unknown as Message;

describe("dedupeByReminderId", () => {
  it("gộp 1 nhắc hẹn lặp thành đúng 1 dòng, giữ card gốc", () => {
    // Bug thật: nhắc hẹn hằng ngày bắn 4 lần -> 5 message REMINDER cùng reminder.id.
    const rows = dedupeByReminderId([
      card("fire4", "r1", 50, true),
      card("fire3", "r1", 40, true),
      card("fire2", "r1", 30, true),
      card("fire1", "r1", 20, true),
      card("origin", "r1", 10, false),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("origin");
  });

  it("giữ các nhắc hẹn khác nhau", () => {
    const rows = dedupeByReminderId([card("a", "r1", 10, false), card("b", "r2", 11, false)]);
    expect(rows).toHaveLength(2);
  });

  it("dữ liệu cũ không có isFireNotice -> giữ card seq nhỏ nhất (bản gốc)", () => {
    const rows = dedupeByReminderId([card("fire", "r1", 40), card("origin", "r1", 10)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("origin");
  });

  it("bỏ qua message không có reminder metadata", () => {
    expect(dedupeByReminderId([{ id: "x", metadata: null } as unknown as Message])).toHaveLength(0);
  });
});
