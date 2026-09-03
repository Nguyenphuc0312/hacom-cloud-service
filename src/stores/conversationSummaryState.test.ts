import { describe, expect, it } from "vitest";

import { MessageStatus } from "../types";
import type { Conversation, Message } from "../types";
import {
  applyConversationReadState,
  buildEditedLastMessagePreviewPatch,
  buildHydratedEditedLastMessagePreviewPatch,
  toConversationLastMessageStatus,
  toMessageSummary,
  updateConversationActivitySummary,
  updateConversationReadProgress,
} from "./conversationSummaryState";

const message = (partial: Partial<Message>): Message =>
  ({
    id: "m1",
    senderId: "u1",
    content: "hi",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  }) as Message;

const conversation = (partial: Partial<Conversation> = {}): Conversation =>
  ({ id: "c1", ...partial }) as Conversation;

describe("buildEditedLastMessagePreviewPatch", () => {
  const lastMessage = {
    id: "m1",
    senderId: "u1",
    senderName: "Nhật",
    content: "nội dung cũ",
    type: "text",
    isDeleted: false,
    createdAt: "2026-03-01T00:00:00.000Z",
  } as Conversation["lastMessage"];

  it("đổi preview nếu tin vừa sửa là tin cuối", () => {
    const patch = buildEditedLastMessagePreviewPatch(
      conversation({
        lastMessage,
        lastMessageId: "m1",
        unreadCount: 4,
        lastMessageAt: "2026-03-01T00:00:00.000Z",
      }),
      message({ id: "m1", content: "nội dung mới" }),
    );

    expect(patch).toEqual({
      lastMessage: {
        ...lastMessage,
        content: "nội dung mới",
        isEdited: true,
      },
    });
    expect(Object.keys(patch ?? {})).toEqual(["lastMessage"]);
  });

  it("nhận diện được id server qua bí danh của tin", () => {
    const patch = buildEditedLastMessagePreviewPatch(
      conversation({ lastMessage, lastMessageId: "m1" }),
      message({ id: "temp-m1", stableId: "m1", content: "đã sửa" }),
    );

    expect(patch?.lastMessage?.content).toBe("đã sửa");
  });

  it("không đổi preview nếu sửa một tin cũ hơn", () => {
    expect(
      buildEditedLastMessagePreviewPatch(
        conversation({ lastMessage, lastMessageId: "m1" }),
        message({ id: "m0", content: "tin cũ đã sửa" }),
      ),
    ).toBeNull();
  });
});

describe("buildHydratedEditedLastMessagePreviewPatch", () => {
  const lastMessage = {
    id: "m2",
    senderId: "u1",
    senderName: "Nhật",
    content: "preview cũ từ conversation API",
    type: "text",
    isDeleted: false,
    createdAt: "2026-03-01T00:00:00.000Z",
  } as Conversation["lastMessage"];

  it("hydrate lại preview từ timeline authoritative sau reload", () => {
    const patch = buildHydratedEditedLastMessagePreviewPatch(
      conversation({ lastMessage, lastMessageId: "m2" }),
      [
        message({ id: "m1", content: "tin trước" }),
        message({
          id: "m2",
          content: "nội dung đã sửa",
          isEdited: true,
          editedAt: "2026-03-01T00:05:00.000Z" as never,
        }),
      ],
    );

    expect(patch?.lastMessage).toMatchObject({
      id: "m2",
      content: "nội dung đã sửa",
      isEdited: true,
    });
  });

  it("không đánh dấu edited nếu timeline không có edit marker", () => {
    expect(
      buildHydratedEditedLastMessagePreviewPatch(
        conversation({ lastMessage, lastMessageId: "m2" }),
        [message({ id: "m2", content: "tin thường" })],
      ),
    ).toBeNull();
  });

  it("không dùng nhầm tin khác identity dù nó nằm cuối cache", () => {
    expect(
      buildHydratedEditedLastMessagePreviewPatch(
        conversation({ lastMessage, lastMessageId: "m2" }),
        [message({ id: "m3", content: "edit tin khác", isEdited: true })],
      ),
    ).toBeNull();
  });
});

describe("toMessageSummary", () => {
  it("chỉ mang các trường cần cho preview sidebar", () => {
    const summary = toMessageSummary(
      message({ id: "m9", senderName: "Nhật", type: "text" as never }),
    );
    expect(summary).toMatchObject({ id: "m9", senderName: "Nhật" });
  });

  it("không gắn sendState/status khi tin không có", () => {
    const summary = toMessageSummary(message({}));
    expect(summary).not.toHaveProperty("sendState");
    expect(summary).not.toHaveProperty("status");
  });
});

