import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatApi } from "./chatApi";
import { realtimeMiddleware, realtimeMessageReceived } from "../realtime/realtimeMiddleware";
import { buildConversationMessagesCache } from "../chat/domain/messageMerge";
import { MessageStatus, MessageType, type Message } from "../../types";

const apiMocks = vi.hoisted(() => ({
  addReaction: vi.fn(),
  deleteMessage: vi.fn(),
  editMessage: vi.fn(),
  getMessageById: vi.fn(),
  getMessages: vi.fn(),
  removeReaction: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  conversationApi: {
    getConversations: vi.fn(),
    getConversationById: vi.fn(),
    markAsRead: vi.fn(),
    getUnreadSummary: vi.fn(),
  },
  messageApi: {
    addReaction: apiMocks.addReaction,
    deleteMessage: apiMocks.deleteMessage,
    editMessage: apiMocks.editMessage,
    getMessageById: apiMocks.getMessageById,
    getMessages: apiMocks.getMessages,
    removeReaction: apiMocks.removeReaction,
    searchMessages: vi.fn(),
    sendMessage: apiMocks.sendMessage,
  },
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      [chatApi.reducerPath]: chatApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(chatApi.middleware, realtimeMiddleware),
  });

type TestStore = ReturnType<typeof createTestStore>;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
};

const apiSuccess = <T,>(data: T) => ({
  success: true as const,
  data,
});

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

const flushMicrotasks = () => Promise.resolve();

