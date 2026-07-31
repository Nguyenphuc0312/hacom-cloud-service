import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType } from "../../../types";
import type { Message } from "../../../types";
import {
  buildConversationMessagesCache,
  mergeMessageRecords,
  patchMessageInCache,
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

const editedCache = () => {
  const cache = buildConversationMessagesCache("conv-1", [
    message({ id: "server-A", clientMessageId: "client-A", content: "A", messageSeq: 1 }),
  ]);
  patchMessageInCache(cache, "server-A", {
    content: "A-edited",
    isEdited: true,
    editedAt: "2026-06-11T01:00:00.000Z" as unknown as Date,
  });
  return cache;
};

describe("isEdited survives later message events", () => {
  it("is not wiped by a read-receipt upsert that omits the flag", () => {
    const cache = editedCache();
    expect(cache.messages[0].isEdited).toBe(true);

    upsertMessageInCache(
      cache,
      message({
        id: "server-A",
        clientMessageId: "client-A",
        content: "A-edited",
        messageSeq: 1,
        status: MessageStatus.READ,
      }),
    );

    expect(cache.messages[0].isEdited).toBe(true);
    expect(cache.messages[0].editedAt).toBeTruthy();
  });

  it("is not wiped by a reaction upsert that omits the flag", () => {
    const cache = editedCache();

    upsertMessageInCache(
      cache,
      message({
        id: "server-A",
        clientMessageId: "client-A",
        content: "A-edited",
        messageSeq: 1,
        reactions: [{ emoji: "👍", userIds: ["u1"], count: 1 }],
      }),
    );

    expect(cache.messages[0].isEdited).toBe(true);
  });

  it("keeps isEdited and editedAt consistent — never flag-off with a timestamp left behind", () => {
    const current = message({
      id: "server-A",
      isEdited: true,
      editedAt: "2026-06-11T01:00:00.000Z" as unknown as Date,
    });
    const incoming = message({ id: "server-A", status: MessageStatus.READ });

    const merged = mergeMessageRecords(current, incoming);

    expect(merged.isEdited).toBe(true);
    expect(Boolean(merged.editedAt)).toBe(true);
  });

  it("still lets a server payload turn isEdited on", () => {
    const current = message({ id: "server-A" });
    const incoming = message({
      id: "server-A",
      isEdited: true,
      editedAt: "2026-06-11T01:00:00.000Z" as unknown as Date,
    });

    expect(mergeMessageRecords(current, incoming).isEdited).toBe(true);
  });
});
