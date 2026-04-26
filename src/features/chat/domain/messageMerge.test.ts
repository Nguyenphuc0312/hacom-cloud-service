import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType, type Message } from "../../../types";
import {
  buildConversationMessagesCache,
  mergeIncomingMessagesPage,
  patchDeliveredReceiptInCache,
  upsertMessageInCache,
} from "./messageMerge";

const message = (overrides: Partial<Message>): Message => ({
  id: overrides.id ?? "m-1",
  conversationId: overrides.conversationId ?? "room-1",
  senderId: overrides.senderId ?? "u-1",
  senderName: overrides.senderName ?? "User",
  content: overrides.content ?? "hello",
  type: overrides.type ?? MessageType.TEXT,
  status: overrides.status ?? MessageStatus.SENT,
  isEdited: overrides.isEdited ?? false,
  isPinned: overrides.isPinned ?? false,
  isDeleted: overrides.isDeleted ?? false,
  isSystem: overrides.isSystem ?? false,
  createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("messageMerge domain helpers", () => {
  it("orders messages by serverSeq before createdAt", () => {
    const cache = buildConversationMessagesCache("room-1", [
      message({ id: "m-late", serverSeq: 3, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      message({ id: "m-early", serverSeq: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    ]);

    expect(cache.messages.map((item) => item.id)).toEqual(["m-early", "m-late"]);
  });

  it("dedupes optimistic and server ack by clientMessageId", () => {
    const clientMessageId = "client-1";
    const cache = buildConversationMessagesCache("room-1", [
      message({
        id: "temp-1",
        localId: "temp-1",
        stableId: clientMessageId,
        clientMessageId,
        status: MessageStatus.SENDING,
        sendState: "sending",
      }),
    ]);

    upsertMessageInCache(
      cache,
      message({
        id: "server-1",
        clientMessageId,
        serverSeq: 10,
        status: MessageStatus.SENT,
      }),
    );

    expect(cache.messages).toHaveLength(1);
    expect(cache.messages[0]).toMatchObject({
      id: "server-1",
      clientMessageId,
      sendState: "sent",
    });
  });

  it("prepends older page without duplicating overlap", () => {
    const current = buildConversationMessagesCache("room-1", [
      message({ id: "m-2", serverSeq: 2 }),
      message({ id: "m-3", serverSeq: 3 }),
    ]);

    const next = mergeIncomingMessagesPage(
      current,
      {
        conversationId: "room-1",
        messages: [
          message({ id: "m-1", serverSeq: 1 }),
          message({ id: "m-2", serverSeq: 2 }),
        ],
        hasMoreOlder: true,
      },
      "prepend",
    );

    expect(next.messages.map((item) => item.id)).toEqual(["m-1", "m-2", "m-3"]);
    expect(next.hasMoreOlder).toBe(true);
  });

  it("preserves local pending messages when an initial REST window replaces cache", () => {
    const current = buildConversationMessagesCache("room-1", [
      message({ id: "m-10", serverSeq: 10 }),
      message({
        id: "temp-1",
        localId: "temp-1",
        stableId: "client-1",
        clientMessageId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        transportStatus: "optimistic",
        localOrder: 1,
      }),
    ]);

    const next = mergeIncomingMessagesPage(
      current,
      {
        conversationId: "room-1",
        messages: [message({ id: "m-11", serverSeq: 11 })],
        hasMoreOlder: false,
      },
      "replace",
    );

    expect(next.messages.map((item) => item.id)).toEqual(["m-11", "temp-1"]);
    expect(next.messages[1]).toMatchObject({
      clientMessageId: "client-1",
      sendState: "sending",
    });
  });

  it("patches delivered receipt without downgrading read messages", () => {
    const cache = buildConversationMessagesCache("room-1", [
      message({
        id: "m-1",
        senderId: "me",
        serverSeq: 1,
        status: MessageStatus.SENT,
        sendState: "sent",
      }),
      message({
        id: "m-2",
        senderId: "me",
        serverSeq: 2,
        status: MessageStatus.READ,
        sendState: "sent",
      }),
    ]);

    patchDeliveredReceiptInCache(cache, {
      messageId: "m-1",
      currentUserId: "me",
      deliveredAt: "2026-04-21T09:59:00.000Z",
    });
    patchDeliveredReceiptInCache(cache, {
      messageId: "m-2",
      currentUserId: "me",
      deliveredAt: "2026-04-21T09:59:00.000Z",
    });

    expect(cache.messages[0]).toMatchObject({
      id: "m-1",
      status: MessageStatus.DELIVERED,
      sendState: "sent",
    });
    expect(cache.messages[1]).toMatchObject({
      id: "m-2",
      status: MessageStatus.READ,
    });
  });
});
