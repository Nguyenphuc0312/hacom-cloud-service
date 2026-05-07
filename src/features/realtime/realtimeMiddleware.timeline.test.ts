import { configureStore } from "@reduxjs/toolkit";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chatApi } from "../api/chatApi";
import { buildConversationMessagesCache } from "../chat/domain/messageMerge";
import {
  realtimeMessageDeleted,
  realtimeMessageReactionChanged,
  realtimeMessageReceived,
  realtimeMessageUpdated,
  realtimeReadCursorUpdated,
  realtimeMiddleware,
} from "./realtimeMiddleware";
import { MessageStatus, MessageType, type Message } from "../../types";
import { useChatStore } from "../../stores";

const createTestStore = () =>
  configureStore({
    reducer: {
      [chatApi.reducerPath]: chatApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(chatApi.middleware, realtimeMiddleware),
  });

type TestStore = ReturnType<typeof createTestStore>;

const createMessage = (
  overrides: Partial<Message> & { id: string; conversationId?: string },
): Message => {
  const { id, ...rest } = overrides;
  return {
    id,
    conversationId: rest.conversationId ?? "room-1",
    senderId: rest.senderId ?? "user-2",
    senderName: rest.senderName ?? "User 2",
    content: rest.content ?? "hello",
    type: rest.type ?? MessageType.TEXT,
    status: rest.status ?? MessageStatus.SENT,
    isEdited: rest.isEdited ?? false,
    isPinned: rest.isPinned ?? false,
    isDeleted: rest.isDeleted ?? false,
    isSystem: rest.isSystem ?? false,
    createdAt:
      rest.createdAt ?? ("2026-01-01T00:00:00.000Z" as unknown as Date),
    ...rest,
  };
};

const seedMessages = async (
  store: TestStore,
  conversationId: string,
  messages: Message[],
) => {
  await store.dispatch(
    chatApi.util.upsertQueryData(
      "getMessages",
      { conversationId },
      buildConversationMessagesCache(conversationId, messages),
    ),
  );
};

const selectMessages = (store: TestStore, conversationId: string): Message[] =>
  chatApi.endpoints.getMessages.select({ conversationId })(store.getState())
    .data?.messages ?? [];

describe("realtimeMiddleware active RTKQ timeline writes", () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    useChatStore.getState().selectConversation(null);
  });

  it("dedupes message:new against an optimistic cache row", async () => {
    await seedMessages(store, "room-1", [
      createMessage({
        id: "temp-client-1",
        conversationId: "room-1",
        clientMessageId: "client-1",
        stableId: "client-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        transportStatus: "optimistic",
      }),
    ]);

    store.dispatch(
      realtimeMessageReceived({
        conversationId: "room-1",
        message: createMessage({
          id: "server-1",
          conversationId: "room-1",
          clientMessageId: "client-1",
          localId: "temp-client-1",
          stableId: "client-1",
          serverSeq: 7,
        }),
      }),
    );

    expect(selectMessages(store, "room-1")).toHaveLength(1);
    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "server-1",
      clientMessageId: "client-1",
      serverSeq: 7,
      sendState: "sent",
    });
  });

  it("patches update, delete, reaction, and read cursor in RTKQ cache", async () => {
    await seedMessages(store, "room-1", [
      createMessage({
        id: "msg-1",
        conversationId: "room-1",
        senderId: "me",
        serverSeq: 1,
        content: "old",
      }),
      createMessage({
        id: "msg-2",
        conversationId: "room-1",
        senderId: "me",
        serverSeq: 2,
        content: "delete me",
      }),
    ]);

    store.dispatch(
      realtimeMessageUpdated({
        conversationId: "room-1",
        message: createMessage({
          id: "msg-1",
          conversationId: "room-1",
          senderId: "me",
          serverSeq: 1,
          content: "edited",
          isEdited: true,
        }),
      }),
    );
    store.dispatch(
      realtimeMessageReactionChanged({
        conversationId: "room-1",
        messageId: "msg-1",
        emoji: "👍",
        userId: "user-2",
        action: "add",
      }),
    );
    store.dispatch(
      realtimeReadCursorUpdated({
        conversationId: "room-1",
        lastReadMessageId: "msg-1",
        lastReadSeq: 1,
        currentUserId: "me",
        readerId: "user-2",
      }),
    );
    store.dispatch(
      realtimeMessageDeleted({
        conversationId: "room-1",
        messageId: "msg-2",
      }),
    );

    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "msg-1",
      content: "edited",
      isEdited: true,
      status: MessageStatus.READ,
      reactions: [{ emoji: "👍", userIds: ["user-2"], count: 1 }],
    });
    expect(selectMessages(store, "room-1")[1]).toMatchObject({
      id: "msg-2",
      content: "",
      isDeleted: true,
      serverSeq: 2,
    });
  });

  it("ignores events for unopened conversations without creating message truth there", () => {
    store.dispatch(
      realtimeMessageReceived({
        conversationId: "room-not-open",
        message: createMessage({
          id: "msg-1",
          conversationId: "room-not-open",
          serverSeq: 1,
        }),
      }),
    );

    expect(selectMessages(store, "room-not-open")).toEqual([]);
  });

  it("seeds the active conversation cache when message:new arrives before the initial query", async () => {
    useChatStore.getState().selectConversation("room-1");

    store.dispatch(
      realtimeMessageReceived({
        conversationId: "room-1",
        message: createMessage({
          id: "msg-live-1",
          conversationId: "room-1",
          serverSeq: 11,
        }),
      }),
    );

    await waitFor(() => {
      expect(selectMessages(store, "room-1")).toHaveLength(1);
    });
    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "msg-live-1",
      serverSeq: 11,
    });
  });
});
