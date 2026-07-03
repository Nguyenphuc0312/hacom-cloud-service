import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chatStore";
import { MessageStatus, MessageType, type Message } from "../types";

const makeMessage = (overrides: Partial<Message>): Message =>
  ({
    id: "msg-1",
    conversationId: "conv-old",
    senderId: "user-1",
    senderName: "User One",
    type: MessageType.TEXT,
    content: "hello",
    createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date,
    timestamp: "2026-01-01T00:00:00.000Z" as unknown as Date,
    status: MessageStatus.SENT,
    sendState: "sent",
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
  }) as Message;

describe("chatStore memory cache bounds", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("trims inactive conversation messages while preserving pending local messages", () => {
    const serverMessages = Array.from({ length: 150 }, (_, index) =>
      makeMessage({
        id: `server-${index + 1}`,
        messageSeq: index + 1,
        createdAt: new Date(2026, 0, 1, 0, 0, index).toISOString() as unknown as Date,
      }),
    );
    const pending = makeMessage({
      id: "temp-client-1",
      localId: "temp-client-1",
      stableId: "client-1",
      clientMessageId: "client-1",
      status: MessageStatus.SENDING,
      sendState: "sending",
      transportStatus: "optimistic",
      createdAt: "2025-01-01T00:00:00.000Z" as unknown as Date,
    });

    useChatStore.getState().setMessages("conv-old", [pending, ...serverMessages]);
    useChatStore.getState().selectConversation("conv-active");

    const state = useChatStore.getState();
    const retainedMessages = state.messages["conv-old"] ?? [];

    expect(retainedMessages).toHaveLength(120);
    expect(retainedMessages.some((message) => message.clientMessageId === "client-1")).toBe(true);
    expect(retainedMessages.some((message) => message.id === "server-1")).toBe(false);
    expect(retainedMessages.some((message) => message.id === "server-150")).toBe(true);
    expect(state.messageIdsByConversation["conv-old"]).toHaveLength(120);
    expect(state.messageById["client-1"]).toBeTruthy();
    expect(state.messageAliasIndexByConversation["conv-old"]["client-1"]).toBeTruthy();
    expect(state.messageWindowByConversation["conv-old"]?.newestLoadedMessageId).toBe("server-150");
  });
});
