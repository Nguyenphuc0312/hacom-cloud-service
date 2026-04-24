import { unwrapApiSuccess } from "../lib/apiContract";
import { normalizeConversation } from "../lib/conversationAdapter";
import { logMessageDebug } from "../utils/messageDebug";
import {
  acknowledgeConversationJoined,
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
  registerReconnectConversationJoins,
  type ConversationSyncCoordinatorState,
} from "./useWebSocketConversationCoordinator";
import type { Conversation, Message } from "../types";

type MessageCursor = {
  at: string;
  id: string;
  seq?: number;
};

type ChatStateSnapshot = {
  selectedConversationId: string | null;
  lastConversationUpdatedAfterCursor: string | null;
  hasAuthoritativeHistoryByConversation: Record<string, boolean>;
  hasNewerMessagesByConversation: Record<string, boolean>;
  messagesHydratedByConversation: Record<string, boolean>;
  messageWindowByConversation: Record<
    string,
    {
      newestLoadedMessageId: string | null;
      newestLoadedAt: string | null;
      newestLoadedSeq?: number | null;
    }
  >;
  messages: Record<string, Message[]>;
};

type FetchMessagesResult = {
  loaded: number;
  hasMore: boolean;
};

export type WebSocketResyncCoordinatorState = {
  shouldResyncOnConnect: boolean;
  resyncGapCooldownRef: Map<string, number>;
  conversationListRefreshInFlight: Promise<void> | null;
  conversationResyncInFlight: Map<string, Promise<void>>;
  conversationRefreshInFlight: Map<string, Promise<void>>;
  conversationRefreshTimers: Map<string, ReturnType<typeof setTimeout>>;
  conversationSyncFallbackTimers: Map<string, ReturnType<typeof setTimeout>>;
};

export const createWebSocketResyncCoordinatorState =
  (): WebSocketResyncCoordinatorState => ({
    shouldResyncOnConnect: false,
    resyncGapCooldownRef: new Map(),
    conversationListRefreshInFlight: null,
    conversationResyncInFlight: new Map(),
    conversationRefreshInFlight: new Map(),
    conversationRefreshTimers: new Map(),
    conversationSyncFallbackTimers: new Map(),
  });

export const shouldRefreshConversationSummariesForScopes = (
  scopes: string[],
): boolean =>
  scopes.length === 0 ||
  scopes.some((scope) =>
    ["rooms", "conversations", "groups", "user_scoped", "permissions"].includes(
      scope,
    ),
  );

export const shouldResyncJoinedConversationsForScopes = (
  scopes: string[],
): boolean =>
  scopes.length === 0 ||
  scopes.some((scope) => ["rooms", "conversations", "groups"].includes(scope));

export const shouldTriggerFriendshipResyncForScopes = (
  scopes: string[],
): boolean =>
  scopes.length === 0 ||
  scopes.some((scope) =>
    ["friendships", "permissions", "user_scoped"].includes(scope),
  );

export const shouldSyncUserSettingsForScopes = (scopes: string[]): boolean =>
  scopes.length === 0 || scopes.includes("user_settings");

const CONVERSATION_SYNC_FALLBACK_TIMEOUT_MS = 2_500;
const CONVERSATION_SNAPSHOT_REFRESH_DEBOUNCE_MS = 250;

const toCursorValue = (value: unknown): string | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return undefined;
};

const toCursorSeq = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
};

const resolveLatestCursor = (
  chatState: ChatStateSnapshot,
  conversationId: string,
): MessageCursor | undefined => {
  const loadedWindow = chatState.messageWindowByConversation[conversationId];
  if (loadedWindow?.newestLoadedMessageId && loadedWindow.newestLoadedAt) {
    return {
      at: loadedWindow.newestLoadedAt,
      id: loadedWindow.newestLoadedMessageId,
      seq: toCursorSeq(loadedWindow.newestLoadedSeq),
    };
  }

  const conversationMessages = chatState.messages[conversationId] || [];
  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    const candidate = conversationMessages[index];
    const candidateId = candidate?.id;
    const candidateAt = toCursorValue(candidate?.createdAt);
    const candidateSeq = toCursorSeq(candidate?.serverSeq);
    if (
      typeof candidateId === "string" &&
      !candidateId.startsWith("temp-") &&
      typeof candidateAt === "string"
    ) {
      return {
        at: candidateAt,
        id: candidateId,
        seq: candidateSeq,
      };
    }
  }

  return undefined;
};

