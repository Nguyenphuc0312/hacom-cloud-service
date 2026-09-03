/**
 * `lastMessage.mentions` phải sống sót qua adapter.
 *
 * Đây là dữ liệu duy nhất cho phép preview sidebar đổi tag `@` sang "tên gợi
 * nhớ" của người xem. Adapter đánh rơi field là preview quay về tên thật —
 * đúng cái lỗi "mới F5 thì sai, có tin mới lại đúng".
 */
import { describe, expect, it } from "vitest";
import { normalizeConversation } from "./conversationAdapter";

const basePayload = {
  id: "conv-1",
  type: "group",
  participants: [],
  updatedAt: "2026-07-30T09:00:00.000Z",
};

const withLastMessage = (mentions: unknown) =>
  normalizeConversation({
    ...basePayload,
    lastMessage: {
      id: "msg-1",
      senderId: "u1",
      senderName: "Đậu Cao Minh Nhật",
      content: "@Nguyễn Minh Quang xem giúp nhé",
      type: "text",
      createdAt: "2026-07-30T09:00:00.000Z",
      mentions,
    },
  });

describe("conversationAdapter — lastMessage.mentions", () => {
  it("giữ mentions do BE trả về", () => {
    const conversation = withLastMessage([
      { userId: "u2", displayName: "Nguyễn Minh Quang" },
    ]);

    expect(conversation?.lastMessage?.mentions).toEqual([
      { userId: "u2", displayName: "Nguyễn Minh Quang" },
    ]);
  });

  // Tin cũ (trước migration 071) không có field này — preview hiện tên thật,
  // đúng bằng mức trước đây, không được vỡ.
  it("thiếu mentions thì bỏ hẳn field, không dựng mảng rỗng", () => {
    expect(withLastMessage(undefined)?.lastMessage).not.toHaveProperty(
      "mentions",
    );
    expect(withLastMessage(null)?.lastMessage).not.toHaveProperty("mentions");
    expect(withLastMessage([])?.lastMessage).not.toHaveProperty("mentions");
  });

  it("bỏ phần tử rác, giữ phần tử dùng được", () => {
    const conversation = withLastMessage([
      "u2",
      null,
      { displayName: "Không có userId" },
      { userId: "u3", displayName: "Vũ Minh Quốc" },
    ]);

    expect(conversation?.lastMessage?.mentions).toEqual([
      { userId: "u3", displayName: "Vũ Minh Quốc" },
    ]);
  });
});

describe("conversationAdapter — lastMessage edit metadata", () => {
  it("giữ edit marker để snapshot cũ không ghi đè preview", () => {
    const conversation = normalizeConversation({
      ...basePayload,
      lastMessage: {
        id: "msg-1",
        senderId: "u1",
        senderName: "Đậu Cao Minh Nhật",
        content: "nội dung đã sửa",
        type: "text",
        createdAt: "2026-07-30T09:00:00.000Z",
        isEdited: true,
        editedAt: "2026-07-30T09:05:00.000Z",
      },
    });

    expect(conversation?.lastMessage?.isEdited).toBe(true);
    expect(
      new Date(conversation?.lastMessage?.editedAt as never).toISOString(),
    ).toBe("2026-07-30T09:05:00.000Z");
  });
});
