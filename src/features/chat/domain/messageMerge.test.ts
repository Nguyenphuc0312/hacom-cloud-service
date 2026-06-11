import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType } from "../../../types";
import type { Message } from "../../../types";
import {
  buildConversationMessagesCache,
  markMessageFailedInCache,
  mergeIncomingMessagesPage,
  upsertMessageInCache,
} from "./messageMerge";

const message = (overrides: Partial<Message>): Message => ({
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "user-1",
  senderName: "Alice",
  content: "hello",
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  sendState: "sent",
  isEdited: false,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: "2026-06-11T00:00:00.000Z" as unknown as Date,
  ...overrides,
});

describe("messageMerge send/retry identity", () => {
  it("updates an optimistic message with the server response without duplicating", () => {
    const cache = buildConversationMessagesCache("conv-1", [
      message({
        id: "temp-client-1",
        localId: "temp-client-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        transportStatus: "optimistic",
      }),
    ]);

    upsertMessageInCache(
      cache,
      message({
        id: "server-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        localId: "temp-client-1",
        messageSeq: 10,
        sendState: "sent",
      }),
    );

    expect(cache.messages).toHaveLength(1);
    expect(cache.messages[0]).toMatchObject({
      id: "server-1",
      clientMessageId: "client-1",
      localId: "temp-client-1",
      sendState: "sent",
      messageSeq: 10,
    });
  });

  it("retries a failed message by updating the same bubble to sending", () => {
    const cache = buildConversationMessagesCache("conv-1", [
      message({
        id: "temp-client-1",
        localId: "temp-client-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.FAILED,
        sendState: "failed",
        failureReason: "timeout",
        errorCode: "REQUEST_TIMEOUT",
        errorMessage: "timeout",
      }),
    ]);

    upsertMessageInCache(
      cache,
      message({
        id: "temp-client-1",
        localId: "temp-client-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        transportStatus: "optimistic",
      }),
    );

    expect(cache.messages).toHaveLength(1);
    expect(cache.messages[0].clientMessageId).toBe("client-1");
    expect(cache.messages[0].sendState).toBe("sending");
    expect(cache.messages[0].status).toBe(MessageStatus.SENDING);
  });

  it("merges sender websocket echo into the same optimistic message", () => {
    const cache = buildConversationMessagesCache("conv-1", [
      message({
        id: "temp-client-1",
        localId: "temp-client-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        transportStatus: "optimistic",
      }),
    ]);

    upsertMessageInCache(
      cache,
      message({
        id: "server-echo-1",
        clientMessageId: "client-1",
        localId: "temp-client-1",
        messageSeq: 12,
        sendState: "sent",
      }),
    );

    expect(cache.messages).toHaveLength(1);
    expect(cache.messages[0].id).toBe("server-echo-1");
    expect(cache.messages[0].messageSeq).toBe(12);
  });

  it("preserves one local failed message across refetch and dedupes once server has the same clientMessageId", () => {
    const failed = message({
      id: "temp-client-1",
      localId: "temp-client-1",
      stableId: "client-1",
      clientMessageId: "client-1",
      status: MessageStatus.FAILED,
      sendState: "failed",
      transportStatus: "optimistic",
    });
    const current = buildConversationMessagesCache("conv-1", [failed]);

    const stillFailed = mergeIncomingMessagesPage(
      current,
      {
        conversationId: "conv-1",
        messages: [message({ id: "server-old", messageSeq: 1 })],
      },
      "replace",
    );

    expect(stillFailed.messages).toHaveLength(2);
    expect(
      stillFailed.messages.filter((item) => item.clientMessageId === "client-1"),
    ).toHaveLength(1);

    const reconciled = mergeIncomingMessagesPage(
      stillFailed,
      {
        conversationId: "conv-1",
        messages: [
          message({ id: "server-old", messageSeq: 1 }),
          message({
            id: "server-1",
            clientMessageId: "client-1",
            localId: "temp-client-1",
            messageSeq: 2,
            sendState: "sent",
          }),
        ],
      },
      "replace",
    );

    expect(reconciled.messages).toHaveLength(2);
    expect(
      reconciled.messages.filter((item) => item.clientMessageId === "client-1"),
    ).toHaveLength(1);
    expect(reconciled.messages.find((item) => item.id === "server-1")).toBeTruthy();
  });

  it("marks a failed message in place by clientMessageId", () => {
    const cache = buildConversationMessagesCache("conv-1", [
      message({
        id: "temp-client-1",
        localId: "temp-client-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
      }),
    ]);

    markMessageFailedInCache(cache, "client-1", {
      message: "network down",
      code: "NETWORK_ERROR",
    });

    expect(cache.messages).toHaveLength(1);
    expect(cache.messages[0]).toMatchObject({
      clientMessageId: "client-1",
      status: MessageStatus.FAILED,
      sendState: "failed",
      errorCode: "NETWORK_ERROR",
      errorMessage: "network down",
    });
  });
});
