import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType } from "../types";
import { useNotificationStore } from "../features/notification/state/notificationStore";
import { sortConversationsByActivity } from "../utils/conversationRanking";
import { useAuthStore } from "./authStore";

const {
  getMessagesMock,
  sendMessageMock,
  conversationMarkAsReadMock,
  getConversationsMock,
  getUnreadSummaryMock,
  getUnreadFeedMock,
} = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
  sendMessageMock: vi.fn(),
  conversationMarkAsReadMock: vi.fn(),
  getConversationsMock: vi.fn(),
  getUnreadSummaryMock: vi.fn(),
  getUnreadFeedMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  conversationApi: {
    getConversations: getConversationsMock,
    markAsRead: conversationMarkAsReadMock,
    getUnreadSummary: getUnreadSummaryMock,
    getUnreadFeed: getUnreadFeedMock,
  },
  messageApi: {
    getMessages: getMessagesMock,
    markAsRead: vi.fn(),
    sendMessage: sendMessageMock,
  },
}));

import {
  selectConversationMessagesFromState,
  selectMessageEntityFromState,
  useChatStore,
} from "./chatStore";

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const makeSuccessEnvelope = (data: unknown) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  data,
});

const getRoomMessages = () => useChatStore.getState().messages["room-1"] || [];

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

const makeConversation = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: "room-1",
  conversationId: "room-1",
  type: "group",
  name: "Room 1",
  unreadCount: 0,
  membershipState: "active",
  memberCount: 2,
  summaryVersion: 1,
  lastMessage: null,
  lastActivityAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-04-10T09:00:00.000Z",
  createdAt: "2026-04-10T09:00:00.000Z",
  ...overrides,
});

