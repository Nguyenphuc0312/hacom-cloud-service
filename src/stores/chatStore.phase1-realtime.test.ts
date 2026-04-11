import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType } from "../types";

const { getMessagesMock } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  conversationApi: {
    getConversations: vi.fn(),
  },
  messageApi: {
    getMessages: getMessagesMock,
    markAsRead: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

import { useChatStore } from "./chatStore";

const makeMessage = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: "msg-1",
  conversationId: "room-1",
  senderId: "user-a",
  senderName: "Alice",
  content: "hello",
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  createdAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-04-10T09:00:00.000Z",
  ...overrides,
});

describe("chatStore phase-1 realtime flows", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    getMessagesMock.mockReset();
  });

  it("merges optimistic and server message into one canonical message", () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "temp-1",
        localId: "local-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        sendState: "sending",
        status: MessageStatus.SENDING,
      }) as never,
    );

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "server-1",
        localId: "local-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        sendState: "sent",
        status: MessageStatus.SENT,
      }) as never,
    );

    const messages = useChatStore.getState().messages["room-1"];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("server-1");
    expect(messages[0]?.sendState).toBe("sent");
  });

  it("applies reconnect delta with afterId without duplicating existing messages", async () => {
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }) as never,
    ] as never);

    getMessagesMock
      .mockResolvedValueOnce({
        success: true,
        statusCode: 200,
        message: "ok",
        data: {
          messages: [
            makeMessage({
              id: "msg-1",
              createdAt: "2026-04-10T10:00:00.000Z",
              updatedAt: "2026-04-10T10:00:00.000Z",
            }),
          ],
          hasNext: true,
          hasPrev: false,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        statusCode: 200,
        message: "ok",
        data: {
          messages: [
            makeMessage({
              id: "msg-1",
              createdAt: "2026-04-10T10:00:00.000Z",
              updatedAt: "2026-04-10T10:00:00.000Z",
            }),
            makeMessage({
              id: "msg-2",
              createdAt: "2026-04-10T10:01:00.000Z",
              updatedAt: "2026-04-10T10:01:00.000Z",
              content: "newer",
            }),
          ],
          hasNext: false,
          hasPrev: false,
        },
      });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, { force: true });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, "2026-04-10T10:00:00.000Z", {
        afterId: "msg-1",
        syncReason: "reconnect",
      });

    const messageIds = (useChatStore.getState().messages["room-1"] || []).map(
      (message) => message.id,
    );

    expect(messageIds).toEqual(["msg-1", "msg-2"]);
  });

  it("applies message update and delete patches deterministically", () => {
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        content: "before",
      }) as never,
    ] as never);

    useChatStore.getState().updateMessage("room-1", "msg-1", {
      content: "after",
      isEdited: true,
    });

    let messages = useChatStore.getState().messages["room-1"];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("after");
    expect(messages[0]?.isEdited).toBe(true);

    useChatStore.getState().removeMessage("room-1", "msg-1");

    messages = useChatStore.getState().messages["room-1"];
    expect(messages).toHaveLength(0);
  });
});
