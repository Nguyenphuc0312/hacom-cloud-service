import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { chatApi } from "../api/chatApi";
import { buildConversationMessagesCache } from "../chat/domain/messageMerge";
import { MessageStatus, MessageType, type Message } from "../../types";
import {
  createRealtimeBatchCoordinator,
  type RealtimeBatchCoordinator,
} from "./realtimeBatchCoordinator";

const ME = "me";
const THEM = "them";

const mk = (conversationId: string, seq: number): Message =>
  ({
    id: `${conversationId}-m${seq}`,
    conversationId,
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
  }) as Message;

const makeStore = () =>
  configureStore({
    reducer: { [chatApi.reducerPath]: chatApi.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(chatApi.middleware),
  });

type Store = ReturnType<typeof makeStore>;

const seedConversation = async (
  store: Store,
  conversationId: string,
  count: number,
) => {
  await store.dispatch(
    chatApi.util.upsertQueryData(
      "getMessages",
      { conversationId },
      buildConversationMessagesCache(
        conversationId,
        Array.from({ length: count }, (_, i) => mk(conversationId, i + 1)),
      ),
    ),
  );
};

const readCache = (store: Store, conversationId: string) =>
  chatApi.endpoints.getMessages.select({ conversationId })(store.getState())
    .data;

describe("createRealtimeBatchCoordinator", () => {
  let store: Store;
  let dispatchCount: number;
  let scheduledCb: (() => void) | null;
  let scheduleCalls: number;
  let coordinator: RealtimeBatchCoordinator;

  const runScheduled = () => {
    const cb = scheduledCb;
    scheduledCb = null;
    cb?.();
  };

  beforeEach(() => {
    store = makeStore();
    dispatchCount = 0;
    scheduledCb = null;
    scheduleCalls = 0;
    const countingDispatch = ((action: unknown) => {
      dispatchCount += 1;
      return (store.dispatch as (a: unknown) => unknown)(action);
    }) as Parameters<typeof createRealtimeBatchCoordinator>[0];
    coordinator = createRealtimeBatchCoordinator(countingDispatch, {
      schedule: (cb) => {
        scheduleCalls += 1;
        scheduledCb = cb;
        return () => {
          scheduledCb = null;
        };
      },
    });
  });

  it("defers all dispatches until the scheduled frame fires", async () => {
    await seedConversation(store, "c1", 100);

    for (let seq = 1; seq <= 50; seq += 1) {
      coordinator.enqueueReadCursor({
        conversationId: "c1",
        currentUserId: ME,
        readerId: THEM,
        lastReadSeq: seq,
      });
    }

    // Nothing applied yet — burst is buffered, only one frame scheduled.
    expect(dispatchCount).toBe(0);
    expect(scheduleCalls).toBe(1);

    runScheduled();

    // 50 read receipts → exactly ONE updateQueryData (one Immer produce / one
    // timeline derivation / one index rebuild) for the conversation.
    expect(dispatchCount).toBe(1);
    const cache = readCache(store, "c1");
    expect(
      cache?.messages.filter((m) => m.status === MessageStatus.READ).length,
    ).toBe(50);
  });

  it("merges delivered, read and reaction into a single flush per conversation", async () => {
    await seedConversation(store, "c1", 10);

    coordinator.enqueueDelivered({
      conversationId: "c1",
      messageId: "c1-m1",
      currentUserId: ME,
    });
    coordinator.enqueueReadCursor({
      conversationId: "c1",
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 5,
    });
    coordinator.enqueueReaction({
      conversationId: "c1",
      messageId: "c1-m2",
      emoji: "🔥",
      userId: "u9",
      action: "add",
    });

    runScheduled();

    expect(dispatchCount).toBe(1);
    const cache = readCache(store, "c1");
    // read (seq<=5) supersedes delivered on m1.
    expect(cache?.messages[0].status).toBe(MessageStatus.READ);
    expect(cache?.messages[1].reactions?.[0]?.emoji).toBe("🔥");
  });

  it("dedupes delivered receipts by messageId (last write wins)", async () => {
    await seedConversation(store, "c1", 3);

    coordinator.enqueueDelivered({
      conversationId: "c1",
      messageId: "c1-m1",
      currentUserId: ME,
      deliveredAt: "2024-01-01T00:00:00.000Z",
    });
    coordinator.enqueueDelivered({
      conversationId: "c1",
      messageId: "c1-m1",
      currentUserId: ME,
      deliveredAt: "2024-01-01T00:00:09.000Z",
    });

    runScheduled();

    expect(dispatchCount).toBe(1);
    expect(readCache(store, "c1")?.messages[0].status).toBe(
      MessageStatus.DELIVERED,
    );
  });

  it("flushes once per conversation when events span multiple conversations", async () => {
    await seedConversation(store, "c1", 5);
    await seedConversation(store, "c2", 5);

    coordinator.enqueueReadCursor({
      conversationId: "c1",
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 5,
    });
    coordinator.enqueueReadCursor({
      conversationId: "c2",
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 5,
    });

    runScheduled();

    // One dispatch per conversation, both in the same frame.
    expect(dispatchCount).toBe(2);
    expect(
      readCache(store, "c1")?.messages.every(
        (m) => m.status === MessageStatus.READ,
      ),
    ).toBe(true);
    expect(
      readCache(store, "c2")?.messages.every(
        (m) => m.status === MessageStatus.READ,
      ),
    ).toBe(true);
  });

  it("flush() applies immediately and cancels the scheduled frame", async () => {
    await seedConversation(store, "c1", 5);
    coordinator.enqueueReadCursor({
      conversationId: "c1",
      currentUserId: ME,
      readerId: THEM,
      lastReadSeq: 5,
    });

    coordinator.flush();
    expect(dispatchCount).toBe(1);

    // The previously scheduled callback is now a no-op (already flushed).
    runScheduled();
    expect(dispatchCount).toBe(1);
  });
});
