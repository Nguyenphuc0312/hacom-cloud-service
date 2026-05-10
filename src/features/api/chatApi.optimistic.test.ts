import { describe, expect, it } from "vitest";
import { buildOptimisticMessage } from "./chatApi";
import { MessageType, MessageStatus, type Message } from "../../types";

const baseInput = () => ({
  conversationId: "conv-1",
  clientMessageId: "client-1",
  content: "hello",
  type: MessageType.TEXT,
  senderId: "user-me",
  senderName: "Me",
});

describe("buildOptimisticMessage", () => {
  it("attaches replyToMessage preview from the original message so the bubble renders the quote immediately", () => {
    const original: Message = {
      id: "msg-orig",
      conversationId: "conv-1",
      senderId: "user-A",
      senderName: "Nguyễn Văn A",
      senderAvatar: "https://avatar/a.png",
      content: "Tin nhắn gốc",
      contentFormat: "plain_text",
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      isEdited: false,
      isPinned: false,
      isDeleted: false,
      isSystem: false,
      createdAt: new Date("2024-01-01T00:00:00Z") as unknown as Date,
    };

    const message = buildOptimisticMessage({
      ...baseInput(),
      replyToId: "msg-orig",
      replyToMessage: original,
    });

    expect(message.replyTo).toBe("msg-orig");
    expect(message.replyToMessage).toBeDefined();
    expect(message.replyToMessage?.id).toBe("msg-orig");
    expect(message.replyToMessage?.senderName).toBe("Nguyễn Văn A");
    expect(message.replyToMessage?.content).toBe("Tin nhắn gốc");
    expect(message.replyToMessage?.type).toBe(MessageType.TEXT);
  });

  it("omits replyToMessage when no reply target was provided", () => {
    const message = buildOptimisticMessage(baseInput());
    expect(message.replyTo).toBeUndefined();
    expect(message.replyToMessage).toBeUndefined();
  });

  it("converts mention userIds into placeholder Mention objects", () => {
    const message = buildOptimisticMessage({
      ...baseInput(),
      mentions: ["user-X", "user-Y"],
    });
    expect(message.mentions).toEqual([
      { userId: "user-X", displayName: "" },
      { userId: "user-Y", displayName: "" },
    ]);
  });
});
