import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType } from "../types";

const { getMessagesMock, sendMessageMock } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(),
  sendMessageMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  conversationApi: {
    getConversations: vi.fn(),
  },
  messageApi: {
    getMessages: getMessagesMock,
    markAsRead: vi.fn(),
    sendMessage: sendMessageMock,
  },
}));

import { useChatStore } from "./chatStore";

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

describe("chatStore phase-1 realtime flows", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    getMessagesMock.mockReset();
    sendMessageMock.mockReset();
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

  it("deduplicates optimistic message with refetch fallback when client id is unavailable", async () => {
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
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("server-fallback-1");
    expect(messages[0]?.sendState).toBe("sent");
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
