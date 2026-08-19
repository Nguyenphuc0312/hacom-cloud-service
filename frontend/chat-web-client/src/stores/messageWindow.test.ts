import { describe, expect, it } from "vitest";

import { MessageStatus } from "../types";
import type { Message } from "../types";
import {
  MAX_INACTIVE_CONVERSATION_MESSAGES,
  buildConversationMessageWindow,
  isCanonicalConversationMessage,
  isRetriableOrPendingLocalMessage,
  trimInactiveConversationMessages,
} from "./messageWindow";

const message = (partial: Partial<Message>): Message =>
  ({
    id: "m1",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  }) as Message;

describe("isCanonicalConversationMessage", () => {
  it("tin đang gửi / lỗi KHÔNG phải tin chuẩn", () => {
    for (const pending of [
      { sendState: "queued" as never },
      { sendState: "sending" as never },
      { sendState: "retrying" as never },
      { sendState: "failed" as never },
      { status: MessageStatus.SENDING },
      { status: MessageStatus.FAILED },
      { status: "uploading" as never },
    ]) {
      expect(isCanonicalConversationMessage(message(pending))).toBe(false);
    }
  });

  it("tin đã được server xác nhận là tin chuẩn", () => {
    for (const done of [
      { sendState: "sent" as never },
      { status: MessageStatus.SENT },
      { status: MessageStatus.DELIVERED },
      { status: MessageStatus.READ },
    ]) {
      expect(isCanonicalConversationMessage(message(done))).toBe(true);
    }
  });

  it("không rõ trạng thái thì căn cứ id: id tạm = chưa chuẩn", () => {
    expect(isCanonicalConversationMessage(message({ id: "temp-1" }))).toBe(false);
    expect(isCanonicalConversationMessage(message({ id: "server-1" }))).toBe(true);
  });

  it("không có tin thì false, không ném lỗi", () => {
    expect(isCanonicalConversationMessage(null)).toBe(false);
    expect(isCanonicalConversationMessage(undefined)).toBe(false);
  });
});

describe("isRetriableOrPendingLocalMessage", () => {
  it("nhận diện mọi tin còn dở dang phía client", () => {
    for (const local of [
      { id: "temp-1" },
      { transportStatus: "optimistic" as never },
      { sendState: "failed" as never },
      { status: MessageStatus.SENDING },
      { status: "uploading" as never },
    ]) {
      expect(isRetriableOrPendingLocalMessage(message(local))).toBe(true);
    }
  });

  it("tin đã gửi xong thì không phải dở dang", () => {
    expect(
      isRetriableOrPendingLocalMessage(
        message({ id: "server-1", status: MessageStatus.SENT }),
      ),
    ).toBe(false);
  });
});

describe("trimInactiveConversationMessages", () => {
  const many = (count: number, prefix = "m"): Message[] =>
    Array.from({ length: count }, (_, index) =>
      message({
        id: `${prefix}${index}`,
        serverSeq: index + 1,
        status: MessageStatus.SENT,
      }),
    );

  it("dưới ngưỡng thì giữ NGUYÊN tham chiếu, không tạo mảng mới", () => {
    const list = many(10);
    expect(trimInactiveConversationMessages(list)).toBe(list);
  });

  it("vượt ngưỡng thì cắt về đúng giới hạn", () => {
    const list = many(MAX_INACTIVE_CONVERSATION_MESSAGES + 50);
    const result = trimInactiveConversationMessages(list);
    expect(result.length).toBe(MAX_INACTIVE_CONVERSATION_MESSAGES);
  });

  it("cắt phần CŨ, giữ phần mới nhất", () => {
    const list = many(MAX_INACTIVE_CONVERSATION_MESSAGES + 5);
    const result = trimInactiveConversationMessages(list);
    expect(result[result.length - 1].id).toBe(
      list[list.length - 1].id,
    );
    expect(result.some((m) => m.id === "m0")).toBe(false);
  });

  it("KHÔNG BAO GIỜ cắt tin đang gửi dở — user sẽ mất tin", () => {
    const pending = message({
      id: "temp-quan-trong",
      sendState: "sending",
      serverSeq: undefined,
    });
    const list = [...many(MAX_INACTIVE_CONVERSATION_MESSAGES + 50), pending];

    const result = trimInactiveConversationMessages(list);
    expect(result.some((m) => m.id === "temp-quan-trong")).toBe(true);
  });

  it("tin dở dang nhiều hơn ngưỡng thì vẫn giữ hết", () => {
    const pendings = Array.from(
      { length: MAX_INACTIVE_CONVERSATION_MESSAGES + 10 },
      (_, index) => message({ id: `temp-${index}`, sendState: "failed" }),
    );
    const result = trimInactiveConversationMessages(pendings);
    expect(result.length).toBe(pendings.length);
  });
});

describe("buildConversationMessageWindow", () => {
  it("chỉ tính theo tin CHUẨN, bỏ qua tin optimistic", () => {
    const window = buildConversationMessageWindow([
      message({ id: "s1", serverSeq: 1, status: MessageStatus.SENT }),
      message({ id: "s2", serverSeq: 2, status: MessageStatus.SENT }),
      message({ id: "temp-9", sendState: "sending" }),
    ]);
    expect(window.newestLoadedMessageId).toBe("s2");
    expect(window.newestLoadedSeq).toBe(2);
  });

  it("danh sách rỗng → mọi mốc là null, không ném lỗi", () => {
    const window = buildConversationMessageWindow([]);
    expect(window.oldestLoadedMessageId).toBeNull();
    expect(window.newestLoadedMessageId).toBeNull();
  });

  it("không có serverSeq thì KHÔNG gắn field seq", () => {
    const window = buildConversationMessageWindow([
      message({ id: "s1", status: MessageStatus.SENT }),
    ]);
    expect(window).not.toHaveProperty("oldestLoadedSeq");
    expect(window).not.toHaveProperty("newestLoadedSeq");
  });

  it("mốc thời gian được chuẩn hoá về ISO", () => {
    const window = buildConversationMessageWindow([
      message({
        id: "s1",
        status: MessageStatus.SENT,
        createdAt: new Date("2026-03-01T00:00:00.000Z") as never,
      }),
    ]);
    expect(window.oldestLoadedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});