describe("chatStore phase-1 realtime flows", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useNotificationStore.getState().reset();
    useAuthStore.setState({
      user: {
        id: "user-a",
        username: "alice",
        status: "online",
      },
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
    });
    getMessagesMock.mockReset();
    sendMessageMock.mockReset();
    conversationMarkAsReadMock.mockReset();
    getConversationsMock.mockReset();
    getUnreadSummaryMock.mockReset();
    getUnreadFeedMock.mockReset();
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

  it("applies canonical summary update for unopened conversation without local inference", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-a",
        conversationId: "room-a",
        unreadCount: 0,
      }),
      makeConversation({
        id: "room-b",
        conversationId: "room-b",
        unreadCount: 1,
        lastMessage: {
          id: "msg-old",
          senderId: "u2",
          senderName: "Bob",
          content: "old",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T09:00:00.000Z",
        },
      }),
    ] as never);

    useChatStore.getState().upsertConversationSummary(
      makeConversation({
        id: "room-b",
        conversationId: "room-b",
        unreadCount: 2,
        summaryVersion: 5,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        lastMessage: {
          id: "msg-new",
          senderId: "u2",
          senderName: "Bob",
          content: "latest",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T10:00:00.000Z",
        },
      }) as never,
    );

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-b");
    expect(conversation?.unreadCount).toBe(2);
    expect(conversation?.summaryVersion).toBe(5);
    expect(conversation?.lastMessage?.id).toBe("msg-new");
  });

  it("does not zero unread locally when message is appended before canonical summary arrives", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
        unreadCount: 3,
      }),
    ] as never);

    useChatStore.getState().addMessage(
      "room-2",
      makeMessage({
        id: "msg-2",
        conversationId: "room-2",
        content: "server push",
      }) as never,
    );

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-2");
    expect(conversation?.unreadCount).toBe(3);
    expect(conversation?.lastMessage?.id).toBe("msg-2");
  });

  it("updates conversation summary and unread count immediately for incoming realtime messages", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 2,
        lastMessage: {
          id: "msg-old",
          senderId: "u-old",
          senderName: "Bob",
          content: "old",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T09:59:00.000Z",
        },
      }),
    ] as never);

    useChatStore.getState().applyIncomingConversationMessage(
      "room-1",
      makeMessage({
        id: "msg-live",
        content: "live now",
        createdAt: "2026-04-10T10:05:00.000Z",
        updatedAt: "2026-04-10T10:05:00.000Z",
      }) as never,
      { incrementUnread: true },
    );

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");

    expect(conversation?.unreadCount).toBe(3);
    expect(conversation?.lastMessage?.id).toBe("msg-live");
    expect(conversation?.lastMessage?.content).toBe("live now");
    expect(useChatStore.getState().totalUnreadCount).toBe(3);
  });

  it("patches lightweight message status updates without rebuilding message indexes", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 0,
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
      }),
    ] as never);

    const before = useChatStore.getState();
    const previousMessageIdsByConversation = before.messageIdsByConversation;
    const previousAliasIndex = before.messageAliasIndexByConversation;
    const previousWindow = before.messageWindowByConversation;

    useChatStore.getState().updateMessage("room-1", "msg-1", {
      status: MessageStatus.SENT,
      sendState: "sent",
      updatedAt: new Date("2026-04-10T09:00:01.000Z"),
    });

    const after = useChatStore.getState();
    expect(after.messageIdsByConversation).toBe(
      previousMessageIdsByConversation,
    );
    expect(after.messageAliasIndexByConversation).toBe(previousAliasIndex);
    expect(after.messageWindowByConversation).toBe(previousWindow);
    expect(after.messages["room-1"]?.[0]?.sendState).toBe("sent");
    expect(after.conversationById["room-1"]?.lastMessageStatus).toBe("sent");
  });

  it("keeps selected conversation message selector stable when unrelated message entities change", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
      }),
    ] as never);
    useChatStore
      .getState()
      .setMessages("room-1", [makeMessage({ id: "room-1-msg-1" })] as never);
    useChatStore.getState().setMessages("room-2", [
      makeMessage({
        id: "room-2-msg-1",
        conversationId: "room-2",
      }),
    ] as never);

    const first = selectConversationMessagesFromState(
      useChatStore.getState(),
      "room-1",
    );
    const state = useChatStore.getState();
    const unrelatedMessage = makeMessage({
      id: "room-2-msg-2",
      conversationId: "room-2",
    }) as never;
    const second = selectConversationMessagesFromState(
      {
        ...state,
        messageById: {
          ...state.messageById,
          "room-2-msg-2": unrelatedMessage,
        },
      },
      "room-1",
    );

    expect(second).toBe(first);
  });

  it("marks normalized message entities as read when applying read receipts up to a boundary", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 0,
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        senderId: "user-a",
        createdAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeMessage({
        id: "msg-2",
        senderId: "user-a",
        createdAt: "2026-04-10T09:01:00.000Z",
        updatedAt: "2026-04-10T09:01:00.000Z",
      }),
    ] as never);

    useChatStore.getState().markMessagesReadUpTo("room-1", "msg-2", "user-b");

    const state = useChatStore.getState();
    const selectedMessages = selectConversationMessagesFromState(
      state,
      "room-1",
    );
    expect(selectedMessages.map((message) => message.status)).toEqual([
      MessageStatus.READ,
      MessageStatus.READ,
    ]);
    expect(selectMessageEntityFromState(state, "msg-1")?.status).toBe(
      MessageStatus.READ,
    );
    expect(selectMessageEntityFromState(state, "msg-2")?.status).toBe(
      MessageStatus.READ,
    );
  });

  it("marks normalized message entities as read using lastReadSeq when the boundary message is missing", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 0,
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        senderId: "user-a",
        serverSeq: 10,
        createdAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeMessage({
        id: "msg-2",
        senderId: "user-a",
        serverSeq: 11,
        createdAt: "2026-04-10T09:01:00.000Z",
        updatedAt: "2026-04-10T09:01:00.000Z",
      }),
      makeMessage({
        id: "msg-3",
        senderId: "user-a",
        serverSeq: 12,
        createdAt: "2026-04-10T09:02:00.000Z",
        updatedAt: "2026-04-10T09:02:00.000Z",
      }),
    ] as never);

    useChatStore
      .getState()
      .markMessagesReadUpTo("room-1", "missing-message", "user-b", 11);

    const selectedMessages = selectConversationMessagesFromState(
      useChatStore.getState(),
      "room-1",
    );
    expect(selectedMessages.map((message) => message.status)).toEqual([
      MessageStatus.READ,
      MessageStatus.READ,
      MessageStatus.SENT,
    ]);
  });

  it("does not zero unread just because the selected conversation fetches latest messages", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 4,
        lastReadMessageId: "msg-old",
      }),
    ] as never);
    useChatStore.getState().selectConversation("room-1");

    getMessagesMock.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-latest",
            createdAt: "2026-04-10T10:10:00.000Z",
            updatedAt: "2026-04-10T10:10:00.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: false,
      },
    });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, { force: true });

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");
    expect(conversation?.unreadCount).toBe(4);
    expect(conversation?.lastMessage?.id).toBe("msg-latest");
  });

  it("applies server-owned read state from history meta, including first unread anchor", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 4,
        lastReadMessageId: "msg-old",
      }),
    ] as never);

    getMessagesMock.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-first-unread",
            createdAt: "2026-04-10T10:01:00.000Z",
            updatedAt: "2026-04-10T10:01:00.000Z",
          }),
          makeMessage({
            id: "msg-latest",
            createdAt: "2026-04-10T10:10:00.000Z",
            updatedAt: "2026-04-10T10:10:00.000Z",
          }),
        ],
      },
      meta: {
        hasNext: false,
        hasPrev: true,
        readState: {
          unreadCount: 4,
          lastReadMessageId: "msg-old",
          lastReadAt: "2026-04-10T09:59:00.000Z",
          firstUnreadMessageId: "msg-first-unread",
          firstUnreadMessageAt: "2026-04-10T10:01:00.000Z",
        },
      },
    });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, { force: true });

    const conversation = useChatStore.getState().conversationById["room-1"];
    expect(conversation?.unreadCount).toBe(4);
    expect(conversation?.lastReadMessageId).toBe("msg-old");
    expect(conversation?.firstUnreadMessageId).toBe("msg-first-unread");
  });

  it("does not promote adjacent prefetch to authoritative history", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
    ] as never);

    getMessagesMock.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-prefetch",
            createdAt: "2026-04-10T10:10:00.000Z",
            updatedAt: "2026-04-10T10:10:00.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: true,
      },
    });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, {
        limit: 20,
        queryType: "prefetch",
        source: "prefetch_adjacent",
        selectedConversationIdAtDispatch: "room-2",
      });

    const state = useChatStore.getState();
    expect(state.historyStageByConversation["room-1"]).toBe("partial_prefetch");
    expect(state.hasAuthoritativeHistoryByConversation["room-1"]).toBe(false);
    expect(state.messagesHydratedByConversation["room-1"]).toBe(false);
    expect(state.prefetchedWindowByConversation["room-1"]).toBe(true);
  });

  it("promotes partial history to authoritative on authoritative open fetch", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
    ] as never);
    useChatStore.getState().selectConversation("room-1");
    useChatStore.getState().ingestMessages(
      "room-1",
      [
        makeMessage({
          id: "msg-unread-1",
          createdAt: "2026-04-10T10:05:00.000Z",
          updatedAt: "2026-04-10T10:05:00.000Z",
        }),
      ] as never,
      {
        mode: "replace",
        hydrated: false,
        source: "unread_feed",
        stage: "partial_unread_bootstrap",
        hasAuthoritativeHistory: false,
      },
    );

    getMessagesMock.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-read-1",
            createdAt: "2026-04-10T10:00:00.000Z",
            updatedAt: "2026-04-10T10:00:00.000Z",
          }),
          makeMessage({
            id: "msg-unread-1",
            createdAt: "2026-04-10T10:05:00.000Z",
            updatedAt: "2026-04-10T10:05:00.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: false,
      },
    });

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, {
        force: true,
        queryType: "authoritative_open",
        source: "initial_fetch",
        selectedConversationIdAtDispatch: "room-1",
      });

    const state = useChatStore.getState();
    expect(state.historyStageByConversation["room-1"]).toBe(
      "authoritative_initial_window",
    );
    expect(state.hasAuthoritativeHistoryByConversation["room-1"]).toBe(true);
    expect(state.messagesHydratedByConversation["room-1"]).toBe(true);
    expect(
      (state.messages["room-1"] || []).map((message) => message.id),
    ).toEqual(["msg-read-1", "msg-unread-1"]);
  });

  it("ignores authoritative open response when room selection changed before commit", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
      }),
    ] as never);
    useChatStore.getState().selectConversation("room-1");

    const deferred = createDeferred<{
      success: boolean;
      statusCode: number;
      message: string;
      data: {
        messages: Array<Record<string, unknown>>;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>();
    getMessagesMock.mockReturnValueOnce(deferred.promise);

    const request = useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, {
        force: true,
        queryType: "authoritative_open",
        source: "initial_fetch",
        selectedConversationIdAtDispatch: "room-1",
      });

    useChatStore.getState().selectConversation("room-2");
    deferred.resolve({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-room-1",
            createdAt: "2026-04-10T10:00:00.000Z",
            updatedAt: "2026-04-10T10:00:00.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: false,
      },
    });
    await request;

    const state = useChatStore.getState();
    expect(state.messages["room-1"] ?? []).toHaveLength(0);
    expect(state.hasAuthoritativeHistoryByConversation["room-1"]).toBeFalsy();
    expect(state.messagesHydratedByConversation["room-1"]).toBeFalsy();
  });

  it("cancels superseded authoritative-open history fetches during fast room switching", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
      }),
    ] as never);
    useChatStore.getState().selectConversation("room-1");

    const firstRequestAborted = vi.fn();
    getMessagesMock
      .mockImplementationOnce(
        (_conversationId: string, options?: { signal?: AbortSignal }) =>
          new Promise((_, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => {
                firstRequestAborted();
                reject(
                  Object.assign(new Error("cancelled"), {
                    name: "AbortError",
                    code: "ERR_CANCELED",
                  }),
                );
              },
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce({
        success: true,
        statusCode: 200,
        message: "ok",
        data: {
          messages: [
            makeMessage({
              id: "msg-room-2",
              conversationId: "room-2",
              createdAt: "2026-04-10T10:05:00.000Z",
              updatedAt: "2026-04-10T10:05:00.000Z",
            }),
          ],
        },
        meta: {
          hasNext: false,
          hasPrev: true,
          returnedWindow: "latest",
        },
      });

    const firstRequest = useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, {
        force: true,
        queryType: "authoritative_open",
        source: "initial_fetch",
        selectedConversationIdAtDispatch: "room-1",
      });

    useChatStore.getState().selectConversation("room-2");
    const secondRequest = useChatStore
      .getState()
      .fetchMessages("room-2", undefined, undefined, {
        force: true,
        queryType: "authoritative_open",
        source: "initial_fetch",
        selectedConversationIdAtDispatch: "room-2",
      });

    await expect(firstRequest).resolves.toEqual(
      expect.objectContaining({
        applied: false,
        loaded: 0,
      }),
    );
    await expect(secondRequest).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        loaded: 1,
      }),
    );

    expect(firstRequestAborted).toHaveBeenCalledTimes(1);
    expect(
      (useChatStore.getState().messages["room-1"] ?? []).map(
        (message) => message.id,
      ),
    ).toEqual([]);
    expect(
      (useChatStore.getState().messages["room-2"] ?? []).map(
        (message) => message.id,
      ),
    ).toEqual(["msg-room-2"]);
  });

  it("preserves websocket delta that lands while initial snapshot is still in flight", async () => {
    const deferred = createDeferred<{
      success: boolean;
      statusCode: number;
      message: string;
      data: {
        messages: Array<Record<string, unknown>>;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>();
    getMessagesMock.mockReturnValueOnce(deferred.promise);

    const fetchPromise = useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, { force: true });

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "msg-live",
        content: "live delta",
        createdAt: "2026-04-10T09:01:00.000Z",
        updatedAt: "2026-04-10T09:01:00.000Z",
      }) as never,
    );

    deferred.resolve({
      success: true,
      statusCode: 200,
      message: "ok",
      data: {
        messages: [
          makeMessage({
            id: "msg-base",
            content: "snapshot base",
            createdAt: "2026-04-10T09:00:00.000Z",
            updatedAt: "2026-04-10T09:00:00.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: false,
      },
    });

    await fetchPromise;

    const messageIds = (useChatStore.getState().messages["room-1"] || []).map(
      (message) => message.id,
    );
    expect(messageIds).toEqual(["msg-base", "msg-live"]);
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

  it("serializes markAsRead requests and only advances to the newest visible anchor", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 2,
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
      makeMessage({
        id: "msg-2",
        createdAt: "2026-04-10T10:01:00.000Z",
        updatedAt: "2026-04-10T10:01:00.000Z",
      }),
    ] as never);

    const firstRequest = createDeferred<void>();
    const secondRequest = createDeferred<void>();
    conversationMarkAsReadMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const firstPromise = useChatStore.getState().markAsRead("room-1", "msg-1");
    const secondPromise = useChatStore.getState().markAsRead("room-1", "msg-2");

    expect(conversationMarkAsReadMock).toHaveBeenCalledTimes(1);
    expect(conversationMarkAsReadMock).toHaveBeenNthCalledWith(1, "room-1", {
      lastVisibleMessageId: "msg-1",
    });

    firstRequest.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(conversationMarkAsReadMock).toHaveBeenCalledTimes(2);
    expect(conversationMarkAsReadMock).toHaveBeenNthCalledWith(2, "room-1", {
      lastVisibleMessageId: "msg-2",
    });

    secondRequest.resolve();
    await firstPromise;
    await secondPromise;
  });

  it("marks conversation read optimistically without mutating transient notification state", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 2,
        lastReadMessageId: "msg-0",
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-1",
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
      makeMessage({
        id: "msg-2",
        createdAt: "2026-04-10T10:01:00.000Z",
        updatedAt: "2026-04-10T10:01:00.000Z",
      }),
    ] as never);
    useNotificationStore.getState().upsertNotification({
      id: "notif-room-1",
      kind: "message",
      title: "Room 1",
      body: "Unread ping",
      createdAt: "2026-04-10T10:01:30.000Z",
      conversationId: "room-1",
    });

    const deferred = createDeferred<void>();
    conversationMarkAsReadMock.mockReturnValueOnce(deferred.promise);

    const markPromise = useChatStore.getState().markAsRead("room-1", "msg-2");

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");
    const notification = useNotificationStore
      .getState()
      .items.find((item) => item.id === "notif-room-1");

    expect(conversation?.unreadCount).toBe(0);
    expect(conversation?.lastReadMessageId).toBe("msg-2");
    expect(useChatStore.getState().totalUnreadCount).toBe(0);
    expect(notification?.isRead).toBe(false);

    deferred.resolve();
    await markPromise;
  });

  it("hydrates reply preview from loaded history when canonical reply summary is missing", () => {
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-parent",
        content: "parent message",
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }) as never,
      makeMessage({
        id: "msg-reply",
        content: "reply body",
        replyTo: "msg-parent",
        createdAt: "2026-04-10T10:01:00.000Z",
        updatedAt: "2026-04-10T10:01:00.000Z",
      }) as never,
    ] as never);

    const replyMessage = useChatStore
      .getState()
      .messages["room-1"]?.find((message) => message.id === "msg-reply");

    expect(replyMessage?.replyTo).toBe("msg-parent");
    expect(replyMessage?.replyToMessage?.id).toBe("msg-parent");
    expect(replyMessage?.replyToMessage?.content).toBe("parent message");
  });

  it("applies unread summary as authoritative reconnect snapshot", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 5,
        lastReadMessageId: "msg-old",
        lastReadAt: "2026-04-10T08:00:00.000Z",
      }),
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
        unreadCount: 3,
        lastReadMessageId: "msg-room-2",
        lastReadAt: "2026-04-10T08:30:00.000Z",
      }),
    ] as never);

    useChatStore.getState().applyUnreadSummary({
      totalUnreadCount: 1,
      conversations: [
        {
          conversationId: "room-1",
          unreadCount: 1,
          lastReadMessageId: null,
          lastReadAt: null,
        },
      ],
    });

    const room1 = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");
    const room2 = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-2");

    expect(room1?.unreadCount).toBe(1);
    expect(room1?.lastReadMessageId ?? null).toBeNull();
    expect(room1?.lastReadAt ?? null).toBeNull();
    expect(room2?.unreadCount).toBe(0);
    expect(useChatStore.getState().totalUnreadCount).toBe(1);
  });

  it("refreshes unread summary snapshots through the store action owner", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 4,
      }),
    ] as never);
    getUnreadSummaryMock.mockResolvedValueOnce(
      makeSuccessEnvelope({
        totalUnreadCount: 0,
        conversations: [
          {
            conversationId: "room-1",
            unreadCount: 0,
            lastReadMessageId: "msg-read",
            lastReadAt: "2026-04-10T10:10:00.000Z",
          },
        ],
      }),
    );

    await useChatStore.getState().refreshUnreadSummarySnapshot();

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");
    expect(getUnreadSummaryMock).toHaveBeenCalledTimes(1);
    expect(conversation?.unreadCount).toBe(0);
    expect(useChatStore.getState().totalUnreadCount).toBe(0);
    expect(useChatStore.getState().lastUnreadSummaryAppliedAt).not.toBeNull();
  });

  it("ignores stale conversation summary versions and preserves canonical unread total", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-stale",
        conversationId: "room-stale",
        unreadCount: 4,
        summaryVersion: 8,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    const result = useChatStore.getState().upsertConversationSummary(
      makeConversation({
        id: "room-stale",
        conversationId: "room-stale",
        unreadCount: 1,
        summaryVersion: 7,
        lastActivityAt: "2026-04-10T09:59:00.000Z",
        updatedAt: "2026-04-10T09:59:00.000Z",
      }) as never,
    );

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-stale");

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("stale_version");
    expect(conversation?.unreadCount).toBe(4);
    expect(conversation?.summaryVersion).toBe(8);
    expect(useChatStore.getState().totalUnreadCount).toBe(4);
  });

  it("does not regress unread snapshot when a newer summary landed after reconnect request started", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-fresh",
        conversationId: "room-fresh",
        unreadCount: 1,
        summaryVersion: 4,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    useChatStore.getState().upsertConversationSummary(
      makeConversation({
        id: "room-fresh",
        conversationId: "room-fresh",
        unreadCount: 3,
        summaryVersion: 5,
        lastActivityAt: "2026-04-10T10:01:00.000Z",
        updatedAt: "2026-04-10T10:01:00.000Z",
      }) as never,
    );

    useChatStore.getState().applyUnreadSummary(
      {
        totalUnreadCount: 1,
        conversations: [
          {
            conversationId: "room-fresh",
            unreadCount: 1,
            lastReadMessageId: "msg-old",
            lastReadAt: "2026-04-10T09:59:00.000Z",
          },
        ],
      },
      {
        requestedAtMs: Date.parse("2026-04-10T10:00:30.000Z"),
        appliedAtMs: Date.parse("2026-04-10T10:00:45.000Z"),
      },
    );

    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-fresh");
    expect(conversation?.unreadCount).toBe(3);
    expect(conversation?.summaryVersion).toBe(5);
    expect(useChatStore.getState().totalUnreadCount).toBe(3);
  });

  it("keeps the newer message version when update events arrive out of order", () => {
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-versioned",
        content: "latest",
        version: 3,
        updatedAt: "2026-04-10T10:02:00.000Z",
      }) as never,
    ] as never);

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "msg-versioned",
        content: "stale",
        version: 2,
        updatedAt: "2026-04-10T10:01:00.000Z",
      }) as never,
    );

    const messages = useChatStore.getState().messages["room-1"] || [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("latest");
    expect(messages[0]?.version).toBe(3);
  });

  it("suppresses duplicate server message events by identity", () => {
    const duplicate = makeMessage({
      id: "msg-dup",
      clientMessageId: "client-dup",
      version: 1,
    });

    useChatStore.getState().addMessage("room-1", duplicate as never);
    useChatStore.getState().addMessage("room-1", duplicate as never);

    const messages = useChatStore.getState().messages["room-1"] || [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("msg-dup");
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

  it("creates optimistic message immediately and reconciles to sent on API success", async () => {
    sendMessageMock.mockResolvedValueOnce(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-optimistic-1",
          localId: "temp-do-not-care",
          stableId: "client-room-1-a",
          clientMessageId: "client-room-1-a",
          status: MessageStatus.SENT,
        }),
      ),
    );

    const sendPromise = useChatStore
      .getState()
      .sendMessage("room-1", "hello optimistic", MessageType.TEXT);

    const optimistic = getRoomMessages();
    expect(optimistic).toHaveLength(1);
    expect(optimistic[0]?.id.startsWith("temp-")).toBe(true);
    expect(optimistic[0]?.sendState).toBe("sending");

    await sendPromise;

    const reconciled = getRoomMessages();
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.id).toBe("server-optimistic-1");
    expect(reconciled[0]?.sendState).toBe("sent");
    expect(reconciled[0]?.status).toBe(MessageStatus.SENT);
  });

  it("does not reorder sidebar order when only a pending optimistic message exists", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-older",
        conversationId: "room-older",
        lastMessageAt: "2026-04-10T09:00:00.000Z",
        lastMessageSortAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeConversation({
        id: "room-newer",
        conversationId: "room-newer",
        lastMessageAt: "2026-04-10T10:00:00.000Z",
        lastMessageSortAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    useChatStore.getState().addMessage(
      "room-older",
      makeMessage({
        id: "temp-room-older-1",
        conversationId: "room-older",
        content: "pending optimistic",
        localId: "temp-room-older-1",
        clientMessageId: "client-room-older-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        createdAt: "2026-04-10T10:05:00.000Z",
        updatedAt: "2026-04-10T10:05:00.000Z",
      }) as never,
    );

    expect(
      sortConversationsByActivity(useChatStore.getState().conversations).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["room-newer", "room-older"]);
  });

  it("reorders sidebar order only after the optimistic message is acknowledged as sent", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-older",
        conversationId: "room-older",
        lastMessageAt: "2026-04-10T09:00:00.000Z",
        lastMessageSortAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeConversation({
        id: "room-newer",
        conversationId: "room-newer",
        lastMessageAt: "2026-04-10T10:00:00.000Z",
        lastMessageSortAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    useChatStore.getState().addMessage(
      "room-older",
      makeMessage({
        id: "temp-room-older-2",
        conversationId: "room-older",
        content: "pending optimistic",
        localId: "temp-room-older-2",
        clientMessageId: "client-room-older-2",
        status: MessageStatus.SENDING,
        sendState: "sending",
        createdAt: "2026-04-10T10:05:00.000Z",
        updatedAt: "2026-04-10T10:05:00.000Z",
      }) as never,
    );

    useChatStore.getState().ackOutgoingMessage(
      "room-older",
      "client-room-older-2",
      makeMessage({
        id: "server-room-older-2",
        conversationId: "room-older",
        content: "acknowledged",
        localId: "temp-room-older-2",
        clientMessageId: "client-room-older-2",
        stableId: "client-room-older-2",
        status: MessageStatus.SENT,
        sendState: "sent",
        createdAt: "2026-04-10T10:05:00.000Z",
        updatedAt: "2026-04-10T10:05:00.000Z",
      }) as never,
    );

    expect(
      sortConversationsByActivity(useChatStore.getState().conversations).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["room-older", "room-newer"]);
  });

  it("does not reorder sidebar order when unread and read progress change without a new latest message", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-older",
        conversationId: "room-older",
        unreadCount: 6,
        lastMessageAt: "2026-04-10T09:00:00.000Z",
        lastMessageSortAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeConversation({
        id: "room-newer",
        conversationId: "room-newer",
        unreadCount: 0,
        lastMessageAt: "2026-04-10T10:00:00.000Z",
        lastMessageSortAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    useChatStore.getState().applyUnreadSummary({
      totalUnreadCount: 0,
      conversations: [
        {
          conversationId: "room-older",
          unreadCount: 0,
          lastReadMessageId: "msg-read",
          lastReadAt: "2026-04-10T10:06:00.000Z",
        },
        {
          conversationId: "room-newer",
          unreadCount: 0,
          lastReadMessageId: "msg-newer",
          lastReadAt: "2026-04-10T10:06:00.000Z",
        },
      ],
    });

    expect(
      sortConversationsByActivity(useChatStore.getState().conversations).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["room-newer", "room-older"]);
  });

  it("keeps optimistic message visible while request is pending", async () => {
    const deferred = createDeferred<ReturnType<typeof makeSuccessEnvelope>>();
    sendMessageMock.mockReturnValueOnce(deferred.promise);

    const sendPromise = useChatStore
      .getState()
      .sendMessage("room-1", "slow message", MessageType.TEXT);

    const pending = getRoomMessages();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.content).toBe("slow message");
    expect(pending[0]?.sendState).toBe("sending");

    deferred.resolve(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-slow-1",
          clientMessageId: pending[0]?.clientMessageId,
          localId: pending[0]?.localId,
        }),
      ),
    );
    await sendPromise;

    expect(getRoomMessages()).toHaveLength(1);
    expect(getRoomMessages()[0]?.id).toBe("server-slow-1");
  });

  it("marks message as failed with network metadata when request has no response", async () => {
    sendMessageMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: "Network Error",
      response: undefined,
    });

    await expect(
      useChatStore
        .getState()
        .sendMessage("room-1", "offline message", MessageType.TEXT),
    ).rejects.toBeTruthy();

    const failed = getRoomMessages();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.sendState).toBe("failed");
    expect(failed[0]?.status).toBe(MessageStatus.FAILED);
    expect(failed[0]?.failureReason).toBe("network");
    expect(failed[0]?.errorCode).toBe("NETWORK_OFFLINE");
  });

  it("marks backend 5xx failures distinctly from other errors", async () => {
    sendMessageMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: "Internal Server Error",
      response: {
        status: 500,
        data: {
          success: false,
          statusCode: 500,
          message: "boom",
          error: {
            code: "INTERNAL_ERROR",
          },
        },
      },
    });

    await expect(
      useChatStore
        .getState()
        .sendMessage("room-1", "backend broken", MessageType.TEXT),
    ).rejects.toBeTruthy();

    const failed = getRoomMessages();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.sendState).toBe("failed");
    expect(failed[0]?.failureReason).toBe("backend_5xx");
    expect(failed[0]?.errorCode).toBe("BACKEND_5XX");
  });

  it("supports retry success by reusing failed bubble and reconciling in place", async () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "temp-retry-1",
        stableId: "client-retry-1",
        localId: "temp-retry-1",
        clientMessageId: "client-retry-1",
        status: MessageStatus.FAILED,
        sendState: "failed",
        failureReason: "network",
        content: "retry me",
      }) as never,
    );

    sendMessageMock.mockResolvedValueOnce(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-retry-1",
          localId: "temp-retry-1",
          stableId: "client-retry-1",
          clientMessageId: "client-retry-1",
          content: "retry me",
          status: MessageStatus.SENT,
        }),
      ),
    );

    const message = getRoomMessages()[0]!;
    await useChatStore.getState().resendMessage("room-1", message);

    const afterRetry = getRoomMessages();
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]?.id).toBe("server-retry-1");
    expect(afterRetry[0]?.sendState).toBe("sent");
  });

  it("keeps failed state if retry also fails", async () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "temp-retry-2",
        stableId: "client-retry-2",
        localId: "temp-retry-2",
        clientMessageId: "client-retry-2",
        status: MessageStatus.FAILED,
        sendState: "failed",
        failureReason: "network",
        content: "retry still fails",
      }) as never,
    );

    sendMessageMock.mockRejectedValueOnce({
      isAxiosError: true,
      message: "still offline",
      response: undefined,
    });

    const message = getRoomMessages()[0]!;
    await expect(
      useChatStore.getState().resendMessage("room-1", message),
    ).rejects.toBeTruthy();

    const afterRetry = getRoomMessages();
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]?.id).toBe("temp-retry-2");
    expect(afterRetry[0]?.sendState).toBe("failed");
    expect(afterRetry[0]?.failureReason).toBe("network");
  });

  it("merges server socket message after optimistic append without duplicates", () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "temp-socket-1",
        stableId: "client-socket-1",
        localId: "temp-socket-1",
        clientMessageId: "client-socket-1",
        status: MessageStatus.SENDING,
        sendState: "sending",
        content: "socket reconcile",
      }) as never,
    );

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "server-socket-1",
        stableId: "client-socket-1",
        clientMessageId: "client-socket-1",
        localId: "temp-socket-1",
        status: MessageStatus.SENT,
        sendState: "sent",
        content: "socket reconcile",
      }) as never,
    );

    const messages = getRoomMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("server-socket-1");
    expect(messages[0]?.sendState).toBe("sent");
  });

  it("keeps optimistic and server messages separate when correlation aliases are unavailable", async () => {
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "temp-fallback-1",
        localId: "temp-fallback-1",
        stableId: "temp-fallback-1",
        clientMessageId: undefined,
        senderId: "user-a",
        content: "same payload fallback",
        status: MessageStatus.SENDING,
        sendState: "sending",
        createdAt: "2026-04-10T10:00:00.000Z",
      }) as never,
    ] as never);

    getMessagesMock.mockResolvedValueOnce(
      makeSuccessEnvelope({
        messages: [
          makeMessage({
            id: "server-fallback-1",
            localId: undefined,
            stableId: undefined,
            clientMessageId: undefined,
            senderId: "user-a",
            content: "same payload fallback",
            status: MessageStatus.SENT,
            createdAt: "2026-04-10T10:00:03.000Z",
          }),
        ],
        hasNext: false,
        hasPrev: false,
      }),
    );

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, { force: true });

    const messages = getRoomMessages();
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "temp-fallback-1",
      "server-fallback-1",
    ]);
  });

  it("prefers senderProfiles from history over legacy senderName snapshots", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        participants: [
          {
            id: "user-b",
            username: "bob",
            displayName: "Bob Snapshot",
            status: "offline",
          },
        ],
        lastMessage: {
          id: "msg-legacy",
          senderId: "user-b",
          senderName: "Bob Snapshot",
          content: "legacy",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T09:00:00.000Z",
        },
      }),
    ] as never);

    getMessagesMock.mockResolvedValueOnce(
      makeSuccessEnvelope({
        messages: [
          makeMessage({
            id: "msg-history-1",
            senderId: "user-b",
            senderName: "Bob Snapshot",
            content: "hello from history",
          }),
        ],
        senderProfiles: {
          "user-b": {
            id: "user-b",
            username: "bob",
            displayName: "Bob Current",
            avatar: null,
            status: "online",
          },
        },
        hasNext: false,
        hasPrev: false,
      }),
    );

    await useChatStore
      .getState()
      .fetchMessages("room-1", undefined, undefined, {
        force: true,
      });

    const messages = getRoomMessages();
    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");

    expect(messages).toHaveLength(1);
    expect(messages[0]?.senderName).toBe("Bob Current");
    expect(conversation?.participants?.[0]?.displayName).toBe("Bob Current");
  });

  it("updates existing conversation messages and reply previews when participant summary changes", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        participants: [
          {
            id: "user-b",
            username: "bob",
            displayName: "Bob Old",
            status: "offline",
          },
        ],
        lastMessage: {
          id: "msg-last",
          senderId: "user-b",
          senderName: "Bob Old",
          content: "latest",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T10:00:00.000Z",
        },
      }),
    ] as never);
    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "msg-sender-old",
        senderId: "user-b",
        senderName: "Bob Old",
        content: "older message",
      }) as never,
      makeMessage({
        id: "msg-reply",
        senderId: "user-a",
        senderName: "Alice",
        content: "replying",
        replyToMessage: {
          id: "msg-sender-old",
          senderId: "user-b",
          senderName: "Bob Old",
          content: "older message",
          type: MessageType.TEXT,
          isDeleted: false,
          createdAt: "2026-04-10T09:00:00.000Z",
        },
      }) as never,
    ] as never);

    useChatStore.getState().applyConversationParticipantSummary("room-1", {
      id: "user-b",
      username: "bob",
      displayName: "Bob Renamed",
      avatar: null,
      status: "online",
    });

    const messages = getRoomMessages();
    const conversation = useChatStore
      .getState()
      .conversations.find((item) => item.id === "room-1");
    const renamedMessage = messages.find(
      (message) => message.id === "msg-sender-old",
    );
    const replyMessage = messages.find((message) => message.id === "msg-reply");

    expect(renamedMessage?.senderName).toBe("Bob Renamed");
    expect(replyMessage?.replyToMessage?.senderName).toBe("Bob Renamed");
    expect(conversation?.lastMessage?.senderName).toBe("Bob Renamed");
    expect(conversation?.participants?.[0]?.displayName).toBe("Bob Renamed");
  });

  it("does not collapse a same-content server message into a pending optimistic one without identity aliases", () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "temp-same-content-1",
        localId: "temp-same-content-1",
        stableId: "temp-same-content-1",
        clientMessageId: undefined,
        senderId: "user-a",
        content: "ok",
        status: MessageStatus.SENDING,
        sendState: "sending",
        createdAt: "2026-04-10T10:00:00.000Z",
      }) as never,
    );

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "server-same-content-1",
        localId: undefined,
        stableId: undefined,
        clientMessageId: undefined,
        senderId: "user-a",
        content: "ok",
        status: MessageStatus.SENT,
        sendState: "sent",
        createdAt: "2026-04-10T10:00:01.000Z",
      }) as never,
    );

    const messages = getRoomMessages();
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "temp-same-content-1",
      "server-same-content-1",
    ]);
  });

  it("keeps same-content messages from different senders as separate entries", () => {
    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "server-same-content-user-a",
        clientMessageId: undefined,
        localId: undefined,
        stableId: undefined,
        senderId: "user-a",
        content: "ok",
        status: MessageStatus.SENT,
        sendState: "sent",
        createdAt: "2026-04-10T10:00:00.000Z",
      }) as never,
    );

    useChatStore.getState().addMessage(
      "room-1",
      makeMessage({
        id: "server-same-content-user-b",
        clientMessageId: undefined,
        localId: undefined,
        stableId: undefined,
        senderId: "user-b",
        content: "ok",
        status: MessageStatus.SENT,
        sendState: "sent",
        createdAt: "2026-04-10T10:00:00.200Z",
      }) as never,
    );

    const messages = getRoomMessages();
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "server-same-content-user-a",
      "server-same-content-user-b",
    ]);
  });

  it("deduplicates duplicate realtime deliveries without double unread or reorder drift", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
        unreadCount: 0,
        summaryVersion: 1,
        lastActivityAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeConversation({
        id: "room-2",
        conversationId: "room-2",
        unreadCount: 0,
        summaryVersion: 1,
        lastActivityAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T08:00:00.000Z",
      }),
    ] as never);

    const incomingMessage = makeMessage({
      id: "server-realtime-1",
      conversationId: "room-1",
      senderId: "user-b",
      senderName: "Bob",
      content: "hello again",
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-10T10:00:00.000Z",
      status: MessageStatus.SENT,
      sendState: "sent",
    }) as never;

    const first = useChatStore
      .getState()
      .ingestConversationMessageEvent("room-1", incomingMessage, {
        incrementUnread: true,
        hydrated: true,
        source: "message:new",
      });
    const duplicate = useChatStore
      .getState()
      .ingestConversationMessageEvent("room-1", incomingMessage, {
        incrementUnread: true,
        hydrated: true,
        source: "message:new",
      });

    const roomMessages = useChatStore.getState().messages["room-1"] || [];
    const orderedRooms = sortConversationsByActivity(
      useChatStore.getState().conversations,
    ).map((conversation) => conversation.id);
    const roomOne = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === "room-1");

    expect(first.status).toBe("new");
    expect(first.unreadDelta).toBe(1);
    expect(duplicate.status).toBe("merged");
    expect(duplicate.unreadDelta).toBe(0);
    expect(roomMessages).toHaveLength(1);
    expect(roomOne?.unreadCount).toBe(1);
    expect(useChatStore.getState().totalUnreadCount).toBe(1);
    expect(orderedRooms).toEqual(["room-1", "room-2"]);
  });

  it("merges paginated conversation overlap by id and keeps the newer summary", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-overlap",
        conversationId: "room-overlap",
        unreadCount: 1,
        summaryVersion: 2,
        lastActivityAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        lastMessage: {
          id: "msg-old",
          senderId: "user-a",
          senderName: "Alice",
          content: "old summary",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T09:00:00.000Z",
        },
      }),
    ] as never);

    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-overlap",
        conversationId: "room-overlap",
        unreadCount: 4,
        summaryVersion: 5,
        lastActivityAt: "2026-04-10T11:00:00.000Z",
        updatedAt: "2026-04-10T11:00:00.000Z",
        lastMessage: {
          id: "msg-new",
          senderId: "user-b",
          senderName: "Bob",
          content: "new summary",
          type: "text",
          isDeleted: false,
          createdAt: "2026-04-10T11:00:00.000Z",
        },
      }),
      makeConversation({
        id: "room-other",
        conversationId: "room-other",
        unreadCount: 0,
        summaryVersion: 1,
        lastActivityAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T08:00:00.000Z",
      }),
    ] as never);

    const conversations = sortConversationsByActivity(
      useChatStore.getState().conversations,
    );
    const overlap = conversations.find(
      (conversation) => conversation.id === "room-overlap",
    );

    expect(conversations.map((conversation) => conversation.id)).toEqual([
      "room-overlap",
      "room-other",
    ]);
    expect(
      conversations.filter(
        (conversation) => conversation.id === "room-overlap",
      ),
    ).toHaveLength(1);
    expect(overlap?.summaryVersion).toBe(5);
    expect(overlap?.unreadCount).toBe(4);
    expect(overlap?.lastMessage?.id).toBe("msg-new");
  });

  it("merges newly loaded conversation pages without dropping previously loaded rooms", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-page-1",
        conversationId: "room-page-1",
        summaryVersion: 2,
        lastActivityAt: "2026-04-10T11:00:00.000Z",
        updatedAt: "2026-04-10T11:00:00.000Z",
      }),
    ] as never);

    useChatStore.getState().mergeConversationPage([
      makeConversation({
        id: "room-page-2",
        conversationId: "room-page-2",
        summaryVersion: 1,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    expect(useChatStore.getState().orderedConversationIds).toEqual([
      "room-page-1",
      "room-page-2",
    ]);
  });

  it("preserves rooms from later pages when conversation list refresh reloads page 1", async () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-page-1",
        conversationId: "room-page-1",
        unreadCount: 1,
        summaryVersion: 2,
        lastActivityAt: "2026-04-10T11:00:00.000Z",
        updatedAt: "2026-04-10T11:00:00.000Z",
      }),
      makeConversation({
        id: "room-page-2",
        conversationId: "room-page-2",
        unreadCount: 0,
        summaryVersion: 1,
        lastActivityAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:00:00.000Z",
      }),
    ] as never);

    getConversationsMock.mockResolvedValueOnce(
      makeSuccessEnvelope([
        makeConversation({
          id: "room-page-1",
          conversationId: "room-page-1",
          unreadCount: 4,
          summaryVersion: 5,
          lastActivityAt: "2026-04-10T12:00:00.000Z",
          updatedAt: "2026-04-10T12:00:00.000Z",
          lastMessage: {
            id: "msg-page-refresh",
            senderId: "user-b",
            senderName: "Bob",
            content: "refreshed",
            type: "text",
            isDeleted: false,
            createdAt: "2026-04-10T12:00:00.000Z",
          },
        }),
      ]),
    );

    await useChatStore.getState().fetchConversations();

    const conversations = useChatStore.getState().conversations;
    const refreshed = conversations.find(
      (conversation) => conversation.id === "room-page-1",
    );

    expect(getConversationsMock).toHaveBeenCalledWith(1, 100);
    expect(conversations.map((conversation) => conversation.id)).toEqual([
      "room-page-1",
      "room-page-2",
    ]);
    expect(refreshed?.summaryVersion).toBe(5);
    expect(refreshed?.unreadCount).toBe(4);
    expect(refreshed?.lastMessage?.id).toBe("msg-page-refresh");
  });

  it("tracks canonical message boundaries separately from optimistic rows", () => {
    useChatStore.getState().setConversations([
      makeConversation({
        id: "room-1",
        conversationId: "room-1",
      }),
    ] as never);

    useChatStore.getState().setMessages("room-1", [
      makeMessage({
        id: "temp-room-1",
        localId: "temp-room-1",
        clientMessageId: "client-room-1",
        stableId: "client-room-1",
        sendState: "sending",
        status: MessageStatus.SENDING,
        createdAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
      }),
      makeMessage({
        id: "msg-older",
        createdAt: "2026-04-10T09:05:00.000Z",
        updatedAt: "2026-04-10T09:05:00.000Z",
      }),
      makeMessage({
        id: "msg-newer",
        createdAt: "2026-04-10T09:10:00.000Z",
        updatedAt: "2026-04-10T09:10:00.000Z",
      }),
    ] as never);

    expect(
      useChatStore.getState().messageWindowByConversation["room-1"],
    ).toEqual({
      oldestLoadedMessageId: "msg-older",
      oldestLoadedAt: "2026-04-10T09:05:00.000Z",
      newestLoadedMessageId: "msg-newer",
      newestLoadedAt: "2026-04-10T09:10:00.000Z",
    });
  });

  it("allows multiple consecutive sends without waiting for previous request", async () => {
    const firstDeferred =
      createDeferred<ReturnType<typeof makeSuccessEnvelope>>();
    sendMessageMock
      .mockReturnValueOnce(firstDeferred.promise)
      .mockResolvedValueOnce(
        makeSuccessEnvelope(
          makeMessage({
            id: "server-consecutive-2",
            content: "second",
            status: MessageStatus.SENT,
          }),
        ),
      );

    const firstPromise = useChatStore
      .getState()
      .sendMessage("room-1", "first", MessageType.TEXT);
    const secondPromise = useChatStore
      .getState()
      .sendMessage("room-1", "second", MessageType.TEXT);

    const afterBothTriggered = getRoomMessages();
    expect(afterBothTriggered.length).toBeGreaterThanOrEqual(2);
    expect(
      afterBothTriggered.some((message) => message.content === "first"),
    ).toBe(true);
    expect(
      afterBothTriggered.some((message) => message.content === "second"),
    ).toBe(true);

    const firstOptimistic = afterBothTriggered.find(
      (message) =>
        message.content === "first" && message.id.startsWith("temp-"),
    );
    firstDeferred.resolve(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-consecutive-1",
          clientMessageId: firstOptimistic?.clientMessageId,
          localId: firstOptimistic?.localId,
          content: "first",
          status: MessageStatus.SENT,
        }),
      ),
    );

    await Promise.all([firstPromise, secondPromise]);
    const reconciled = getRoomMessages();
    expect(
      reconciled.filter((message) => message.content === "first"),
    ).toHaveLength(1);
    expect(
      reconciled.filter((message) => message.content === "second"),
    ).toHaveLength(1);
  });

  it("keeps two consecutive same-content sends visible and reconciles them independently", async () => {
    const firstDeferred =
      createDeferred<ReturnType<typeof makeSuccessEnvelope>>();
    const secondDeferred =
      createDeferred<ReturnType<typeof makeSuccessEnvelope>>();
    sendMessageMock
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise);

    const firstPromise = useChatStore
      .getState()
      .sendMessage("room-1", "ok", MessageType.TEXT);
    const secondPromise = useChatStore
      .getState()
      .sendMessage("room-1", "ok", MessageType.TEXT);

    const optimisticMessages = getRoomMessages();
    expect(
      optimisticMessages.filter((message) => message.content === "ok"),
    ).toHaveLength(2);

    const [firstOptimistic, secondOptimistic] = optimisticMessages;
    firstDeferred.resolve(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-same-1",
          clientMessageId: firstOptimistic?.clientMessageId,
          localId: firstOptimistic?.localId,
          content: "ok",
          status: MessageStatus.SENT,
        }),
      ),
    );
    secondDeferred.resolve(
      makeSuccessEnvelope(
        makeMessage({
          id: "server-same-2",
          clientMessageId: secondOptimistic?.clientMessageId,
          localId: secondOptimistic?.localId,
          content: "ok",
          status: MessageStatus.SENT,
        }),
      ),
    );

    await Promise.all([firstPromise, secondPromise]);

    const reconciled = getRoomMessages();
    expect(
      reconciled.filter((message) => message.content === "ok"),
    ).toHaveLength(2);
    expect(reconciled.map((message) => message.id)).toEqual([
      "server-same-1",
      "server-same-2",
    ]);
  });

  it("marks message as timeout-failed when server does not confirm within timeout window", async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<ReturnType<typeof makeSuccessEnvelope>>();
    sendMessageMock.mockReturnValueOnce(deferred.promise);

    const sendPromise = useChatStore
      .getState()
      .sendMessage("room-1", "timeout me", MessageType.TEXT);

    await vi.advanceTimersByTimeAsync(25_100);

    const failed = getRoomMessages();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.sendState).toBe("failed");
    expect(failed[0]?.failureReason).toBe("timeout");
    expect(failed[0]?.errorCode).toBe("REQUEST_TIMEOUT");

    deferred.reject({
      isAxiosError: true,
      message: "timeout",
      code: "ECONNABORTED",
      response: undefined,
    });
    await expect(sendPromise).rejects.toBeTruthy();
    vi.useRealTimers();
  });
});
