import { describe, expect, it } from "vitest";

import type { Conversation } from "../types";
import {
  mergeConversationSummary,
  shouldApplyConversationSummary,
} from "./conversationSummaryMerge";

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({ id: "c1", ...partial }) as Conversation;

describe("shouldApplyConversationSummary", () => {
  it("chưa có bản local thì luôn nhận, đánh dấu 'inserted'", () => {
    const decision = shouldApplyConversationSummary(
      null,
      conversation({ summaryVersion: 5 }),
    );
    expect(decision).toMatchObject({
      apply: true,
      reason: "inserted",
      previousVersion: 0,
      nextVersion: 5,
    });
  });

  it("từ chối bản có version LÙI (response cũ về muộn)", () => {
    const decision = shouldApplyConversationSummary(
      conversation({ summaryVersion: 9 }),
      conversation({ summaryVersion: 4 }),
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe("stale_version");
  });

  it("cùng version nhưng mốc thời gian cũ hơn thì từ chối", () => {
    const decision = shouldApplyConversationSummary(
      conversation({
        summaryVersion: 3,
        lastActivityAt: "2026-05-01T00:00:00.000Z",
      }),
      conversation({
        summaryVersion: 3,
        lastActivityAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBe("stale_timestamp");
  });

  it("nhảy version quá 1 bậc → báo gap để đi resync", () => {
    const decision = shouldApplyConversationSummary(
      conversation({ summaryVersion: 2 }),
      conversation({ summaryVersion: 7 }),
    );
    expect(decision.apply).toBe(true);
    expect(decision.gapDetected).toBe(true);
  });

  it("version liền kề thì KHÔNG coi là gap", () => {
    const decision = shouldApplyConversationSummary(
      conversation({ summaryVersion: 2 }),
      conversation({ summaryVersion: 3 }),
    );
    expect(decision.apply).toBe(true);
    expect(decision.gapDetected).toBe(false);
  });

  it("thiếu version hai bên thì không suy ra gap (tránh resync thừa)", () => {
    const decision = shouldApplyConversationSummary(
      conversation({}),
      conversation({}),
    );
    expect(decision.apply).toBe(true);
    expect(decision.gapDetected).toBe(false);
  });
});

describe("mergeConversationSummary — stale-read guard", () => {
  it("chưa có bản local thì lấy nguyên bản đến", () => {
    const incoming = conversation({ unreadCount: 4 });
    expect(mergeConversationSummary(null, incoming)).toBe(incoming);
  });

  it("local đã đọc xa hơn → KHÔNG cho response cũ đẩy unread ngược lên", () => {
    // Race thật: user mở hội thoại (unread=0, lastReadSeq=186), rồi một
    // GET /conversations cũ trả về unreadCount=17 với checkpoint thấp hơn.
    const merged = mergeConversationSummary(
      conversation({ unreadCount: 0, lastReadSeq: 186 }),
      conversation({ unreadCount: 17, lastReadSeq: 100 }),
    );
    expect(merged.unreadCount).toBe(0);
  });

  it("BIGINT dạng chuỗi từ BE vẫn so sánh đúng", () => {
    const merged = mergeConversationSummary(
      conversation({ unreadCount: 0, lastReadSeq: "186" as never }),
      conversation({ unreadCount: 17, lastReadSeq: "100" as never }),
    );
    expect(merged.unreadCount).toBe(0);
  });

  it("server KHÔNG gửi checkpoint = thiếu dữ liệu, không phải dữ liệu cũ → nhận unread mới", () => {
    const merged = mergeConversationSummary(
      conversation({ unreadCount: 0, lastReadSeq: 186 }),
      conversation({ unreadCount: 3 }),
    );
    expect(merged.unreadCount).toBe(3);
  });

  it("server đọc xa hơn local thì nhận unread từ server", () => {
    const merged = mergeConversationSummary(
      conversation({ unreadCount: 0, lastReadSeq: 100 }),
      conversation({ unreadCount: 5, lastReadSeq: 200 }),
    );
    expect(merged.unreadCount).toBe(5);
  });

  it("lastReadSeq luôn tiến, không bao giờ lùi", () => {
    const merged = mergeConversationSummary(
      conversation({ lastReadSeq: 186 }),
      conversation({ lastReadSeq: 100 }),
    );
    expect(merged.lastReadSeq).toBe(186);
  });

  it("giữ mốc đã đọc của local khi local đi trước", () => {
    const merged = mergeConversationSummary(
      conversation({
        lastReadSeq: 186,
        lastReadMessageId: "m-local",
        lastReadAt: "2026-05-01T00:00:00.000Z",
      }),
      conversation({
        lastReadSeq: 100,
        lastReadMessageId: "m-server",
        lastReadAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(merged.lastReadMessageId).toBe("m-local");
    // normalizeConversation đổi mốc thời gian sang Date, nên so theo giá trị.
    expect(new Date(merged.lastReadAt as never).toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
  });

  it("xoá con trỏ unread đầu tiên khi giữ trạng thái đã đọc của local", () => {
    const merged = mergeConversationSummary(
      conversation({ unreadCount: 0, lastReadSeq: 186 }),
      conversation({
        unreadCount: 17,
        lastReadSeq: 100,
        firstUnreadMessageId: "m-cu",
        firstUnreadMessageAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(merged.firstUnreadMessageId).toBeUndefined();
    expect(merged.firstUnreadMessageAt).toBeUndefined();
  });

  it("trường thường vẫn lấy theo bản đến", () => {
    const merged = mergeConversationSummary(
      conversation({ name: "Tên cũ" }),
      conversation({ name: "Tên mới" }),
    );
    expect(merged.name).toBe("Tên mới");
  });
});