describe("chatApi active timeline cache boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("inserts an optimistic send into RTKQ cache and replaces the ack without duplicating", async () => {
    const store = createTestStore();
    const ack = createDeferred<ReturnType<typeof apiSuccess<Message>>>();
    const serverMessage = createMessage({
      id: "server-1",
      conversationId: "room-1",
      clientMessageId: "client-1",
      localId: "temp-client-1",
      stableId: "client-1",
      serverSeq: 10,
      content: "hello",
    });
    apiMocks.sendMessage.mockReturnValueOnce(ack.promise);
    await seedMessages(store, "room-1", []);

    const mutation = store.dispatch(
      chatApi.endpoints.sendMessage.initiate({
        conversationId: "room-1",
        clientMessageId: "client-1",
        localId: "temp-client-1",
        content: "hello",
        type: MessageType.TEXT,
        senderId: "user-1",
        senderName: "Me",
      }),
    );
    await flushMicrotasks();

    expect(selectMessages(store, "room-1")).toMatchObject([
      {
        id: "temp-client-1",
        clientMessageId: "client-1",
        sendState: "sending",
        transportStatus: "optimistic",
      },
    ]);

    ack.resolve(apiSuccess(serverMessage));
    await mutation.unwrap();

    expect(selectMessages(store, "room-1")).toHaveLength(1);
    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "server-1",
      clientMessageId: "client-1",
      sendState: "sent",
      serverSeq: 10,
    });
  });

  it("dedupes websocket delivery for the same optimistic/server message identity", async () => {
    const store = createTestStore();
    const serverMessage = createMessage({
      id: "server-1",
      conversationId: "room-1",
      clientMessageId: "client-1",
      localId: "temp-client-1",
      stableId: "client-1",
      serverSeq: 10,
    });
    await seedMessages(store, "room-1", [
      createMessage({
        id: "temp-client-1",
        conversationId: "room-1",
        clientMessageId: "client-1",
        stableId: "client-1",
        sendState: "sending",
        transportStatus: "optimistic",
        status: MessageStatus.SENDING,
      }),
    ]);

    store.dispatch(
      realtimeMessageReceived({
        conversationId: "room-1",
        message: serverMessage,
      }),
    );

    expect(selectMessages(store, "room-1")).toHaveLength(1);
    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "server-1",
      clientMessageId: "client-1",
      serverSeq: 10,
    });
  });

  it("patches edit and delete in the active RTKQ timeline without touching another conversation", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({ id: "msg-1", conversationId: "room-1", serverSeq: 1 }),
    ]);
    await seedMessages(store, "room-2", [
      createMessage({
        id: "msg-2",
        conversationId: "room-2",
        serverSeq: 1,
        content: "unchanged",
      }),
    ]);
    apiMocks.editMessage.mockResolvedValueOnce(
      apiSuccess(
        createMessage({
          id: "msg-1",
          conversationId: "room-1",
          serverSeq: 1,
          content: "edited",
          isEdited: true,
        }),
      ),
    );
    apiMocks.deleteMessage.mockResolvedValueOnce(apiSuccess(undefined));

    await store
      .dispatch(
        chatApi.endpoints.editMessage.initiate({
          conversationId: "room-1",
          messageId: "msg-1",
          content: "edited",
        }),
      )
      .unwrap();
    await store
      .dispatch(
        chatApi.endpoints.deleteMessage.initiate({
          conversationId: "room-1",
          messageId: "msg-1",
          mode: "FOR_ME",
        }),
      )
      .unwrap();

    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      id: "msg-1",
      content: "",
      isDeleted: true,
      serverSeq: 1,
    });
    expect(selectMessages(store, "room-2")[0]).toMatchObject({
      id: "msg-2",
      content: "unchanged",
      isDeleted: false,
    });
  });

  it("patches reaction add/remove in RTKQ cache and rolls back through mutation failure handling", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({
        id: "msg-1",
        conversationId: "room-1",
        reactions: [],
      }),
    ]);
    apiMocks.addReaction.mockResolvedValueOnce(
      apiSuccess(
        createMessage({
          id: "msg-1",
          conversationId: "room-1",
          reactions: [{ emoji: "👍", userIds: ["user-1"], count: 1 }],
        }),
      ),
    );
    apiMocks.removeReaction.mockResolvedValueOnce(
      apiSuccess(
        createMessage({
          id: "msg-1",
          conversationId: "room-1",
          reactions: [],
        }),
      ),
    );

    const addMutation = store.dispatch(
      chatApi.endpoints.addReaction.initiate({
        conversationId: "room-1",
        messageId: "msg-1",
        emoji: "👍",
        userId: "user-1",
      }),
    );
    await flushMicrotasks();
    expect(selectMessages(store, "room-1")[0].reactions).toEqual([
      { emoji: "👍", userIds: ["user-1"], count: 1 },
    ]);
    await addMutation.unwrap();

    const removeMutation = store.dispatch(
      chatApi.endpoints.removeReaction.initiate({
        conversationId: "room-1",
        messageId: "msg-1",
        emoji: "👍",
        userId: "user-1",
      }),
    );
    await flushMicrotasks();
    expect(selectMessages(store, "room-1")[0].reactions).toEqual([]);
    await removeMutation.unwrap();
  });

  it("marks a failed optimistic send instead of dropping it silently", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", []);
    apiMocks.sendMessage.mockRejectedValueOnce(new Error("offline"));

    await expect(
      store
        .dispatch(
          chatApi.endpoints.sendMessage.initiate({
            conversationId: "room-1",
            clientMessageId: "client-failed",
            localId: "temp-client-failed",
            content: "hello",
            type: MessageType.TEXT,
          }),
        )
        .unwrap(),
    ).rejects.toBeTruthy();

    expect(selectMessages(store, "room-1")).toHaveLength(1);
    expect(selectMessages(store, "room-1")[0]).toMatchObject({
      clientMessageId: "client-failed",
      sendState: "failed",
      status: MessageStatus.FAILED,
    });
  });

  it("rejects an over-limit inline message before creating optimistic cache state", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", []);

    await expect(
      store
        .dispatch(
          chatApi.endpoints.sendMessage.initiate({
            conversationId: "room-1",
            clientMessageId: "client-too-long",
            localId: "temp-client-too-long",
            content: "x".repeat(20_001),
            type: MessageType.TEXT,
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({
      code: "MESSAGE_CONTENT_TOO_LONG",
      statusCode: 422,
    });

    expect(apiMocks.sendMessage).not.toHaveBeenCalled();
    expect(selectMessages(store, "room-1")).toHaveLength(0);
  });

  it("preserves websocket tail messages when a stale REST replace page settles later", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({ id: "msg-1", conversationId: "room-1", serverSeq: 1 }),
    ]);
    apiMocks.getMessages.mockResolvedValueOnce(
      apiSuccess({
        messages: [
          createMessage({
            id: "msg-1",
            conversationId: "room-1",
            serverSeq: 1,
          }),
          createMessage({
            id: "msg-2",
            conversationId: "room-1",
            serverSeq: 2,
          }),
        ],
        meta: { hasPrev: false, hasNext: false },
      }),
    );

    store.dispatch(
      realtimeMessageReceived({
        conversationId: "room-1",
        message: createMessage({
          id: "msg-3",
          conversationId: "room-1",
          serverSeq: 3,
        }),
      }),
    );
    await store
      .dispatch(
        chatApi.endpoints.getMessages.initiate({
          conversationId: "room-1",
          limit: 50,
        }),
      )
      .unwrap();

    expect(selectMessages(store, "room-1").map((message) => message.id)).toEqual(
      ["msg-1", "msg-2", "msg-3"],
    );
  });

  it("prepends older pages into the RTKQ timeline without duplicating overlap rows", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({ id: "msg-50", conversationId: "room-1", serverSeq: 50 }),
      createMessage({ id: "msg-51", conversationId: "room-1", serverSeq: 51 }),
    ]);
    apiMocks.getMessages
      .mockResolvedValueOnce(
        apiSuccess({
          messages: [
            createMessage({
              id: "msg-48",
              conversationId: "room-1",
              serverSeq: 48,
            }),
            createMessage({
              id: "msg-49",
              conversationId: "room-1",
              serverSeq: 49,
            }),
            createMessage({
              id: "msg-50",
              conversationId: "room-1",
              serverSeq: 50,
            }),
          ],
          meta: { hasPrev: true, hasNext: false },
        }),
      )
      .mockResolvedValueOnce(
        apiSuccess({
          messages: [
            createMessage({
              id: "msg-46",
              conversationId: "room-1",
              serverSeq: 46,
            }),
            createMessage({
              id: "msg-47",
              conversationId: "room-1",
              serverSeq: 47,
            }),
            createMessage({
              id: "msg-48",
              conversationId: "room-1",
              serverSeq: 48,
            }),
          ],
          meta: { hasPrev: false, hasNext: false },
        }),
      );

    await store
      .dispatch(
        chatApi.endpoints.getMessages.initiate({
          conversationId: "room-1",
          beforeSeq: 50,
          limit: 50,
        }),
      )
      .unwrap();
    await store
      .dispatch(
        chatApi.endpoints.getMessages.initiate({
          conversationId: "room-1",
          beforeSeq: 48,
          limit: 50,
        }),
      )
      .unwrap();

    expect(selectMessages(store, "room-1").map((message) => message.id)).toEqual(
      ["msg-46", "msg-47", "msg-48", "msg-49", "msg-50", "msg-51"],
    );
  });
});
