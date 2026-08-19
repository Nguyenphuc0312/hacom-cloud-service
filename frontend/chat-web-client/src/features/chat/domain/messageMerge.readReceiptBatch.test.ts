import { describe, it, expect } from "vitest";
import { MessageStatus, MessageType, type Message } from "../../../types";
import {
  applyDeliveredReceiptMutation,
  applyReactionMutation,
  applyReadCursorMutations,
  buildConversationMessagesCache,
  patchReadCursorInCache,
  refreshCacheIndex,
} from "./messageMerge";

const ME = "me";
const THEM = "them";
const CONV = "c1";

const mk = (
  seq: number,
  overrides: Partial<Message> = {},
): Message =>
  ({
    id: `m${seq}`,
    conversationId: CONV,
    senderId: ME,
    senderName: ME,
    type: MessageType.TEXT,
    content: `msg ${seq}`,
    timestamp: new Date(2024, 0, 1, 0, 0, seq),
    createdAt: new Date(2024, 0, 1, 0, 0, seq),
    serverSeq: seq,
    messageSeq: seq,
    status: MessageStatus.SENT,
    sendState: "sent",
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    isSystem: false,
    ...overrides,
  }) as Message;

describe("read cursor batching (O(n) single-pass)", () => {
  it("marks all own messages up to lastReadSeq as READ in one pass", () => {
    const cache = buildConversationMessagesCache(
      CONV,
      Array.from({ length: 500 }, (_, i) => mk(i + 1)),
    );

    const changed = patchReadCursorInCache(cache, {
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 300,
    });

    expect(changed).toBe(true);
    const readCount = cache.messages.filter(
      (m) => m.status === MessageStatus.READ,
    ).length;
    expect(readCount).toBe(300);
    // Beyond the cursor stays untouched.
    expect(cache.messages[300].status).toBe(MessageStatus.SENT);
  });

  it("keeps messageById index consistent after a batch read cursor", () => {
    const cache = buildConversationMessagesCache(
      CONV,
      Array.from({ length: 50 }, (_, i) => mk(i + 1)),
    );

    patchReadCursorInCache(cache, {
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 20,
    });

    // The index must point at the SAME (mutated) objects in the array — proves
    // refreshCacheIndex ran after the mutations, not before.
    for (let i = 0; i < 20; i += 1) {
      const msg = cache.messages[i];
      expect(cache.messageById[msg.id]).toBe(msg);
      expect(cache.messageById[msg.id].status).toBe(MessageStatus.READ);
    }
  });

  it("applyReadCursorMutations mutates without refreshing the index", () => {
    const cache = buildConversationMessagesCache(
      CONV,
      Array.from({ length: 10 }, (_, i) => mk(i + 1)),
    );
    const indexBefore = cache.messageById["m1"];

    const changed = applyReadCursorMutations(cache, {
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 5,
    });

    expect(changed).toBe(true);
    // Array element was replaced …
    expect(cache.messages[0].status).toBe(MessageStatus.READ);
    // … but the stale index still references the pre-mutation object.
    expect(cache.messageById["m1"]).toBe(indexBefore);
    expect(cache.messageById["m1"].status).toBe(MessageStatus.SENT);

    refreshCacheIndex(cache);
    expect(cache.messageById["m1"].status).toBe(MessageStatus.READ);
  });

  it("does not touch the reader's own messages or messages already READ", () => {
    const cache = buildConversationMessagesCache(CONV, [
      mk(1, { status: MessageStatus.READ }),
      mk(2),
      mk(3, { senderId: THEM, senderName: THEM }),
    ]);

    const changed = applyReadCursorMutations(cache, {
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 3,
    });

    expect(changed).toBe(true);
    expect(cache.messages[0].status).toBe(MessageStatus.READ); // unchanged
    expect(cache.messages[1].status).toBe(MessageStatus.READ); // newly marked
    // The other party's message is never marked read-by-them in our timeline.
    expect(cache.messages[2].status).toBe(MessageStatus.SENT);
  });

  it("returns false (no refresh) when nothing matches", () => {
    const cache = buildConversationMessagesCache(CONV, [
      mk(1, { senderId: THEM, senderName: THEM }),
    ]);
    expect(
      applyReadCursorMutations(cache, {
        currentUserId: ME,
        readerId: THEM,
        lastReadSeq: 99,
      }),
    ).toBe(false);
  });
});

describe("delivered receipt mutation", () => {
  it("marks a sent own-message DELIVERED but never a failed/sending one", () => {
    const cache = buildConversationMessagesCache(CONV, [
      mk(1),
      mk(2, { status: MessageStatus.FAILED, sendState: "failed" }),
      mk(3, { status: MessageStatus.SENDING, sendState: "sending" }),
    ]);

    expect(
      applyDeliveredReceiptMutation(cache, {
        messageId: "m1",
        currentUserId: ME,
      }),
    ).toBe(true);
    expect(cache.messages[0].status).toBe(MessageStatus.DELIVERED);

    expect(
      applyDeliveredReceiptMutation(cache, {
        messageId: "m2",
        currentUserId: ME,
      }),
    ).toBe(false);
    expect(cache.messages[1].status).toBe(MessageStatus.FAILED);

    expect(
      applyDeliveredReceiptMutation(cache, {
        messageId: "m3",
        currentUserId: ME,
      }),
    ).toBe(false);
  });
});

describe("reaction mutation", () => {
  it("adds a reaction and is idempotent for duplicate adds", () => {
    const cache = buildConversationMessagesCache(CONV, [mk(1)]);

    expect(
      applyReactionMutation(cache, { messageId: "m1", emoji: "👍", userId: "u1" }, "add"),
    ).toBe(true);
    expect(cache.messages[0].reactions?.[0]?.emoji).toBe("👍");

    // Duplicate add by the same user → no change → returns false (no churn).
    expect(
      applyReactionMutation(cache, { messageId: "m1", emoji: "👍", userId: "u1" }, "add"),
    ).toBe(false);
  });
});