describe("toConversationLastMessageStatus", () => {
  it("không có tin thì null", () => {
    expect(toConversationLastMessageStatus(null)).toBeNull();
    expect(toConversationLastMessageStatus(undefined)).toBeNull();
  });

  it("tin đã thu hồi/xoá thì KHÔNG hiện trạng thái gửi", () => {
    for (const deleted of [
      { isDeleted: true },
      { lifecycleStatus: "recalled" as never },
      { lifecycleStatus: "deleted_admin" as never },
    ]) {
      expect(toConversationLastMessageStatus(message(deleted))).toBeNull();
    }
  });

  it("thất bại → 'failed'", () => {
    expect(
      toConversationLastMessageStatus(message({ sendState: "failed" })),
    ).toBe("failed");
    expect(
      toConversationLastMessageStatus(
        message({ status: MessageStatus.FAILED }),
      ),
    ).toBe("failed");
  });

  it("đang gửi/xếp hàng/thử lại/upload đều là 'pending'", () => {
    for (const pending of [
      { sendState: "queued" as never },
      { sendState: "sending" as never },
      { sendState: "retrying" as never },
      { status: MessageStatus.SENDING },
      { status: "uploading" as never },
    ]) {
      expect(toConversationLastMessageStatus(message(pending))).toBe("pending");
    }
  });

  it("bình thường thì 'sent'", () => {
    expect(toConversationLastMessageStatus(message({}))).toBe("sent");
  });

  it("đã xoá thắng cả trạng thái thất bại", () => {
    expect(
      toConversationLastMessageStatus(
        message({ isDeleted: true, sendState: "failed" }),
      ),
    ).toBeNull();
  });
});

describe("updateConversationActivitySummary", () => {
  it("đẩy mọi mốc hoạt động theo tin mới nhất", () => {
    const result = updateConversationActivitySummary(
      conversation(),
      message({ id: "m9", createdAt: "2026-05-01T00:00:00.000Z" }),
      3,
    );
    expect(result.lastMessageId).toBe("m9");
    expect(result.unreadCount).toBe(3);
  });

  it("tin đã thu hồi thì xoá trạng thái gửi khỏi preview", () => {
    const result = updateConversationActivitySummary(
      conversation(),
      message({ isDeleted: true }),
      0,
    );
    expect(result.lastMessageStatus).toBeNull();
  });

  it("tin gửi lỗi thì preview báo 'failed'", () => {
    const result = updateConversationActivitySummary(
      conversation(),
      message({ sendState: "failed" }),
      0,
    );
    expect(result.lastMessageStatus).toBe("failed");
  });

  it("tin ĐANG gửi vẫn là 'sent', KHÔNG phải 'pending'", () => {
    // Khác biệt có chủ ý so với `toConversationLastMessageStatus`: preview
    // sidebar không nhấp nháy trong lúc chờ ack. Test này khoá lại khác biệt
    // đó — đừng gộp hai nhánh mà không cân nhắc.
    const result = updateConversationActivitySummary(
      conversation(),
      message({ sendState: "sending" }),
      0,
    );
    expect(result.lastMessageStatus).toBe("sent");
    expect(toConversationLastMessageStatus(message({ sendState: "sending" }))).toBe(
      "pending",
    );
  });
});

describe("updateConversationReadProgress", () => {
  it("đánh dấu đã đọc thì unread về 0 và xoá con trỏ tin chưa đọc", () => {
    const result = updateConversationReadProgress(
      conversation({ unreadCount: 9, firstUnreadMessageId: "m1" }),
      "m5",
    );
    expect(result.unreadCount).toBe(0);
    expect(result.firstUnreadMessageId).toBeNull();
  });

  it("lastReadSeq chỉ TIẾN, không lùi", () => {
    const result = updateConversationReadProgress(
      conversation({ lastReadSeq: 100 }),
      "m5",
      null,
      50,
    );
    expect(result.lastReadSeq).toBe(100);
  });

  it("seq mới lớn hơn thì nhận", () => {
    const result = updateConversationReadProgress(
      conversation({ lastReadSeq: 100 }),
      "m5",
      null,
      200,
    );
    expect(result.lastReadSeq).toBe(200);
  });
});

describe("applyConversationReadState", () => {
  it("unread âm bị kẹp về 0", () => {
    const result = applyConversationReadState(conversation(), {
      unreadCount: -5,
      lastReadMessageId: null,
      lastReadAt: null,
    });
    expect(result.unreadCount).toBe(0);
  });

  it("còn tin chưa đọc thì GIỮ con trỏ tin chưa đọc đầu tiên", () => {
    const result = applyConversationReadState(
      conversation({ firstUnreadMessageId: "m3" }),
      { unreadCount: 4, lastReadMessageId: null, lastReadAt: null },
    );
    expect(result.firstUnreadMessageId).toBe("m3");
  });

  it("đã đọc hết thì XOÁ con trỏ tin chưa đọc", () => {
    const result = applyConversationReadState(
      conversation({ firstUnreadMessageId: "m3" }),
      { unreadCount: 0, lastReadMessageId: null, lastReadAt: null },
    );
    expect(result.firstUnreadMessageId).toBeNull();
  });
});
