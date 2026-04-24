import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConversationSyncCoordinatorState,
  registerConversationJoinIntent,
} from "./useWebSocketConversationCoordinator";
import {
  createWebSocketResyncCoordinator,
  createWebSocketResyncCoordinatorState,
  shouldRefreshConversationSummariesForScopes,
  shouldResyncJoinedConversationsForScopes,
  shouldSyncUserSettingsForScopes,
  shouldTriggerFriendshipResyncForScopes,
} from "./useWebSocketResyncCoordinator";

const createSuccessEnvelope = <T,>(data: T) => ({
  success: true as const,
  data,
  statusCode: 200,
  message: "ok",
  requestId: "req-1",
});

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createChatState = () => ({
  selectedConversationId: "room-1",
  lastConversationUpdatedAfterCursor: null,
  hasAuthoritativeHistoryByConversation: {
    "room-1": false,
  },
  hasNewerMessagesByConversation: {
    "room-1": true,
  },
  messagesHydratedByConversation: {
    "room-1": true,
  },
  messageWindowByConversation: {
    "room-1": {
      newestLoadedMessageId: "msg-1",
      newestLoadedAt: "2026-04-19T00:00:00.000Z",
      newestLoadedSeq: 41,
    },
  },
  messages: {
    "room-1": [],
  },
});