const shouldSkipKnownLatestInitialSync = (
  chatState: ChatStateSnapshot,
  conversationId: string,
  reason?: "initial-sync" | "reconnect" | "conversation-refresh",
): boolean =>
  reason === "initial-sync" &&
  chatState.hasAuthoritativeHistoryByConversation[conversationId] &&
  chatState.hasNewerMessagesByConversation[conversationId] === false;

export const createWebSocketResyncCoordinator = ({
  state,
  conversationSyncState,
  getChatState,
  fetchMessages,
  fetchConversations,
  fetchConversationSummary,
  fetchConversationPage,
  upsertConversationSummary,
  refreshUnreadSummarySnapshot,
  triggerFriendshipResync,
  syncUserSettings,
  clearConversationJoinRetry,
}: {
  state: WebSocketResyncCoordinatorState;
  conversationSyncState: ConversationSyncCoordinatorState;
  getChatState: () => ChatStateSnapshot;
  fetchMessages: (
    conversationId: string,
    before?: string,
    after?: string,
    options?: {
      afterId?: string;
      afterSeq?: number;
      syncReason?: "initial-sync" | "reconnect" | "conversation-refresh";
      source?: string;
      queryType?: "pagination_newer";
      selectedConversationIdAtDispatch?: string | null;
    },
  ) => Promise<FetchMessagesResult>;
  fetchConversations: () => Promise<void>;
  fetchConversationSummary: (conversationId: string) => Promise<unknown>;
  fetchConversationPage: (
    page: number,
    limit: number,
    options: { updatedAfter: string },
  ) => Promise<unknown>;
  upsertConversationSummary: (
    conversation: Conversation,
  ) => {
    applied: boolean;
    gapDetected: boolean;
    previousVersion: number;
    nextVersion: number;
    reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
  };
  refreshUnreadSummarySnapshot: () => Promise<void>;
  triggerFriendshipResync: (reason: "socket_reconnect") => void;
  syncUserSettings: () => Promise<void>;
  clearConversationJoinRetry: (conversationId: string) => void;
}) => {
  const clearConversationSyncFallback = (conversationId: string) => {
    const timer = state.conversationSyncFallbackTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      state.conversationSyncFallbackTimers.delete(conversationId);
    }
  };

  const clearAllConversationSyncFallbacks = () => {
    state.conversationSyncFallbackTimers.forEach((timer) => clearTimeout(timer));
    state.conversationSyncFallbackTimers.clear();
  };

  const clearConversationSnapshotRefresh = (conversationId: string) => {
    const timer = state.conversationRefreshTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      state.conversationRefreshTimers.delete(conversationId);
    }
  };

  const clearAllConversationSnapshotRefreshes = () => {
    state.conversationRefreshTimers.forEach((timer) => clearTimeout(timer));
    state.conversationRefreshTimers.clear();
  };

  const resyncConversation = async (
    conversationId: string,
    options?: {
      reason?: "initial-sync" | "reconnect" | "conversation-refresh";
    },
  ) => {
    const chatState = getChatState();
    if (
      shouldSkipKnownLatestInitialSync(chatState, conversationId, options?.reason)
    ) {
      logMessageDebug("useWebSocket", "delta_sync_blocked_known_latest", {
        conversationId,
        reason: options?.reason,
        hydrated: chatState.messagesHydratedByConversation[conversationId],
        hasAuthoritativeHistory:
          chatState.hasAuthoritativeHistoryByConversation[conversationId],
        hasNext: chatState.hasNewerMessagesByConversation[conversationId],
      });
      return;
    }

    let afterCursor = resolveLatestCursor(chatState, conversationId);
    if (!afterCursor) return;

    logMessageDebug("useWebSocket", "delta_sync_started", {
      conversationId,
      reason: options?.reason,
      afterCursor,
    });

    for (let attempts = 0; attempts < 10; attempts += 1) {
      const result = await fetchMessages(conversationId, undefined, afterCursor.at, {
        afterId: afterCursor.id,
        ...(typeof afterCursor.seq === "number" ? { afterSeq: afterCursor.seq } : {}),
        syncReason: options?.reason,
        source: "delta_sync",
        queryType: "pagination_newer",
        selectedConversationIdAtDispatch: getChatState().selectedConversationId,
      });
      logMessageDebug("useWebSocket", "delta_sync_page_completed", {
        conversationId,
        reason: options?.reason,
        attempt: attempts,
        afterCursor,
        result,
      });

      if (!result.loaded || !result.hasMore) {
        break;
      }

      const nextCursor = resolveLatestCursor(getChatState(), conversationId);
      if (
        !nextCursor ||
        (nextCursor.at === afterCursor.at && nextCursor.id === afterCursor.id)
      ) {
        break;
      }

      afterCursor = nextCursor;
    }
  };

  const scheduleConversationResync = (
    conversationId: string,
    options?: {
      reason?: "initial-sync" | "reconnect" | "conversation-refresh";
    },
  ) => {
    if (
      shouldSkipKnownLatestInitialSync(
        getChatState(),
        conversationId,
        options?.reason,
      )
    ) {
      logMessageDebug("useWebSocket", "delta_sync_schedule_skipped", {
        conversationId,
        reason: options?.reason,
      });
      return Promise.resolve();
    }

    const inFlight = state.conversationResyncInFlight.get(conversationId);
    if (inFlight) {
      return inFlight;
    }

    const request = resyncConversation(conversationId, options).finally(() => {
      state.conversationResyncInFlight.delete(conversationId);
    });
    state.conversationResyncInFlight.set(conversationId, request);
    logMessageDebug("useWebSocket", "delta_sync_scheduled", {
      conversationId,
      reason: options?.reason,
    });
    return request;
  };

  const refreshConversationSnapshot = (conversationId: string): Promise<void> => {
    const inFlight = state.conversationRefreshInFlight.get(conversationId);
    if (inFlight) {
      return inFlight;
    }

    const request = fetchConversationSummary(conversationId)
      .then((response) => {
        upsertConversationSummary(unwrapApiSuccess(response as never));
      })
      .catch(async () => {
        await fetchConversations().catch(() => {
          // no-op: best effort authoritative refresh
        });
      })
      .finally(() => {
        state.conversationRefreshInFlight.delete(conversationId);
      });

    state.conversationRefreshInFlight.set(conversationId, request);
    return request;
  };

  const scheduleConversationSnapshotRefresh = (
    conversationId: string,
    options?: {
      delayMs?: number;
      reason?: string;
    },
  ): Promise<void> =>
    new Promise((resolve) => {
      const delayMs =
        options?.delayMs ?? CONVERSATION_SNAPSHOT_REFRESH_DEBOUNCE_MS;
      clearConversationSnapshotRefresh(conversationId);

      const timer = setTimeout(() => {
        state.conversationRefreshTimers.delete(conversationId);
        logMessageDebug("useWebSocket", "conversation_snapshot_refresh_scheduled", {
          conversationId,
          reason: options?.reason,
        });
        void refreshConversationSnapshot(conversationId).finally(resolve);
      }, Math.max(0, delayMs));

      state.conversationRefreshTimers.set(conversationId, timer);
    });

  const refreshChangedConversationSummaries = async (options?: {
    reason?: "initial" | "reconnect" | "retry" | "resync_required" | "resume";
    forceFull?: boolean;
  }): Promise<void> => {
    if (state.conversationListRefreshInFlight) {
      return state.conversationListRefreshInFlight;
    }

    const currentCursor = getChatState().lastConversationUpdatedAfterCursor;
    const shouldFetchFull = options?.forceFull || !currentCursor;
    const request = (async () => {
      if (shouldFetchFull) {
        await fetchConversations();
        return;
      }

      const limit = 100;
      let page = 1;
      let loaded = 0;

      while (page <= 10) {
        const response = await fetchConversationPage(page, limit, {
          updatedAfter: currentCursor,
        });
        const batch =
          (unwrapApiSuccess(response as never) as unknown[] | undefined) ?? [];
        const normalizedBatch = batch
          .map((conversation) => normalizeConversation(conversation))
          .filter((conversation): conversation is Conversation => conversation !== null);

        normalizedBatch.forEach((conversation) => {
          const result = upsertConversationSummary(conversation);
          if (result.gapDetected) {
            logMessageDebug("useWebSocket", "conversation_summary_gap_detected", {
              conversationId: conversation.id,
              previousVersion: result.previousVersion,
              nextVersion: result.nextVersion,
              reason: options?.reason,
            });
          }
        });

        loaded += normalizedBatch.length;
        if (normalizedBatch.length < limit) {
          break;
        }
        page += 1;
      }

      logMessageDebug("useWebSocket", "conversation_summary_refresh_completed", {
        reason: options?.reason,
        updatedAfter: currentCursor,
        loaded,
      });
    })()
      .catch(async (error) => {
        logMessageDebug("useWebSocket", "conversation_summary_refresh_failed", {
          reason: options?.reason,
          updatedAfter: currentCursor,
          error: error instanceof Error ? error.message : "unknown_refresh_error",
        });
        await fetchConversations();
      })
      .finally(() => {
        state.conversationListRefreshInFlight = null;
      });

    state.conversationListRefreshInFlight = request;
    return request;
  };

  const reconcileConversationAuthoritative = (
    conversationId: string,
    reason: "skip" | "initial-sync" | "reconnect" | "conversation-refresh",
  ): Promise<void> => {
    if (reason === "skip") {
      return scheduleConversationSnapshotRefresh(conversationId, {
        delayMs: 0,
        reason,
      }).catch(() => {
        // no-op: best effort authoritative refresh
      });
    }

    return Promise.allSettled([
      scheduleConversationResync(conversationId, { reason }),
      scheduleConversationSnapshotRefresh(conversationId, {
        delayMs: 0,
        reason,
      }),
    ]).then(() => {
      // no-op: best effort authoritative reconcile
    });
  };

  const maybeReconcileGap = (conversationId: string, reason: string) => {
    const now = Date.now();
    const lastAt = state.resyncGapCooldownRef.get(conversationId) ?? 0;
    if (now - lastAt < 5_000) {
      return;
    }

    state.resyncGapCooldownRef.set(conversationId, now);
    logMessageDebug("useWebSocket", "conversation_gap_reconcile_requested", {
      conversationId,
      reason,
    });
    void refreshUnreadSummarySnapshot().catch(() => {
      // no-op: best effort badge reconcile
    });
    void reconcileConversationAuthoritative(conversationId, "conversation-refresh");
  };

  const handleSocketConnected = () => {
    logMessageDebug("useWebSocket", "socket_connected", {
      shouldResync: state.shouldResyncOnConnect,
      joinedConversationIds: Array.from(conversationSyncState.joinedConversationIds),
    });

    const shouldResync = state.shouldResyncOnConnect;
    state.shouldResyncOnConnect = false;

    if (shouldResync) {
      void refreshChangedConversationSummaries({
        reason: "reconnect",
        forceFull: true,
      }).catch(() => {
        // no-op: best effort sidebar resync
      });
      void refreshUnreadSummarySnapshot().catch(() => {
        // no-op: best effort unread resync
      });
      triggerFriendshipResync("socket_reconnect");
    }

    const conversationIdsToJoin = registerReconnectConversationJoins(
      conversationSyncState,
      shouldResync,
    );
    conversationIdsToJoin.forEach((conversationId) => {
      clearConversationSyncFallback(conversationId);
    });

    return { shouldResync, conversationIdsToJoin };
  };

  const handleSocketDisconnected = (options: { hasConnectedOnce: boolean }) => {
    if (options.hasConnectedOnce) {
      state.shouldResyncOnConnect = true;
    }
    conversationSyncState.subscribedConversationIds.clear();
    clearAllConversationSyncFallbacks();
  };

  const handleConversationJoinedAck = (conversationId: string) => {
    const syncStrategy = acknowledgeConversationJoined(
      conversationSyncState,
      conversationId,
    );
    clearConversationJoinRetry(conversationId);

    logMessageDebug("useWebSocket", "conversation_joined", {
      conversationId,
      pendingSyncStrategy: syncStrategy,
    });
    if (!syncStrategy) {
      return null;
    }

    clearConversationSyncFallback(conversationId);
    const fallbackTimer = setTimeout(() => {
      state.conversationSyncFallbackTimers.delete(conversationId);

      const stillPending =
        conversationSyncState.pendingConversationSync.get(conversationId);
      if (!stillPending) {
        return;
      }

      conversationSyncState.pendingConversationSync.delete(conversationId);
      logMessageDebug("useWebSocket", "conversation_sync_fallback_applied", {
        conversationId,
        strategy: stillPending,
      });

      const fallbackReason =
        stillPending === "skip" ? "conversation-refresh" : stillPending;
      void reconcileConversationAuthoritative(conversationId, fallbackReason);
    }, CONVERSATION_SYNC_FALLBACK_TIMEOUT_MS);

    state.conversationSyncFallbackTimers.set(conversationId, fallbackTimer);
    return syncStrategy;
  };

  const handleConversationResynced = (targetRoomIds: string[]) => {
    logMessageDebug("useWebSocket", "conversation_resynced_received", {
      targetRoomIds,
    });

    const drainedRooms = drainPendingConversationSync(
      conversationSyncState.pendingConversationSync,
      conversationSyncState.joinedConversationIds,
      targetRoomIds,
    );

    drainedRooms.forEach(({ conversationId, strategy }) => {
      clearConversationSyncFallback(conversationId);
      logMessageDebug("useWebSocket", "conversation_resynced_applied", {
        conversationId,
        strategy,
        targetRoomIds,
      });
      void reconcileConversationAuthoritative(conversationId, strategy);
    });
  };

  const handleResyncRequired = (scopes: string[]) => {
    logMessageDebug("useWebSocket", "resync_required_received", {
      scopes,
    });

    if (shouldRefreshConversationSummariesForScopes(scopes)) {
      void refreshChangedConversationSummaries({
        reason: "resync_required",
        forceFull: true,
      }).catch(() => {
        // no-op: best effort sidebar refresh
      });
      void refreshUnreadSummarySnapshot().catch(() => {
        // no-op: best effort unread refresh
      });
    }

    if (shouldResyncJoinedConversationsForScopes(scopes)) {
      const drainedRooms = drainPendingConversationSyncForResyncRequired(
        conversationSyncState.pendingConversationSync,
        conversationSyncState.joinedConversationIds,
      );

      drainedRooms.forEach(({ conversationId, strategy }) => {
        clearConversationSyncFallback(conversationId);
        void reconcileConversationAuthoritative(conversationId, strategy);
      });
    }

    if (shouldTriggerFriendshipResyncForScopes(scopes)) {
      triggerFriendshipResync("socket_reconnect");
    }

    if (shouldSyncUserSettingsForScopes(scopes)) {
      void syncUserSettings();
    }
  };

  const resyncClientState = async (
    reason: "browser_online" | "visibility_resume" | "pageshow" | "focus",
  ): Promise<void> => {
    logMessageDebug("useWebSocket", "client_state_resync_requested", {
      reason,
      joinedConversationIds: Array.from(conversationSyncState.joinedConversationIds),
    });

    await Promise.allSettled([
      refreshChangedConversationSummaries({
        reason: "resume",
        forceFull: true,
      }),
      refreshUnreadSummarySnapshot(),
    ]);

    const joinedConversationIds = Array.from(
      conversationSyncState.joinedConversationIds,
    );
    await Promise.allSettled(
      joinedConversationIds.map((conversationId) =>
        reconcileConversationAuthoritative(conversationId, "reconnect"),
      ),
    );

    triggerFriendshipResync("socket_reconnect");
  };

  const reset = () => {
    clearAllConversationSnapshotRefreshes();
    clearAllConversationSyncFallbacks();
    state.shouldResyncOnConnect = false;
    state.resyncGapCooldownRef.clear();
    state.conversationListRefreshInFlight = null;
    state.conversationResyncInFlight.clear();
    state.conversationRefreshInFlight.clear();
  };

  return {
    clearConversationSyncFallback,
    clearAllConversationSyncFallbacks,
    clearConversationSnapshotRefresh,
    clearAllConversationSnapshotRefreshes,
    scheduleConversationResync,
    scheduleConversationSnapshotRefresh,
    refreshChangedConversationSummaries,
    reconcileConversationAuthoritative,
    maybeReconcileGap,
    handleSocketConnected,
    handleSocketDisconnected,
    handleConversationJoinedAck,
    handleConversationResynced,
    handleResyncRequired,
    resyncClientState,
    reset,
  };
};
