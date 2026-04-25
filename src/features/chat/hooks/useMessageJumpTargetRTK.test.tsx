import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chatApi } from "../../api/chatApi";
import { buildConversationMessagesCache } from "../domain/messageMerge";
import { useMessageJumpTargetRTK } from "./useMessageJumpTargetRTK";
import { MessageStatus, MessageType, type Message } from "../../../types";

const apiMocks = vi.hoisted(() => ({
  getMessageById: vi.fn(),
  getMessages: vi.fn(),
}));

vi.mock("../../../services/api", () => ({
  conversationApi: {
    getConversations: vi.fn(),
    getConversationById: vi.fn(),
    getUnreadSummary: vi.fn(),
    markAsRead: vi.fn(),
  },
  messageApi: {
    addReaction: vi.fn(),
    deleteMessage: vi.fn(),
    editMessage: vi.fn(),
    getMessageById: apiMocks.getMessageById,
    getMessages: apiMocks.getMessages,
    removeReaction: vi.fn(),
    searchMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      [chatApi.reducerPath]: chatApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(chatApi.middleware),
  });

type TestStore = ReturnType<typeof createTestStore>;

const apiSuccess = <T,>(data: T) => ({
  success: true as const,
  data,
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
};

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

const renderJumpHook = (
  store: TestStore,
  conversationId: string,
) =>
  renderHook(
    ({ roomId }) => useMessageJumpTargetRTK(roomId),
    {
      initialProps: { roomId: conversationId },
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    },
  );

describe("useMessageJumpTargetRTK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the active RTKQ cache when the jump target is already loaded", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({ id: "msg-1", conversationId: "room-1", serverSeq: 1 }),
    ]);
    const { result } = renderJumpHook(store, "room-1");

    let loadResult: Awaited<
      ReturnType<typeof result.current.ensureMessageLoaded>
    > | null = null;
    await act(async () => {
      loadResult = await result.current.ensureMessageLoaded("msg-1");
    });

    expect(loadResult).toMatchObject({
      status: "cached",
      stale: false,
      message: { id: "msg-1" },
    });
    expect(apiMocks.getMessageById).not.toHaveBeenCalled();
    expect(apiMocks.getMessages).not.toHaveBeenCalled();
  });

  it("loads a missing jump target, inserts it into RTKQ cache, and fetches context around it", async () => {
    const store = createTestStore();
    await seedMessages(store, "room-1", [
      createMessage({ id: "msg-1", conversationId: "room-1", serverSeq: 1 }),
    ]);
    apiMocks.getMessageById.mockResolvedValueOnce(
      apiSuccess(
        createMessage({
          id: "msg-50",
          conversationId: "room-1",
          serverSeq: 50,
        }),
      ),
    );
    apiMocks.getMessages
      .mockResolvedValueOnce(
        apiSuccess({
          messages: [
            createMessage({
              id: "msg-49",
              conversationId: "room-1",
              serverSeq: 49,
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        apiSuccess({
          messages: [
            createMessage({
              id: "msg-51",
              conversationId: "room-1",
              serverSeq: 51,
            }),
          ],
        }),
      );
    const { result } = renderJumpHook(store, "room-1");

    let loadResult: Awaited<
      ReturnType<typeof result.current.ensureMessageLoaded>
    > | null = null;
    await act(async () => {
      loadResult = await result.current.ensureMessageLoaded("msg-50");
    });

    expect(loadResult).toMatchObject({
      status: "loaded",
      stale: false,
      message: { id: "msg-50" },
    });
    expect(apiMocks.getMessageById).toHaveBeenCalledWith("msg-50");
    expect(apiMocks.getMessages).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ beforeSeq: 50, limit: 24 }),
    );
    expect(apiMocks.getMessages).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ afterSeq: 50, limit: 24 }),
    );
    expect(selectMessages(store, "room-1").map((message) => message.id)).toEqual(
      ["msg-1", "msg-49", "msg-50", "msg-51"],
    );
  });

  it("does not patch a jump target after the conversation changes mid-request", async () => {
    const store = createTestStore();
    const deferred = createDeferred<ReturnType<typeof apiSuccess<Message>>>();
    apiMocks.getMessageById.mockReturnValueOnce(deferred.promise);
    const { result, rerender } = renderJumpHook(store, "room-1");

    const pending = result.current.ensureMessageLoaded("msg-stale");
    rerender({ roomId: "room-2" });
    deferred.resolve(
      apiSuccess(
        createMessage({
          id: "msg-stale",
          conversationId: "room-1",
          serverSeq: 10,
        }),
      ),
    );

    const loadResult = await pending;

    expect(loadResult).toMatchObject({
      status: "stale",
      stale: true,
      message: { id: "msg-stale" },
    });
    expect(selectMessages(store, "room-1")).toEqual([]);
    expect(selectMessages(store, "room-2")).toEqual([]);
    expect(apiMocks.getMessages).not.toHaveBeenCalled();
  });
});