const createCoordinatorHarness = (overrides?: {
  chatState?: ReturnType<typeof createChatState>;
}) => {
  const chatState = overrides?.chatState ?? createChatState();
  const state = createWebSocketResyncCoordinatorState();
  const conversationSyncState = createConversationSyncCoordinatorState();
  const fetchMessages = vi.fn().mockResolvedValue({
    loaded: 0,
    hasMore: false,
  });
  const fetchConversations = vi.fn().mockResolvedValue(undefined);
  const fetchConversationSummary = vi
    .fn()
    .mockResolvedValue(createSuccessEnvelope({ id: "room-1", roomType: "direct" }));
  const fetchConversationPage = vi.fn().mockResolvedValue(createSuccessEnvelope([]));
  const upsertConversationSummary = vi.fn().mockReturnValue({
    applied: true,
    gapDetected: false,
    previousVersion: 0,
    nextVersion: 1,
  });
  const refreshUnreadSummarySnapshot = vi.fn().mockResolvedValue(undefined);
  const triggerFriendshipResync = vi.fn();
  const syncUserSettings = vi.fn().mockResolvedValue(undefined);
  const clearConversationJoinRetry = vi.fn();

  const controller = createWebSocketResyncCoordinator({
    state,
    conversationSyncState,
    getChatState: () => chatState,
    fetchMessages,
    fetchConversations,
    fetchConversationSummary,
    fetchConversationPage,
    upsertConversationSummary,
    refreshUnreadSummarySnapshot,
    triggerFriendshipResync,
    syncUserSettings,
    clearConversationJoinRetry,
  });

  return {
    chatState,
    state,
    conversationSyncState,
    controller,
    fetchMessages,
    fetchConversations,
    fetchConversationSummary,
    fetchConversationPage,
    upsertConversationSummary,
    refreshUnreadSummarySnapshot,
    triggerFriendshipResync,
    syncUserSettings,
    clearConversationJoinRetry,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useWebSocketResyncCoordinator", () => {
  it("skips initial delta sync when the room is already authoritative and known latest", async () => {
    const chatState = createChatState();
    chatState.hasAuthoritativeHistoryByConversation["room-1"] = true;
    chatState.hasNewerMessagesByConversation["room-1"] = false;
    const { controller, fetchMessages } = createCoordinatorHarness({ chatState });

    await controller.scheduleConversationResync("room-1", {
      reason: "initial-sync",
    });

    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it("dedupes in-flight delta sync requests for the same room", async () => {
    const deferred = createDeferred<{ loaded: number; hasMore: boolean }>();
    const { controller, fetchMessages } = createCoordinatorHarness();
    fetchMessages.mockReturnValueOnce(deferred.promise);

    const first = controller.scheduleConversationResync("room-1", {
      reason: "reconnect",
    });
    const second = controller.scheduleConversationResync("room-1", {
      reason: "reconnect",
    });

    expect(first).toBe(second);
    expect(fetchMessages).toHaveBeenCalledTimes(1);

    deferred.resolve({ loaded: 0, hasMore: false });
    await first;
  });

  it("uses last known messageSeq for reconnect delta recovery", async () => {
    const { controller, fetchMessages } = createCoordinatorHarness();

    await controller.scheduleConversationResync("room-1", {
      reason: "reconnect",
    });

    expect(fetchMessages).toHaveBeenCalledWith(
      "room-1",
      undefined,
      "2026-04-19T00:00:00.000Z",
      expect.objectContaining({
        afterId: "msg-1",
        afterSeq: 41,
        source: "delta_sync",
        queryType: "pagination_newer",
      }),
    );
  });

  it("marks reconnect work and returns rejoin rooms when the socket reconnects", async () => {
    const harness = createCoordinatorHarness();
    registerConversationJoinIntent(harness.conversationSyncState, "room-1");
    registerConversationJoinIntent(harness.conversationSyncState, "room-2", {
      skipInitialDeltaSync: true,
    });
    harness.state.shouldResyncOnConnect = true;

    const result = harness.controller.handleSocketConnected();
    await Promise.resolve();

    expect(result).toEqual({
      shouldResync: true,
      conversationIdsToJoin: ["room-1", "room-2"],
    });
    expect(harness.fetchConversations).toHaveBeenCalledTimes(1);
    expect(harness.refreshUnreadSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(harness.triggerFriendshipResync).toHaveBeenCalledWith(
      "socket_reconnect",
    );
    expect(harness.conversationSyncState.pendingConversationSync.get("room-1")).toBe(
      "reconnect",
    );
    expect(harness.conversationSyncState.pendingConversationSync.get("room-2")).toBe(
      "reconnect",
    );
  });

  it("applies fallback reconcile when join ack never receives a resync completion", async () => {
    vi.useFakeTimers();
    const harness = createCoordinatorHarness();
    registerConversationJoinIntent(harness.conversationSyncState, "room-1");

    const strategy = harness.controller.handleConversationJoinedAck("room-1");

    expect(strategy).toBe("initial-sync");
    expect(harness.clearConversationJoinRetry).toHaveBeenCalledWith("room-1");

    await vi.advanceTimersByTimeAsync(2_600);

    expect(harness.conversationSyncState.pendingConversationSync.has("room-1")).toBe(
      false,
    );
    expect(harness.fetchMessages).toHaveBeenCalledTimes(1);
    expect(harness.fetchConversationSummary).toHaveBeenCalledTimes(1);
  });

  it("routes resync-required scopes to the correct subsystem refreshes", async () => {
    const harness = createCoordinatorHarness();
    registerConversationJoinIntent(harness.conversationSyncState, "room-1");

    harness.controller.handleResyncRequired(["rooms"]);
    await Promise.resolve();

    expect(harness.fetchConversations).toHaveBeenCalledTimes(1);
    expect(harness.refreshUnreadSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(harness.fetchMessages).toHaveBeenCalledTimes(1);
    expect(harness.fetchConversationSummary).toHaveBeenCalledTimes(0);
    expect(harness.syncUserSettings).not.toHaveBeenCalled();

    harness.controller.handleResyncRequired(["user_settings"]);
    await Promise.resolve();
    expect(harness.syncUserSettings).toHaveBeenCalledTimes(1);
  });

  it("resyncs summaries, unread, and joined rooms when the app resumes", async () => {
    const harness = createCoordinatorHarness();
    registerConversationJoinIntent(harness.conversationSyncState, "room-1");
    harness.controller.handleConversationJoinedAck("room-1");

    await harness.controller.resyncClientState("visibility_resume");

    expect(harness.fetchConversations).toHaveBeenCalledTimes(1);
    expect(harness.refreshUnreadSummarySnapshot).toHaveBeenCalledTimes(1);
    expect(harness.fetchMessages).toHaveBeenCalledTimes(1);
    expect(harness.fetchConversationSummary).toHaveBeenCalledTimes(1);
    expect(harness.triggerFriendshipResync).toHaveBeenCalledWith(
      "socket_reconnect",
    );
  });

  it("classifies resync scopes consistently", () => {
    expect(shouldRefreshConversationSummariesForScopes(["permissions"])).toBe(
      true,
    );
    expect(shouldResyncJoinedConversationsForScopes(["friendships"])).toBe(
      false,
    );
    expect(shouldTriggerFriendshipResyncForScopes(["user_scoped"])).toBe(true);
    expect(shouldSyncUserSettingsForScopes(["user_settings"])).toBe(true);
  });
});
