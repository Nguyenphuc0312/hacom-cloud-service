/**
 * @fileoverview useWebSocket hook
 * Manages raw WebSocket connection and real-time chat events.
 */

import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  authenticateSocket,
  initSocket,
  connectSocket,
  disconnectSocket,
  getSocket,
  updateSocketAuth,
  WebSocketEvents,
  type ConnectionState,
} from "../lib/socket";
import { AUTH_CONFIG } from "../config";
import { resetAuthFailureState } from "../lib/axios";
import { unwrapApiSuccess } from "../lib/apiContract";
import {
  resolveConversationId,
  resolveConversationIds,
} from "../lib/conversationIdentity";
import { useAuthStore, useChatStore, useGroupStore } from "../stores";
import { useFriendshipStore } from "../stores/friendshipStore";
import { getAccessToken } from "../services/tokenService";
import { conversationApi } from "../services/api";
import {
  ensureFreshAccessToken,
  refreshAccessTokenShared,
  subscribeToAuthRefreshEvents,
} from "../services/authRefreshCoordinator";
import { isTokenExpiringSoon } from "../utils/jwtHelpers";
import {
  isMessageModule,
  notifyGlobalToast,
  notifyRoomInline,
  notifySidebarState,
} from "../utils/notificationRouter";
import {
  formatMessagePreview,
  showSingletonMessageToast,
} from "../utils/messageToast";
import { getPreviewFromMessage } from "../utils/messageContent.utils";
import { RoomType } from "../types";
import type { Mention } from "../types";
import {
  aliasByUserId,
  applyMentionAliases,
  parseMentionDetails,
} from "../utils/mentionAliasText";
import { markPreviewReady, markPreviewFailed } from "./useBatchThumbnailUrl";
import {
  broadcastUnreadSnapshot,
  emitBrowserNotification,
  isDocumentVisibleAndFocused,
  subscribeUnreadSnapshotBroadcast,
  syncAppBadge,
  syncDocumentTitleBadge,
} from "../utils/realtimeNotifications";
import { logMessageDebug } from "../utils/messageDebug";
import {
  decideIncomingMessageNotification,
  normalizeMentionUserIds,
} from "../utils/incomingMessageNotificationPolicy";
import { normalizeConversation } from "../lib/conversationAdapter";
import {
  registerChatEvents,
  registerConnectionEvents,
  registerConversationEvents,
  registerFriendshipEvents,
  registerGroupEvents,
  registerPresenceEvents,
  registerSyncEvents,
  toFriendshipRealtimeDetail,
  createChatRealtimeAdapter,
  hasMessageSequenceGap,
  needsSelfMessageIdentityResync,
  normalizeMessageRealtimeEvent,
} from "../features/chat/realtime";
import { decideSummaryActiveDeltaSync } from "../features/chat/realtime/summaryActiveDeltaReconcile";
import type { NormalizedMessageRealtimeEvent } from "../features/chat/realtime/realtimeEventTypes";
import {
  chatApi,
  fetchConversationTail,
  messagesQueryKey,
} from "../features/api/chatApi";
import {
  getMessageSeq,
} from "../features/chat/domain/messageMerge";
import { findMessageIdentityIndex } from "../features/chat/domain/messageIdentityMatching";
import { dispatchNotificationClick } from "../features/chat/events/chatUiEvents";
import { invalidateConversationFileResources } from "../features/chat/realtime/fileResourceInvalidation";
import { getConversationByIdUseCase } from "../features/chat/usecases/getConversationById";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { invalidateUserProfile } from "../services/userProfileCache";
import { invalidateUserProfileSummary } from "../services/userBatchLoader";
import {
  realtimeMessageDeleted,
  realtimeMessageDelivered,
  realtimeMessageReactionChanged,
  realtimeMessageReceived,
  realtimeMessageUpdated,
  realtimeReadCursorUpdated,
} from "../features/realtime/realtimeMiddleware";
import { realtimeActions } from "../features/realtime/realtimeSlice";
import {
  asRecord,
  asString,
  REMOTE_TYPING_TTL_MS,
  getRealtimeMessageContent,
  getRealtimeSenderName,
  normalizeDeviceType,
  parseTypingExpiryMs,
  shouldSkipGroupConversationRefreshForCurrentUser,
  shouldUseDeltaConversationRefresh,
  toRealtimeConnectionStatus,
} from "./realtimePayload";

// Giữ nguyên API công khai cũ của hook — nơi khác vẫn import từ đây.
export {
  shouldSkipGroupConversationRefreshForCurrentUser,
  shouldUseDeltaConversationRefresh,
};
import { store } from "../store";
import { useAppDispatch } from "../store/hooks";
import { useSettingsStore } from "../settings/settingsStore";
import {
  acknowledgeConversationLeft,
  createConversationSyncCoordinatorState,
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
  registerConversationJoinIntent,
  removeConversationSyncTracking,
  type PendingConversationSyncStrategy,
} from "./useWebSocketConversationCoordinator";
import {
  createWebSocketResyncCoordinator,
  createWebSocketResyncCoordinatorState,
  shouldRefreshConversationSnapshotAfterMessageEvent,
} from "./useWebSocketResyncCoordinator";
import {
  createWebSocketAuthCoordinator,
  createWebSocketAuthCoordinatorState,
} from "./useWebSocketAuthCoordinator";
import {
  createWebSocketConnectionLifecycle,
  createWebSocketConnectionLifecycleState,
  normalizeDisconnectEvent,
} from "./useWebSocketConnectionLifecycle";
import { useNotificationStore } from "../features/notification/state/notificationStore";
import { markChatPerformance } from "../utils/chatPerformance";
import { notifyDebug } from "../utils/logger";
import type { UserSettingsUpdatedPayload } from "@hacom/chat-shared-types/chat";
import type { Message, TypingStatus } from "../types";

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: unknown) => void;
  joinConversation: (
    conversationId: string,
    options?: { skipInitialDeltaSync?: boolean },
  ) => void;
  leaveConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string, type?: string) => void;
  sendTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const getLatestServerSeq = (messages: unknown[]): number | null => {
  let latest: number | null = null;
  messages.forEach((message) => {
    const seq = getMessageSeq(message);
    if (seq === null) {
      return;
    }
    latest = latest === null ? seq : Math.max(latest, seq);
  });
  return latest;
};

const getConversationId = (payload: Record<string, unknown>): string | null => {
  return resolveConversationId(payload, {
    source: "useWebSocket.payload",
    nestedKeys: ["message"],
  });
};

const getConversationIds = (payload: Record<string, unknown>): string[] => {
  const normalizedConversationIds = resolveConversationIds(payload, {
    source: "useWebSocket.payloadCollection",
  });
  if (normalizedConversationIds.length > 0) {
    return normalizedConversationIds;
  }

  const singleConversationId = getConversationId(payload);
  return singleConversationId ? [singleConversationId] : [];
};

const toRealtimeCacheMessage = (
  event: NormalizedMessageRealtimeEvent,
): Message => ({
  ...(event.messagePayload as unknown as Message),
  id:
    asString(event.messagePayload.id) ??
    asString(event.messagePayload._id) ??
    asString(event.messagePayload.messageId) ??
    event.messageId,
  conversationId: event.conversationId,
  ...(event.stableId ? { stableId: event.stableId } : {}),
  ...(event.clientMessageId ? { clientMessageId: event.clientMessageId } : {}),
  ...(event.localId ? { localId: event.localId } : {}),
});

const getConversationMessageCache = (conversationId: string) =>
  chatApi.endpoints.getMessages.select({ conversationId })(store.getState())
    .data?.messages ?? [];

// A poll action (create/vote/close) by anyone also produces a separate BE
// system line ("X tham gia/đổi lựa chọn… Xem") that doesn't reliably arrive via
// its own message:new echo (see FE__poll-self-realtime-echo contract). The poll
// message:new/updated itself DOES arrive live, so when it does we pull the tail
// to surface that system line without a reload. ponytail: reuses the append
// fetch; BE delivering the system echo would let us drop this.
const pollTailFetchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pullConversationTailForPoll = (conversationId: string): void => {
  if (!conversationId) return;
  // Debounce: a burst of votes emits many poll events; coalesce into one fetch.
  const existing = pollTailFetchTimers.get(conversationId);
  if (existing) clearTimeout(existing);
  pollTailFetchTimers.set(
    conversationId,
    setTimeout(() => {
      pollTailFetchTimers.delete(conversationId);
      const newestLoadedSeq =
        chatApi.endpoints.getMessages.select({ conversationId })(
          store.getState(),
        ).data?.newestLoadedSeq ?? null;
      store.dispatch(fetchConversationTail(conversationId, newestLoadedSeq));
    }, 400),
  );
};

const hasMessageInRtkCache = (
  conversationId: string,
  message: Message,
): boolean =>
  findMessageIdentityIndex(
    getConversationMessageCache(conversationId),
    message,
  ) >= 0;

const hasMessageIdInRtkCache = (
  conversationId: string,
  messageId: string,
): boolean =>
  findMessageIdentityIndex(getConversationMessageCache(conversationId), {
    id: messageId,
    localId: messageId,
    stableId: messageId,
    clientMessageId: messageId,
  }) >= 0;

export {
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
};
export type { PendingConversationSyncStrategy };

const CONVERSATION_JOIN_ACK_TIMEOUT_MS = 2_000;
const CONVERSATION_JOIN_RETRY_DELAY_MAX_MS = 8_000;

const DELIVERY_ACK_DEVICE_ID_STORAGE_KEY = "chat:web:deliveryAckDeviceId";

const getDeliveryAckDeviceId = (): string => {
  if (typeof window === "undefined") {
    return "web-ssr";
  }
  try {
    const existing = window.sessionStorage.getItem(
      DELIVERY_ACK_DEVICE_ID_STORAGE_KEY,
    );
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const deviceId = `web:${generated}`;
    window.sessionStorage.setItem(DELIVERY_ACK_DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  } catch {
    return `web:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;
  const { t } = useTranslation(["auth", "chat"]);
  const dispatch = useAppDispatch();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const isBootstrappingAuth = useAuthStore((s) => s.isBootstrappingAuth);
  const totalUnreadCount = useChatStore((s) => s.totalUnreadCount);
  const conversations = useChatStore((s) => s.conversations);

  const applyConversationParticipantSummary = useChatStore(
    (s) => s.applyConversationParticipantSummary,
  );
  const upsertConversationSummary = useChatStore(
    (s) => s.upsertConversationSummary,
  );
  const applyUnreadSummary = useChatStore((s) => s.applyUnreadSummary);
  const refreshUnreadSummarySnapshotAction = useChatStore(
    (s) => s.refreshUnreadSummarySnapshot,
  );
  const setTyping = useChatStore((s) => s.setTyping);
  const clearTyping = useChatStore((s) => s.clearTyping);
  const clearConversationTypingStatuses = useChatStore(
    (s) => s.clearConversationTypingStatuses,
  );
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const flushQueuedMessages = useChatStore((s) => s.flushQueuedMessages);
  const setSendRestriction = useChatStore((s) => s.setSendRestriction);
  const clearSendRestriction = useChatStore((s) => s.clearSendRestriction);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const setSlowModeCooldown = useGroupStore((s) => s.setSlowModeCooldown);
  const upsertInviteLink = useGroupStore((s) => s.upsertInviteLink);
  const upsertJoinRequest = useGroupStore((s) => s.upsertJoinRequest);
  const markJoinRequestResolved = useGroupStore(
    (s) => s.markJoinRequestResolved,
  );
  const bumpMemberListVersion = useGroupStore((s) => s.bumpMemberListVersion);

  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    initSocket().getConnectionState(),
  );

  const conversationSyncStateRef = useRef(
    createConversationSyncCoordinatorState(),
  );
  const conversationJoinRetryTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRealtimeAdapterRef = useRef(createChatRealtimeAdapter());
  const suppressUnreadBroadcastRef = useRef(false);
  const emitQueueRef = useRef<Array<{ event: string; data: unknown }>>([]);
  const deliveryAckDeviceIdRef = useRef(getDeliveryAckDeviceId());
  const ackedDeliveryMessagesRef = useRef<Set<string>>(new Set());
  const resyncCoordinatorStateRef = useRef(
    createWebSocketResyncCoordinatorState(),
  );
  const authCoordinatorStateRef = useRef(createWebSocketAuthCoordinatorState());
  const connectionLifecycleStateRef = useRef(
    createWebSocketConnectionLifecycleState(),
  );
  const connectionLifecycleRef = useRef<ReturnType<
    typeof createWebSocketConnectionLifecycle
  > | null>(null);
  const activeConversationDeltaTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const remoteTypingTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const processedTypingEventIdsRef = useRef<Set<string>>(new Set());
  const processedToastEventIdsRef = useRef<Set<string>>(new Set());
  const unsubscribersRef = useRef<Array<() => void>>([]);

  // Track unsubscribe functions for external subscriptions so they can be cleaned up on unmount.
  const externalUnsubscribersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const socket = initSocket();
    const unsub = socket.onStateChange((state) => {
      logMessageDebug("useWebSocket", "connection_state_changed", {
        state,
        joinedConversationIds: Array.from(
          conversationSyncStateRef.current.joinedConversationIds,
        ),
      });
      setConnectionState(state);
      dispatch(
        realtimeActions.setConnectionStatus(toRealtimeConnectionStatus(state)),
      );
    });
    return () => {
      unsub();
    };
  }, [dispatch]);

  useEffect(() => {
    syncDocumentTitleBadge(totalUnreadCount);
    void syncAppBadge(totalUnreadCount);
  }, [totalUnreadCount]);

  const refreshUnreadSummarySnapshot = useCallback(async (): Promise<void> => {
    await refreshUnreadSummarySnapshotAction();
  }, [refreshUnreadSummarySnapshotAction]);

  // Re-sync badge counts from backend when the browser tab regains focus so
  // that counts stay accurate across multi-tab and multi-device scenarios.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshUnreadSummarySnapshot();
        void useFriendshipStore.getState().fetchPendingCount();
        logMessageDebug("useWebSocket", "badge_synced_on_tab_focus", {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshUnreadSummarySnapshot]);

  useEffect(() => {
    if (suppressUnreadBroadcastRef.current) {
      suppressUnreadBroadcastRef.current = false;
      return;
    }

    const syncedAtMs = Date.now();
    broadcastUnreadSnapshot({
      totalUnreadCount,
      conversations: (Array.isArray(conversations) ? conversations : []).map(
        (conversation) => ({
          conversationId: conversation.id,
          unreadCount: conversation.unreadCount ?? 0,
          lastReadMessageId: conversation.lastReadMessageId ?? null,
          lastReadAt:
            typeof conversation.lastReadAt === "string"
              ? conversation.lastReadAt
              : conversation.lastReadAt instanceof Date
                ? conversation.lastReadAt.toISOString()
                : null,
          lastReadSeq:
            typeof conversation.lastReadSeq === "number"
              ? conversation.lastReadSeq
              : null,
        }),
      ),
      source: "socket",
      syncedAtMs,
    });
  }, [conversations, totalUnreadCount]);

  useEffect(() => {
    const unsub = subscribeUnreadSnapshotBroadcast((snapshot) => {
      suppressUnreadBroadcastRef.current = true;
      logMessageDebug("useWebSocket", "cross_tab_unread_snapshot_received", {
        totalUnreadCount: snapshot.totalUnreadCount,
        conversationCount: snapshot.conversations.length,
        syncedAtMs: snapshot.syncedAtMs,
        source: snapshot.source,
      });
      applyUnreadSummary(
        {
          totalUnreadCount: snapshot.totalUnreadCount,
          conversations: snapshot.conversations,
        },
        {
          requestedAtMs: snapshot.syncedAtMs,
          appliedAtMs: snapshot.syncedAtMs,
          source: "cross_tab",
        },
      );
    });
    externalUnsubscribersRef.current.push(unsub);
    return () => {
      unsub();
      const idx = externalUnsubscribersRef.current.indexOf(unsub);
      if (idx !== -1) externalUnsubscribersRef.current.splice(idx, 1);
    };
  }, [applyUnreadSummary]);

  const getNotificationPreferences = useCallback(() => {
    return useSettingsStore.getState().notifications;
  }, []);

  const shouldProcessRealtimeEvent = useCallback(
    (eventKey: string, details?: Record<string, unknown>): boolean => {
      if (!eventKey) {
        return true;
      }

      if (!chatRealtimeAdapterRef.current.shouldProcessEvent(eventKey)) {
        logMessageDebug("useWebSocket", "duplicate_realtime_event_suppressed", {
          eventKey,
          ...details,
        });
        return false;
      }

      return true;
    },
    [],
  );

  const clearRemoteTypingTimer = useCallback(
    (conversationId: string, userId: string) => {
      const key = `${conversationId}:${userId}`;
      const timer = remoteTypingTimersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
        remoteTypingTimersRef.current.delete(key);
      }
    },
    [],
  );

  const clearAllRemoteTypingTimers = useCallback(() => {
    remoteTypingTimersRef.current.forEach((timer) => clearTimeout(timer));
    remoteTypingTimersRef.current.clear();
  }, []);

  const clearConversationJoinRetry = useCallback((conversationId: string) => {
    const timer = conversationJoinRetryTimersRef.current.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      conversationJoinRetryTimersRef.current.delete(conversationId);
    }
  }, []);

  const clearAllConversationJoinRetries = useCallback(() => {
    conversationJoinRetryTimersRef.current.forEach((timer) =>
      clearTimeout(timer),
    );
    conversationJoinRetryTimersRef.current.clear();
    conversationSyncStateRef.current.joinRetryAttempts.clear();
  }, []);

  const clearActiveTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const clearRemoteTypingTimersForConversation = useCallback(
    (conversationId: string) => {
      Array.from(remoteTypingTimersRef.current.keys()).forEach((key) => {
        if (!key.startsWith(`${conversationId}:`)) {
          return;
        }

        const timer = remoteTypingTimersRef.current.get(key);
        if (timer) {
          clearTimeout(timer);
        }
        remoteTypingTimersRef.current.delete(key);
      });
    },
    [],
  );

  const scheduleRemoteTypingExpiry = useCallback(
    (conversationId: string, userId: string, expiresAt: string | null) => {
      const key = `${conversationId}:${userId}`;
      clearRemoteTypingTimer(conversationId, userId);

      const delayMs = Math.max(0, parseTypingExpiryMs(expiresAt) - Date.now());
      const timer = setTimeout(() => {
        clearTyping(conversationId, userId);
        remoteTypingTimersRef.current.delete(key);
      }, delayMs);
      remoteTypingTimersRef.current.set(key, timer);
    },
    [clearRemoteTypingTimer, clearTyping],
  );

  const shouldProcessTypingEvent = useCallback((eventId: string | null) => {
    if (!eventId) return true;

    const processed = processedTypingEventIdsRef.current;
    if (processed.has(eventId)) {
      return false;
    }

    processed.add(eventId);
    if (processed.size > 200) {
      const oldest = processed.values().next().value;
      if (oldest) processed.delete(oldest);
    }

    return true;
  }, []);

  const authCoordinator = useMemo(
    () =>
      createWebSocketAuthCoordinator({
        state: authCoordinatorStateRef.current,
        tokenRefreshThreshold: AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD,
        onError,
        notifySessionExpired: () => {
          notifyGlobalToast({
            level: "error",
            message: t("auth:session.expired", { defaultValue: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }),
            dedupeKey: "auth:session-expired",
            cooldownMs: 30000,
          });
        },
        handleAuthFailure: (input) =>
          useAuthStore.getState().handleAuthFailure(input ?? "refresh_failed"),
        resetAuthFailureState,
        refreshAccessTokenShared,
        getAccessToken,
        isTokenExpiringSoon,
        authenticateSocket,
        updateSocketAuth,
        subscribeToAuthRefreshEvents,
      }),
    [onError, t],
  );
  const {
    handleConnectFailure,
    recoverSocketAuth,
    handleUnauthorizedEvent,
    handleReauthRequiredEvent,
    subscribeToRefreshEvents,
  } = authCoordinator;

  useEffect(() => subscribeToRefreshEvents(), [subscribeToRefreshEvents]);

  const flushEmitQueue = useCallback(() => {
    const socket = getSocket();
    if (!socket?.isConnected()) return;
    const queuedCount = emitQueueRef.current.length;
    if (queuedCount > 0) {
      logMessageDebug("useWebSocket", "emit_queue_flush_started", {
        queuedCount,
      });
    }

    while (emitQueueRef.current.length > 0) {
      const queued = emitQueueRef.current.shift();
      if (!queued) continue;
      const sent = socket.send(queued.event, queued.data);
      if (!sent) {
        emitQueueRef.current.unshift(queued);
        break;
      }
    }

    if (queuedCount > 0) {
      logMessageDebug("useWebSocket", "emit_queue_flush_completed", {
        remainingCount: emitQueueRef.current.length,
      });
    }
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    const socket = getSocket();
    if (!socket?.isConnected()) {
      emitQueueRef.current.push({ event, data });
      logMessageDebug("useWebSocket", "emit_queued_until_connected", {
        event,
        queuedCount: emitQueueRef.current.length,
      });
      return;
    }
    logMessageDebug("useWebSocket", "emit_sent", {
      event,
    });
    socket.send(event, data);
  }, []);

  const emitJoinConversation = useCallback(
    (conversationId: string) => {
      logMessageDebug("useWebSocket", "conversation_join_requested", {
        conversationId,
        connectionState: getSocket()?.getConnectionState() ?? "unknown",
      });
      emit(WebSocketEvents.CONVERSATION_JOIN, {
        conversationId,
      });
    },
    [emit],
  );

  const resyncCoordinator = useMemo(
    () =>
      createWebSocketResyncCoordinator({
        state: resyncCoordinatorStateRef.current,
        conversationSyncState: conversationSyncStateRef.current,
        getChatState: () => useChatStore.getState(),
        fetchMessages,
        fetchConversations,
        fetchConversationSummary: (conversationId) =>
          getConversationByIdUseCase(conversationId),
        fetchConversationPage: (page, limit, options) =>
          conversationApi.getConversations(page, limit, options),
        upsertConversationSummary,
        refreshUnreadSummarySnapshot,
        triggerFriendshipResync: (reason) =>
          useFriendshipStore.getState().triggerResync(reason),
        syncUserSettings: () => useSettingsStore.getState().syncFromServer(),
        clearConversationJoinRetry,
      }),
    [
      clearConversationJoinRetry,
      fetchConversations,
      fetchMessages,
      refreshUnreadSummarySnapshot,
      upsertConversationSummary,
    ],
  );
  const {
    clearConversationSyncFallback,
    scheduleConversationResync,
    scheduleConversationSnapshotRefresh,
    reconcileConversationAuthoritative,
    maybeReconcileGap,
    handleSocketConnected: handleSocketConnectedResync,
    handleSocketDisconnected: handleSocketDisconnectedResync,
    handleConversationJoinedAck,
    handleConversationResynced,
    handleResyncRequired,
    resyncClientState,
    reset: resetResyncCoordinator,
  } = resyncCoordinator;

  const clearActiveConversationDeltaSyncTimers = useCallback(() => {
    activeConversationDeltaTimersRef.current.forEach((timer) =>
      clearTimeout(timer),
    );
    activeConversationDeltaTimersRef.current.clear();
  }, []);

  const syncActiveConversationDelta = useCallback(
    (conversationId: string, reason: string): void => {
      if (!conversationId) return;

      const existing = activeConversationDeltaTimersRef.current.get(
        conversationId,
      );
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        activeConversationDeltaTimersRef.current.delete(conversationId);
        const messages = getConversationMessageCache(conversationId);
        const newestLoadedSeq = getLatestServerSeq(messages);

        logMessageDebug("useWebSocket", "[ACTIVE DELTA SYNC]", {
          conversationId,
          reason,
          key: messagesQueryKey(conversationId),
          newestLoadedSeq,
          cachedMessageCount: messages.length,
          activeConversationId: useChatStore.getState().selectedConversationId,
        });

        store.dispatch(fetchConversationTail(conversationId, newestLoadedSeq));
      }, 500);

      activeConversationDeltaTimersRef.current.set(conversationId, timer);
    },
    [],
  );

  const syncSelectedActiveConversationDelta = useCallback(
    (reason: string): void => {
      const conversationId = useChatStore.getState().selectedConversationId;
      if (!conversationId) return;
      syncActiveConversationDelta(conversationId, reason);
    },
    [syncActiveConversationDelta],
  );

  const maybeNotifyIncomingMessage = useCallback(
    (input: {
      conversationId: string;
      messageId: string;
      senderId: string | null;
      senderName: string | null;
      content: string;
      messageType?: string | null;
      mentions: string[];
      /**
       * Mention đầy đủ (userId + tên) — chỉ để đổi tag `@` trong preview sang
       * "tên gợi nhớ". `mentions` ở trên là userId thuần, dùng cho policy
       * (bỏ qua mute khi bị tag), không đủ để dò tag trong chữ.
       */
      mentionDetails?: Mention[];
      kind?: "message" | "mention" | "group_activity" | "system";
      eventId?: string | null;
    }) => {
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === input.conversationId);
      const notificationSettings = getNotificationPreferences();
      const hasMention =
        currentUserId !== null && input.mentions.includes(currentUserId);
      const visibleAndFocused = isDocumentVisibleAndFocused();
      const isInMessageModule = isMessageModule(window.location.pathname);

      notifyDebug("[notify] called", {
        senderId: input.senderId,
        currentUserId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        kind: input.kind,
        visibilityState:
          typeof document !== "undefined"
            ? document.visibilityState
            : "undefined",
        hasFocus:
          typeof document !== "undefined" ? document.hasFocus() : false,
      });

      const decision = decideIncomingMessageNotification({
        senderId: input.senderId,
        currentUserId,
        notificationsEnabled: notificationSettings.enabled,
        // Missing conversation must NOT be treated as muted.
        isMuted: Boolean(conversation?.isMuted),
        hasMention,
        isInMessageModule,
        visibleAndFocused,
      });

      if (decision.bailReason === "self_message") {
        notifyDebug("[notify] BAIL self-message", {
          senderId: input.senderId,
          currentUserId,
          conversationId: input.conversationId,
          messageId: input.messageId,
        });
        logMessageDebug("useWebSocket", "toast_skipped_from_self", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          currentUserId,
          pathname: window.location.pathname,
        });
        return;
      }

      // Toast dedup: track which messages we've already shown a toast for.
      // This is separate from the RTK deduper — we need to allow duplicate
      // RTK events (for state reconciliation) but suppress duplicate toasts.
      const toastDedupKey = `${input.conversationId}:${input.messageId}`;
      if (processedToastEventIdsRef.current.has(toastDedupKey)) {
        notifyDebug("[notify] BAIL duplicate", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          toastDedupKey,
        });
        logMessageDebug("useWebSocket", "toast_skipped_duplicate", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          pathname: window.location.pathname,
        });
        return;
      }
      processedToastEventIdsRef.current.add(toastDedupKey);
      // Keep the set bounded to prevent memory leaks
      if (processedToastEventIdsRef.current.size > 500) {
        const firstKey = processedToastEventIdsRef.current.values().next().value;
        if (firstKey) processedToastEventIdsRef.current.delete(firstKey);
      }

      if (decision.bailReason === "notifications_disabled") {
        notifyDebug("[notify] BAIL settings disabled", {
          conversationId: input.conversationId,
          messageId: input.messageId,
        });
        logMessageDebug("useWebSocket", "toast_skipped_notifications_disabled", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          pathname: window.location.pathname,
        });
        return;
      }

      if (decision.bailReason === "muted") {
        notifyDebug("[notify] BAIL muted", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          hasMention,
        });
        logMessageDebug("useWebSocket", "toast_skipped_muted", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          pathname: window.location.pathname,
          isMuted: true,
          hasMention,
        });
        return;
      }

      const isActiveConversation =
        useChatStore.getState().selectedConversationId === input.conversationId;
      const conversationLabel =
        conversation?.displayName ||
        conversation?.name ||
        input.senderName ||
        "Conversation";
      const senderLabel =
        input.senderName?.trim() ||
        t("chat:notification.senderFallback", {
          defaultValue: "Người dùng",
        });
      const isGroupConversation =
        conversation?.type !== RoomType.DIRECT &&
        conversation?.type !== RoomType.PRIVATE &&
        conversationLabel !== senderLabel;
      // Lead with the person who needs recognition. The group remains visible
      // as context instead of replacing the sender in notification titles.
      const notificationTitle = isGroupConversation
        ? `${senderLabel} · ${conversationLabel}`
        : senderLabel;
      const notificationKind =
        input.kind === "system"
          ? "system"
          : hasMention
            ? "mention"
            : input.kind || "message";

      // Tag `@` trong nội dung phải hiện "tên gợi nhớ" của người xem — giống hệt
      // trong bong bóng chat. Tính một lần, dùng cho cả trung tâm thông báo,
      // thông báo hệ điều hành lẫn toast nổi.
      const aliasedContent = applyMentionAliases(
        getPreviewFromMessage({ content: input.content }),
        input.mentionDetails,
        aliasByUserId(),
      );

      useNotificationStore.getState().upsertNotification({
        id:
          input.eventId ||
          `message:${input.conversationId}:${input.messageId}:${notificationKind}`,
        kind: notificationKind,
        title: notificationTitle,
        body:
          aliasedContent ||
          (notificationKind === "system"
            ? t("chat:notification.systemActivity", { defaultValue: "Hoạt động hệ thống" })
            : t("chat:notification.sentAttachment", { defaultValue: "Đã gửi một tệp đính kèm." })),
        createdAt: new Date().toISOString(),
        conversationId: input.conversationId,
        messageId: input.messageId,
        actorId: input.senderId,
        isRead: false,
      });

      // Debug: log full decision tree before showing toast
      logMessageDebug("useWebSocket", "toast_decision_tree", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        senderId: input.senderId,
        currentUserId,
        pathname: window.location.pathname,
        isInMessageModule,
        isActiveConversation,
        visibleAndFocused,
        hasMention,
        isMuted: Boolean(conversation?.isMuted),
        notificationKind,
        willShowToast: decision.showInAppToast,
        willShowBrowserNotification: decision.emitBrowserNotification,
      });

      const notificationId =
        input.eventId ||
        `message:${input.conversationId}:${input.messageId}:${hasMention ? "mention" : "new"}`;
      const preview = notificationSettings.messagePreview
        ? formatMessagePreview(aliasedContent, input.messageType ?? undefined)
        : hasMention
          ? "Đã nhắc đến bạn."
          : "Tin nhắn mới";

      // OS-level notification whenever the document is hidden or unfocused —
      // independent of the SPA route. The desktop thin-client hidden to tray
      // stays on /chat/..., so this must NOT sit behind the message-module
      // guard below (that regression silently killed all Windows toasts).
      if (decision.emitBrowserNotification) {
        notifyDebug("[notify] emit browser notification", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          currentUserId,
          visibilityState:
            typeof document !== "undefined"
              ? document.visibilityState
              : "undefined",
          hasFocus:
            typeof document !== "undefined" ? document.hasFocus() : false,
        });
        logMessageDebug("useWebSocket", "browser_notification_emitting", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          pathname: window.location.pathname,
          visibleAndFocused,
          hasMention,
        });
        emitBrowserNotification({
          id: notificationId,
          tag: `conversation:${input.conversationId}`,
          title: hasMention
            ? `${notificationTitle} · Mention`
            : notificationTitle,
          body: preview,
          silent: !notificationSettings.sound,
          onClick: () => {
            dispatchNotificationClick({
              conversationId: input.conversationId,
              messageId: input.messageId,
            });
          },
        });
      } else {
        notifyDebug("[notify] BAIL active visible focused", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          visibleAndFocused,
          isInMessageModule,
          isActiveConversation,
        });
      }

      // If user is on the Messages module, the UI is already updating in realtime —
      // no in-app toast needed. The sidebar badge still updates via store.
      // NOTE: Do NOT add a secondary isActiveConversation guard here.
      // ChatPage does not clear selectedConversationId on unmount, so when the
      // user navigates to Calendar/Tasks/etc., isActiveConversation stays true
      // for the last-viewed conversation. That would silently suppress toasts
      // for exactly the conversation the user was just reading — the most
      // common case when switching modules.
      if (!decision.showInAppToast) {
        logMessageDebug("useWebSocket", "toast_skipped_in_message_module", {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          pathname: window.location.pathname,
        });
        return;
      }

      logMessageDebug("useWebSocket", "toast_showing", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        senderId: input.senderId,
        pathname: window.location.pathname,
        isActiveConversation,
        visibleAndFocused,
        previewLength: preview.length,
      });

      const isGroup = isGroupConversation;

      // Singleton toast: new message replaces old one instead of stacking.
      showSingletonMessageToast({
        senderName: senderLabel,
        conversationName:
          conversation?.displayName || conversation?.name || undefined,
        isGroup,
        avatarUrl: conversation?.displayAvatar ?? null,
        messageType: input.messageType ?? undefined,
        preview,
        conversationId: input.conversationId,
        messageId: input.messageId,
      });
    },
    [getNotificationPreferences],
  );

  const maybeNotifyMembershipEvent = useCallback(
    (
      conversationId: string,
      membershipState: string,
      reason: string | null,
    ) => {
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      const conversationLabel =
        conversation?.displayName || conversation?.name || t("chat:conversation.group", { defaultValue: "Nhóm" });
      const notificationId = `membership:${conversationId}:${membershipState}:${reason ?? "unknown"}`;
      const message =
        membershipState === "active" && reason === "added"
          ? t("chat:membership.added", { name: conversationLabel, defaultValue: `Bạn đã được thêm vào ${conversationLabel}.` })
          : membershipState === "active" && reason === "restored"
            ? t("chat:membership.restored", { name: conversationLabel, defaultValue: `Bạn đã được khôi phục vào ${conversationLabel}.` })
            : t("chat:membership.changed", { name: conversationLabel, defaultValue: `Thành viên của ${conversationLabel} đã thay đổi.` });

      const notificationSettings = getNotificationPreferences();
      useNotificationStore.getState().upsertNotification({
        id: notificationId,
        kind: "group_activity",
        title: conversationLabel,
        body: message,
        createdAt: new Date().toISOString(),
        conversationId,
        isRead: false,
      });

      if (!notificationSettings.enabled) {
        return;
      }

      notifyGlobalToast({
        level: "info",
        message,
        dedupeKey: notificationId,
        cooldownMs: 20_000,
      });

      if (!isDocumentVisibleAndFocused()) {
        emitBrowserNotification({
          id: notificationId,
          title: conversationLabel,
          body: message,
          silent: !notificationSettings.sound,
        });
      }
    },
    [getNotificationPreferences, t],
  );

  const maybeNotifyGroupUpdate = useCallback(
    (conversationId: string, body: string, notificationSuffix: string) => {
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      const conversationLabel =
        conversation?.displayName || conversation?.name || t("chat:conversation.group", { defaultValue: "Nhóm" });
      const notificationId = `group:${conversationId}:${notificationSuffix}`;

      useNotificationStore.getState().upsertNotification({
        id: notificationId,
        kind: "group_activity",
        title: conversationLabel,
        body,
        createdAt: new Date().toISOString(),
        conversationId,
        isRead: false,
      });

      const notificationSettings = getNotificationPreferences();
      if (!notificationSettings.enabled) {
        return;
      }

      notifyGlobalToast({
        level: "info",
        message: `${conversationLabel}: ${body}`,
        dedupeKey: notificationId,
        cooldownMs: 15_000,
      });

      if (!isDocumentVisibleAndFocused()) {
        emitBrowserNotification({
          id: notificationId,
          title: conversationLabel,
          body,
          silent: !notificationSettings.sound,
        });
      }
    },
    [getNotificationPreferences, t],
  );

  const requestConversationJoin = useCallback(
    function requestConversationJoinImpl(
      conversationId: string,
      options?: {
        reason?: "initial" | "reconnect" | "retry";
      },
    ) {
      if (
        !conversationId ||
        !conversationSyncStateRef.current.joinedConversationIds.has(
          conversationId,
        )
      ) {
        return;
      }

      emitJoinConversation(conversationId);
      clearConversationJoinRetry(conversationId);

      const attempt =
        conversationSyncStateRef.current.joinRetryAttempts.get(
          conversationId,
        ) ?? 0;
      const retryDelay = Math.min(
        CONVERSATION_JOIN_ACK_TIMEOUT_MS * Math.max(attempt + 1, 1),
        CONVERSATION_JOIN_RETRY_DELAY_MAX_MS,
      );

      const retryTimer = setTimeout(() => {
        conversationJoinRetryTimersRef.current.delete(conversationId);

        if (
          !conversationSyncStateRef.current.joinedConversationIds.has(
            conversationId,
          ) ||
          conversationSyncStateRef.current.subscribedConversationIds.has(
            conversationId,
          )
        ) {
          return;
        }

        const connectionState = getSocket()?.getConnectionState() ?? "unknown";
        if (connectionState !== "connected") {
          logMessageDebug(
            "useWebSocket",
            "conversation_join_retry_waiting_connection",
            {
              conversationId,
              reason: options?.reason,
              connectionState,
            },
          );
          return;
        }

        const nextAttempt = attempt + 1;
        conversationSyncStateRef.current.joinRetryAttempts.set(
          conversationId,
          nextAttempt,
        );

        logMessageDebug("useWebSocket", "conversation_join_ack_timeout", {
          conversationId,
          reason: options?.reason,
          attempt: nextAttempt,
          retryDelay,
        });

        if (useChatStore.getState().selectedConversationId === conversationId) {
          void scheduleConversationResync(conversationId, {
            reason: "conversation-refresh",
          });
        }

        requestConversationJoinImpl(conversationId, { reason: "retry" });
      }, retryDelay);

      conversationJoinRetryTimersRef.current.set(conversationId, retryTimer);
    },
    [
      clearConversationJoinRetry,
      emitJoinConversation,
      scheduleConversationResync,
    ],
  );

  const setupSocket = useCallback(() => {
    const socket = initSocket();
    logMessageDebug("useWebSocket", "listener_setup_started", {
      existingListenerCount: unsubscribersRef.current.length,
      connectionState: socket.getConnectionState(),
    });

    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];
    logMessageDebug("useWebSocket", "listener_cleanup_completed", {
      socketListenerCount: socket.getListenerCount(),
      connectionState: socket.getConnectionState(),
    });

    const handleConnect = () => {
      connectionLifecycleRef.current?.handleSocketConnected();
      // Sync badge counts from backend on every connect/reconnect so the
      // sidebar never shows stale counts after a disconnection.
      void refreshUnreadSummarySnapshot();
      void useFriendshipStore.getState().fetchPendingCount();
      syncSelectedActiveConversationDelta("socket-connect");
      logMessageDebug("useWebSocket", "badge_synced_on_connect", {});
    };

    const handleDisconnect = (data: unknown) => {
      connectionLifecycleRef.current?.handleSocketDisconnected(
        normalizeDisconnectEvent(asRecord(data)),
      );
    };

    const handleConnectError = (data: unknown) => {
      const message =
        asString(asRecord(data)?.message) ?? t("chat:websocket.connectionError", { defaultValue: "Kết nối thời gian thực bị gián đoạn. Hệ thống đang thử kết nối lại." });
      onError?.(new Error(message));
    };

    const handleWsError = (data: unknown) => {
      const message =
        asString(asRecord(data)?.message) ?? t("chat:websocket.serverError", { defaultValue: "Kết nối máy chủ gặp sự cố. Vui lòng thử lại sau." });
      onError?.(new Error(message));
    };

    const handleAuthUnauthorized = (data: unknown) => {
      const payload = asRecord(data);
      const message = asString(payload?.message) ?? "WebSocket unauthorized";
      const code = asString(payload?.code) ?? "AUTH_UNAUTHORIZED";
      void handleUnauthorizedEvent({ code, message });
    };

    const handleAuthReauthRequired = (data: unknown) => {
      const reason =
        asString(asRecord(data)?.reason) ?? "reauthentication required";
      void handleReauthRequiredEvent({ reason });
    };

    const handleReconnectFailed = () => {
      onError?.(new Error(
        t("chat:websocket.reconnectFailed", {
          defaultValue: "Không thể kết nối lại sau nhiều lần thử. Vui lòng kiểm tra mạng và nhấn Thử lại.",
        }),
      ));
    };

    const sendDeliveryAckForMessage = (
      event: NormalizedMessageRealtimeEvent,
    ) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (!currentUserId || !event.senderId || event.senderId === currentUserId) {
        return;
      }
      if (!event.messageId || event.incomingSeq === null) {
        return;
      }

      const deviceId = deliveryAckDeviceIdRef.current;
      const ackKey = `${event.conversationId}:${event.messageId}:${deviceId}`;
      if (ackedDeliveryMessagesRef.current.has(ackKey)) {
        return;
      }
      ackedDeliveryMessagesRef.current.add(ackKey);

      emit(WebSocketEvents.MESSAGE_DELIVERY_ACK, {
        type: WebSocketEvents.MESSAGE_DELIVERY_ACK,
        conversationId: event.conversationId,
        messageId: event.messageId,
        messageSeq: event.incomingSeq,
        deviceId,
        deviceType: "web",
        receivedAt: new Date().toISOString(),
      });
    };

    const unsubscribeConnectionEvents = registerConnectionEvents(socket, {
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onConnectError: handleConnectError,
      onWsError: handleWsError,
      onAuthUnauthorized: handleAuthUnauthorized,
      onAuthReauthRequired: handleAuthReauthRequired,
      onReconnectFailed: handleReconnectFailed,
    });
    unsubscribersRef.current.push(unsubscribeConnectionEvents);

    const upsertIncomingMessage = (
      data: unknown,
      eventType: "message:new" | "message:updated",
    ) => {
      const normalizedEvent = normalizeMessageRealtimeEvent(data, eventType);
      if (!normalizedEvent) return;

      const {
        payload,
        conversationId,
        messagePayload,
        messageId,
        tempId,
        clientMessageId,
        localId,
        stableId,
        senderId,
        incomingSeq,
        eventId,
        correlationKey,
      } = normalizedEvent;
      logMessageDebug("useWebSocket", "[WS ROUTER]", {
        eventType,
        conversationId,
        eventId,
        messageId,
        clientMessageId,
        incomingSeq,
        activeConversationId: useChatStore.getState().selectedConversationId,
        documentVisibility:
          typeof document !== "undefined" ? document.visibilityState : "unknown",
      });
      logMessageDebug("useWebSocket", "[MESSAGE EVENT RECEIVED]", {
        eventType,
        conversationId,
        messageId,
        clientMessageId,
        incomingSeq,
        eventId,
      });

      // Early toast notification: We call maybeNotifyIncomingMessage BEFORE the
      // deduper check so that toast shows even on duplicate/replayed events.
      // The toast deduper (processedToastEventIdsRef) inside maybeNotifyIncomingMessage
      // ensures we don't show duplicate toasts for the same message.
      // This is separate from the RTK deduper which handles state deduplication.
      if (eventType === "message:new") {
        // "tên gợi nhớ" (alias) wins over the realtime sender name in the toast.
        const senderAlias = senderId
          ? useFriendshipStore.getState().friendByUserId[senderId]?.alias ?? null
          : null;
        maybeNotifyIncomingMessage({
          conversationId,
          messageId,
          senderId: senderId ?? null,
          senderName: senderAlias ?? getRealtimeSenderName(payload, messagePayload),
          content: getRealtimeMessageContent(payload, messagePayload),
          messageType: asString(messagePayload.type) ?? null,
          // Server sends Mention[] objects ({ userId, displayName, ... });
          // normalize to user-id strings so mention bypass works for muted chats.
          mentions: normalizeMentionUserIds(messagePayload.mentions),
          mentionDetails: parseMentionDetails(messagePayload.mentions),
          kind:
            asString(messagePayload.type) === "system" ? "system" : "message",
          eventId,
        });
      }

      // Now check the RTK deduper for state updates
      if (
        !shouldProcessRealtimeEvent(eventId, {
          eventType,
          conversationId,
          messageId,
        })
      ) {
        return;
      }
      logMessageDebug("useWebSocket", `socket_${eventType}_received`, {
        conversationId,
        eventId,
        correlationKey,
        messageId,
        tempId,
        localId,
        clientMessageId,
        stableId,
        incomingSeq,
      });
      if (eventType === "message:new") {
        logMessageDebug("useWebSocket", "realtime.message.normalized", {
          conversationId,
          messageId,
          clientMessageId,
          type: asString(messagePayload.type) ?? null,
          activeConversationId: useChatStore.getState().selectedConversationId,
          willAppendToActiveList:
            useChatStore.getState().selectedConversationId === conversationId,
        });
        markChatPerformance("fe.socket.message.received", conversationId, {
          eventId,
          messageId,
          clientMessageId,
          messageSeq: incomingSeq,
        });
      }
      logMessageDebug("useWebSocket", "realtime.client.event_received", {
        requestId:
          asString(payload.requestId) ?? asString(messagePayload.requestId),
        conversationId,
        messageId,
        actorUserId: senderId ?? null,
        peerUserId: null,
        socketId: null,
        eventType,
        roomKey: conversationId,
        eventId,
        correlationKey,
      });
      const chatState = useChatStore.getState();
      const rtkCacheMessage = toRealtimeCacheMessage(normalizedEvent);
      const hadMessageBeforeRtkPatch = hasMessageInRtkCache(
        conversationId,
        rtkCacheMessage,
      );
      const latestKnownSeq = getLatestServerSeq(
        getConversationMessageCache(conversationId),
      );
      const hasMessageSeqGap = hasMessageSequenceGap({
        event: normalizedEvent,
        latestKnownSeq,
      });
      const currentUserId = useAuthStore.getState().user?.id;
      const isActiveConversation =
        chatState.selectedConversationId === conversationId;
      logMessageDebug("useWebSocket", "[ACTIVE CONVERSATION CHECK]", {
        activeConversationId: chatState.selectedConversationId,
        eventConversationId: conversationId,
        isActive: isActiveConversation,
        source: "message-event",
      });
      const visibleAndFocused = isDocumentVisibleAndFocused();
      const isAmbiguousSelfReconcile = needsSelfMessageIdentityResync({
        event: normalizedEvent,
        currentUserId,
      });
      const shouldIncrementUnread = Boolean(
        eventType === "message:new" &&
        senderId &&
        currentUserId &&
        senderId !== currentUserId &&
        (!isActiveConversation || !visibleAndFocused),
      );
      logMessageDebug("useWebSocket", "realtime.client.state_updated", {
        requestId:
          asString(payload.requestId) ?? asString(messagePayload.requestId),
        conversationId,
        messageId,
        actorUserId: senderId ?? null,
        peerUserId: null,
        socketId: null,
        eventType,
        roomKey: conversationId,
        eventId,
        stateTransition: hadMessageBeforeRtkPatch ? "merged" : "new",
        incrementUnread: shouldIncrementUnread,
        latestKnownSeq,
        incomingSeq,
        hasMessageSeqGap,
      });

      dispatch(
        eventType === "message:new"
          ? realtimeMessageReceived({
              conversationId,
              message: rtkCacheMessage,
            })
          : realtimeMessageUpdated({
              conversationId,
              message: rtkCacheMessage,
            }),
      );

      if (eventType === "message:new") {
        sendDeliveryAckForMessage(normalizedEvent);
      }

      // Poll/reminder activity by anyone → pull the tail so the BE system line
      // (poll "…Xem", reminder "Bạn tạo nhắc hẹn mới… Xem") shows live.
      const activityType = asString(messagePayload.type);
      if (activityType === "poll" || activityType === "reminder") {
        pullConversationTailForPoll(conversationId);
      }

      if (isAmbiguousSelfReconcile) {
        logMessageDebug(
          "useWebSocket",
          "socket_message_missing_reconcile_alias",
          {
            conversationId,
            eventId,
            messageId,
            senderId,
            stableId,
          },
        );
        const shouldUseDeltaRefresh = shouldUseDeltaConversationRefresh({
          conversationId,
          selectedConversationId: chatState.selectedConversationId,
          joinedConversationIds:
            conversationSyncStateRef.current.joinedConversationIds,
        });
        if (shouldUseDeltaRefresh) {
          void reconcileConversationAuthoritative(
            conversationId,
            "conversation-refresh",
          );
        } else {
          void scheduleConversationSnapshotRefresh(conversationId, {
            delayMs: 0,
            reason: "socket:self-reconcile",
          });
        }
      }

      if (hasMessageSeqGap) {
        logMessageDebug("useWebSocket", "socket_message_seq_gap_detected", {
          conversationId,
          eventId,
          messageId,
          latestKnownSeq,
          incomingSeq,
        });
        maybeReconcileGap(conversationId, "message_seq_gap");
      }

      if (
        shouldRefreshConversationSnapshotAfterMessageEvent({
          eventType,
          hadMessageBeforeRtkPatch,
          isActiveConversation,
          senderId: senderId ?? null,
          currentUserId: currentUserId ?? null,
        })
      ) {
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: `socket:${eventType}`,
        });
      }
    };

    const unsubscribeChatEvents = registerChatEvents(socket, {
      onMessageNew: (data: unknown) => {
        upsertIncomingMessage(data, "message:new");
      },
      onMessageUpdated: (data: unknown) => {
        upsertIncomingMessage(data, "message:updated");
      },
      onMessageDeleted: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.id) ??
          asString(payload._id) ??
          asString(payload.stableId) ??
          asString(payload.localId) ??
          asString(payload.tempId) ??
          asString(asRecord(payload.message)?.id) ??
          asString(asRecord(payload.message)?.messageId) ??
          asString(asRecord(payload.message)?.stableId) ??
          asString(asRecord(payload.message)?.localId) ??
          asString(asRecord(payload.message)?.tempId);
        if (!conversationId || !messageId) return;
        logMessageDebug("useWebSocket", "socket_message_deleted_received", {
          conversationId,
          messageId,
        });

        dispatch(
          realtimeMessageDeleted({
            conversationId,
            messageId,
            recalledBy: asString(payload.recalledBy) ?? undefined,
            recalledAt: asString(payload.recalledAt) ?? undefined,
            deletedBy: asString(payload.deletedBy) ?? undefined,
            deletedAt: asString(payload.deletedAt) ?? undefined,
          }),
        );
        invalidateConversationFileResources(
          dispatch,
          conversationId,
          "message-deleted",
        );
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: "socket:message:deleted",
        });
      },
      onMessageRecalled: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;
        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ?? asString(payload.id);
        if (!conversationId || !messageId) return;
        dispatch(
          realtimeMessageDeleted({
            conversationId,
            messageId,
            mode: "RECALL",
            recalledBy: asString(payload.recalledBy) ?? undefined,
            recalledAt: asString(payload.recalledAt) ?? undefined,
          }),
        );
        invalidateConversationFileResources(
          dispatch,
          conversationId,
          "message-recalled",
        );
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: "socket:message:recalled",
        });
      },
      onMessageDeletedGlobal: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;
        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ?? asString(payload.id);
        if (!conversationId || !messageId) return;
        dispatch(
          realtimeMessageDeleted({
            conversationId,
            messageId,
            mode: "ADMIN_DELETE",
            deletedBy: asString(payload.deletedBy) ?? undefined,
            deletedAt: asString(payload.deletedAt) ?? undefined,
          }),
        );
        invalidateConversationFileResources(
          dispatch,
          conversationId,
          "message-deleted",
        );
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: "socket:message:deleted_global",
        });
      },
      onMessageDeletedForMe: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;
        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ?? asString(payload.id);
        if (!conversationId || !messageId) return;
        dispatch(
          realtimeMessageDeleted({
            conversationId,
            messageId,
            mode: "FOR_ME",
          }),
        );
        invalidateConversationFileResources(
          dispatch,
          conversationId,
          "message-deleted",
        );
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: "socket:message:deleted_for_me",
        });
      },
      onMessageDelivered: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.id) ??
          asString(payload._id);
        const messageSeq =
          typeof payload.messageSeq === "number" &&
          Number.isFinite(payload.messageSeq)
            ? payload.messageSeq
            : null;
        const currentUserId = useAuthStore.getState().user?.id;
        const senderUserId = asString(payload.senderUserId);
        if (
          !conversationId ||
          !messageId ||
          !currentUserId ||
          (senderUserId && senderUserId !== currentUserId)
        ) {
          return;
        }

        const deliveredAt = asString(payload.deliveredAt) ?? undefined;

        dispatch(
          realtimeMessageDelivered({
            conversationId,
            messageId,
            ...(messageSeq !== null ? { messageSeq } : {}),
            currentUserId,
            recipientUserId: asString(payload.recipientUserId) ?? undefined,
            deliveredAt,
          }),
        );
      },
      onReactionAdded: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const messagePayload = asRecord(payload.message);
        const reactionPayload = asRecord(payload.reaction);
        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.id) ??
          asString(payload._id) ??
          asString(messagePayload?.id) ??
          asString(messagePayload?.messageId);
        const emoji =
          asString(payload.emoji) ?? asString(reactionPayload?.emoji);
        const userId =
          asString(payload.userId) ??
          asString(payload.senderId) ??
          asString(reactionPayload?.userId) ??
          asString(reactionPayload?.senderId);

        if (!conversationId || !messageId || !emoji) return;

        dispatch(
          realtimeMessageReactionChanged({
            conversationId,
            messageId,
            emoji,
            ...(userId ? { userId } : {}),
            action: "add",
          }),
        );
      },
      onReactionRemoved: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const messagePayload = asRecord(payload.message);
        const reactionPayload = asRecord(payload.reaction);
        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.id) ??
          asString(payload._id) ??
          asString(messagePayload?.id) ??
          asString(messagePayload?.messageId);
        const emoji =
          asString(payload.emoji) ?? asString(reactionPayload?.emoji);
        const userId =
          asString(payload.userId) ??
          asString(payload.senderId) ??
          asString(reactionPayload?.userId) ??
          asString(reactionPayload?.senderId);

        if (!conversationId || !messageId || !emoji) return;

        dispatch(
          realtimeMessageReactionChanged({
            conversationId,
            messageId,
            emoji,
            ...(userId ? { userId } : {}),
            action: "remove",
          }),
        );
      },
      /**
       * REACTION_UPDATED - New unified event that carries full reactions array.
       * Updates RTK Query cache directly without dispatching to Zustand.
       * This is the preferred path for reaction updates.
       */
      onReactionUpdated: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.message_id) ??
          asString(payload.id) ??
          asString(payload._id);
        const reactions = payload.reactions;

        if (!conversationId || !messageId) return;

        // Only update if this conversation is active
        const chatState = useChatStore.getState();
        if (chatState.selectedConversationId !== conversationId) return;

        // Validate reactions is an array
        if (!Array.isArray(reactions)) return;

        // Update RTK Query cache directly
        chatApi.util.updateQueryData(
          "getMessages",
          { conversationId },
          (draft) => {
            const message = draft.messages.find(
              (m) =>
                m.id === messageId ||
                m.localId === messageId ||
                m.stableId === messageId ||
                m.clientMessageId === messageId,
            );
            if (message) {
              message.reactions = reactions as import("@hacom/chat-shared-types").Reaction[];
            }
          },
        );
      },
      onConversationParticipantUpdated: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        const participant =
          asRecord(payload.participant) ?? asRecord(payload.user) ?? null;
        if (!conversationId || !participant) {
          return;
        }

        const userId =
          asString(participant.id) ??
          asString(participant.userId) ??
          asString(payload.userId) ??
          asString(payload.participantId);
        if (userId) {
          invalidateUserProfile(userId);
          invalidateUserProfileSummary(userId);
          dispatch(
            chatApi.util.invalidateTags([
              { type: "User", id: userId },
              { type: "UserProfile", id: userId },
              { type: "UserBatch", id: userId },
              { type: "ConversationMember", id: userId },
              { type: "ConversationMember", id: conversationId },
            ]),
          );
        }

        applyConversationParticipantSummary(conversationId, participant);
      },
      onAttachmentPreviewReady: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;
        const fileId =
          asString(payload.fileId) ?? asString(payload.attachmentId);
        if (!fileId) return;
        // Evict the cached PENDING entry + nudge mounted ImageMessages to refetch
        // a fresh signed URL. Idempotent: safe if polling already resolved it.
        markPreviewReady(fileId);
      },
      onAttachmentPreviewFailed: (data: unknown) => {
        const payload = asRecord(data);
        if (!payload) return;
        const fileId =
          asString(payload.fileId) ?? asString(payload.attachmentId);
        if (!fileId) return;
        markPreviewFailed(fileId);
      },
    });
    unsubscribersRef.current.push(unsubscribeChatEvents);

    const handleConversationJoined = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      const conversationId = getConversationId(payload);
      if (!conversationId) return;

      handleConversationJoinedAck(conversationId);
      if (useChatStore.getState().selectedConversationId === conversationId) {
        syncActiveConversationDelta(conversationId, "join-ack-active");
      }
    };

    const handleConversationLeft = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      const conversationId = getConversationId(payload);
      if (!conversationId) return;

      acknowledgeConversationLeft(
        conversationSyncStateRef.current,
        conversationId,
      );
      clearConversationJoinRetry(conversationId);
      clearConversationSyncFallback(conversationId);

      logMessageDebug("useWebSocket", "conversation_left_acknowledged", {
        conversationId,
      });
    };

    const handleReadReceipt = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const lastMessageId =
        asString(payload.lastReadMessageId) ??
        asString(payload.lastMessageId) ??
        asString(payload.messageId) ??
        asString(payload.id) ??
        asString(payload._id);
      const lastReadSeq =
        typeof payload.lastReadSeq === "number" ? payload.lastReadSeq : null;
      if (!conversationId || (!lastMessageId && lastReadSeq === null)) return;
      logMessageDebug("useWebSocket", "socket_message_read_received", {
        conversationId,
        lastMessageId,
        lastReadSeq,
      });

      const readerId =
        asString(payload.actorUserId) ??
        asString(payload.userId) ??
        asString(payload.senderId) ??
        undefined;
      const currentUserId = useAuthStore.getState().user?.id;
      dispatch(
        realtimeReadCursorUpdated({
          conversationId,
          ...(lastMessageId ? { lastReadMessageId: lastMessageId } : {}),
          ...(currentUserId ? { currentUserId } : {}),
          ...(readerId ? { readerId } : {}),
          ...(lastReadSeq !== null ? { lastReadSeq } : {}),
        }),
      );
    };

    const handleConversationSummaryUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const normalized = normalizeConversation(data);
      if (!normalized) {
        return;
      }

      const rawLastMessage =
        asRecord(payload?.lastMessage) ?? asRecord(payload?.last_message);
      const summaryLastMessageId =
        asString(payload?.lastMessageId) ??
        asString(payload?.last_message_id) ??
        asString(rawLastMessage?.id) ??
        asString(rawLastMessage?._id) ??
        asString(rawLastMessage?.messageId) ??
        normalized.lastMessageId ??
        normalized.lastMessage?.id ??
        null;
      const hasUsableLastMessageId = Boolean(
        summaryLastMessageId && !summaryLastMessageId.startsWith("last-"),
      );
      const activeConversationId =
        useChatStore.getState().selectedConversationId;

      logMessageDebug("useWebSocket", "[SUMMARY RECEIVED]", {
        conversationId: normalized.id,
        lastMessageId: summaryLastMessageId,
        hasUsableLastMessageId,
        summaryVersion: normalized.summaryVersion,
        activeConversationId,
      });

      const reconcileActiveConversationFromSummary = (reason: string) => {
        const currentActiveConversationId =
          useChatStore.getState().selectedConversationId;
        const hasMessage =
          hasUsableLastMessageId && summaryLastMessageId
            ? hasMessageIdInRtkCache(normalized.id, summaryLastMessageId)
            : false;
        const decision = decideSummaryActiveDeltaSync({
          activeConversationId: currentActiveConversationId,
          eventConversationId: normalized.id,
          hasUsableLastMessageId,
          hasMessageInCache: hasMessage,
        });
        logMessageDebug("useWebSocket", "[ACTIVE CONVERSATION CHECK]", {
          activeConversationId: currentActiveConversationId,
          eventConversationId: normalized.id,
          isActive: decision.isActive,
          source: "summary-event",
        });

        if (!decision.isActive) {
          return;
        }

        const cachedMessages = getConversationMessageCache(normalized.id);

        logMessageDebug("useWebSocket", "[RTKQ CACHE KEY]", {
          conversationId: normalized.id,
          endpointName: "getMessages",
          key: messagesQueryKey(normalized.id),
        });
        logMessageDebug("useWebSocket", "[MESSAGE CACHE BEFORE]", {
          conversationId: normalized.id,
          lastMessageId: summaryLastMessageId,
          hasMessage,
          messageCount: cachedMessages.length,
          newestLoadedSeq: getLatestServerSeq(cachedMessages),
          reason,
        });

        if (decision.shouldSync && decision.reason) {
          syncActiveConversationDelta(normalized.id, decision.reason);
        }
      };

      const summaryResult = upsertConversationSummary(normalized);
      if (!summaryResult.applied) {
        logMessageDebug("useWebSocket", "conversation_summary_ignored", {
          conversationId: normalized.id,
          reason: summaryResult.reason,
          previousVersion: summaryResult.previousVersion,
          nextVersion: summaryResult.nextVersion,
        });
        reconcileActiveConversationFromSummary("summary-ignored");
        return;
      }
      if (summaryResult.gapDetected) {
        logMessageDebug("useWebSocket", "conversation_summary_gap_detected", {
          conversationId: normalized.id,
          previousVersion: summaryResult.previousVersion,
          nextVersion: summaryResult.nextVersion,
        });
        maybeReconcileGap(normalized.id, "summary_version_gap");
      }
      notifySidebarState("conversation:summary:updated", {
        source: "socket",
        conversationId: normalized.id,
      });
      reconcileActiveConversationFromSummary("summary-applied");
    };

    const handleConversationMembershipUpdated = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const membershipState = asString(payload.membershipState);
      const summary = payload.summary;
      const reason = asString(payload.reason);

      if (!conversationId || !membershipState) {
        return;
      }

      if (membershipState === "active" && summary) {
        const normalized = normalizeConversation(summary);
        if (normalized) {
          const summaryResult = upsertConversationSummary(normalized);
          if (summaryResult.gapDetected) {
            maybeReconcileGap(conversationId, "membership_summary_gap");
          }
        }
        if (reason === "added" || reason === "restored") {
          maybeNotifyMembershipEvent(conversationId, membershipState, reason);
        }
        notifySidebarState("conversation:membership:updated", {
          source: "socket",
          conversationId,
          membershipState,
        });
        return;
      }

      // This event is user-scoped by the server, so a non-active state means
      // the current account has lost access to this conversation's sources.
      invalidateConversationFileResources(
        dispatch,
        conversationId,
        "membership-lost",
      );
      removeConversationSyncTracking(
        conversationSyncStateRef.current,
        conversationId,
      );
      clearConversationJoinRetry(conversationId);
      clearConversationSyncFallback(conversationId);
      removeConversation(conversationId);
      if (useChatStore.getState().selectedConversationId === conversationId) {
        selectConversation(null);
      }
      notifySidebarState("conversation:membership:updated", {
        source: "socket",
        conversationId,
        membershipState,
      });
    };

    const handleMemberUpdated = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      if (!conversationId) return;

      void getConversationByIdUseCase(conversationId)
        .then((response) => {
          updateConversation(conversationId, unwrapApiSuccess(response));
        })
        .catch(() => {
          // no-op: best effort refresh member/role changes
        });
    };

    const handleConversationDeleted = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      if (!conversationId) return;

      removeConversationSyncTracking(
        conversationSyncStateRef.current,
        conversationId,
      );
      removeConversation(conversationId);
      if (useChatStore.getState().selectedConversationId === conversationId) {
        selectConversation(null);
      }
    };

    const unsubscribeConversationEvents = registerConversationEvents(socket, {
      onConversationJoined: handleConversationJoined,
      onConversationLeft: handleConversationLeft,
      onConversationSummaryUpdated: handleConversationSummaryUpdated,
      onConversationMembershipUpdated: handleConversationMembershipUpdated,
      onMessageRead: handleReadReceipt,
      onMemberUpdated: handleMemberUpdated,
      onConversationDeleted: handleConversationDeleted,
    });
    unsubscribersRef.current.push(unsubscribeConversationEvents);

    const handleFriendshipEvent = (eventType: string, data: unknown) => {
      const detail = toFriendshipRealtimeDetail(eventType, data);
      const status = detail.status;

      useFriendshipStore.getState().applyRealtimeDetail(detail);
      notifySidebarState("friendship:updated", {
        source: "socket",
        eventType: detail.eventType,
        status,
      });
      // Backward compatibility for views still listening to the old sidebar event.
      notifySidebarState("friend:updated", {
        source: "socket",
        eventType: detail.eventType,
        status,
      });

      if (status === "blocked" || status === "canceled") {
        notifyRoomInline("chat:permission:updated", {
          source: "friendship",
          status,
        });
      }
    };

    const unsubscribeFriendshipEvents = registerFriendshipEvents(socket, {
      onFriendshipRequestCreated: (data) =>
        handleFriendshipEvent(WebSocketEvents.FRIENDSHIP_REQUEST_CREATED, data),
      onFriendshipRequestUpdated: (data) =>
        handleFriendshipEvent(WebSocketEvents.FRIENDSHIP_REQUEST_UPDATED, data),
      onFriendshipRelationUpdated: (data) =>
        handleFriendshipEvent(
          WebSocketEvents.FRIENDSHIP_RELATION_UPDATED,
          data,
        ),
    });
    unsubscribersRef.current.push(unsubscribeFriendshipEvents);

    const refreshGroupRoom = (
      data: unknown,
      options?: { skipIfCurrentUserIsTarget?: boolean; bumpMembers?: boolean },
    ) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      if (conversationId && options?.bumpMembers) {
        bumpMemberListVersion(conversationId);
      }
      if (
        conversationId &&
        !(
          options?.skipIfCurrentUserIsTarget &&
          shouldSkipGroupConversationRefreshForCurrentUser(
            payload,
            currentUserId,
          )
        )
      ) {
        const shouldUseDeltaRefresh = shouldUseDeltaConversationRefresh({
          conversationId,
          selectedConversationId:
            useChatStore.getState().selectedConversationId,
          joinedConversationIds:
            conversationSyncStateRef.current.joinedConversationIds,
        });

        if (shouldUseDeltaRefresh) {
          void reconcileConversationAuthoritative(
            conversationId,
            "conversation-refresh",
          );
        } else {
          void scheduleConversationSnapshotRefresh(conversationId, {
            delayMs: 0,
            reason: "group:conversation-refresh",
          });
        }
      }
    };

    const handleGroupInviteUser = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      notifySidebarState("group:invite:updated", {
        source: "socket",
        conversationId,
      });
    };

    const handleGroupInviteLinkCreated = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      const inviteLinkId = asString(payload?.inviteLinkId);
      if (conversationId && inviteLinkId) {
        upsertInviteLink(conversationId, {
          id: inviteLinkId,
          conversationId,
          createdAt:
            typeof payload?.occurredAt === "string"
              ? payload.occurredAt
              : new Date().toISOString(),
        });
      }
      notifySidebarState("group:invite:updated", {
        source: "socket",
        conversationId,
      });
    };

    const handleGroupInviteUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      notifySidebarState("group:invite:updated", {
        source: "socket",
        conversationId,
      });
    };

    const handleGroupJoinRequestNew = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      const requestId =
        asString(payload?.requestId) ??
        asString(payload?.id) ??
        asString(asRecord(payload?.request)?.id);
      const userId =
        asString(payload?.userId) ??
        asString(payload?.requesterId) ??
        asString(asRecord(payload?.request)?.userId);
      if (conversationId && requestId && userId) {
        upsertJoinRequest(conversationId, {
          id: requestId,
          conversationId,
          userId,
          status: "pending",
          note:
            asString(payload?.note) ??
            asString(asRecord(payload?.request)?.note) ??
            undefined,
          createdAt:
            asString(payload?.createdAt) ??
            asString(asRecord(payload?.request)?.createdAt) ??
            new Date().toISOString(),
        });
      }
      notifySidebarState("group:join-request:updated", {
        source: "socket",
        conversationId,
        requestId,
      });
    };

    const handleGroupJoinRequestResolved = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      const requestId =
        asString(payload?.requestId) ??
        asString(payload?.id) ??
        asString(asRecord(payload?.request)?.id);
      const status = asString(payload?.status);
      if (
        conversationId &&
        requestId &&
        (status === "approved" || status === "rejected")
      ) {
        markJoinRequestResolved(conversationId, requestId, status);
      }
      notifySidebarState("group:join-request:updated", {
        source: "socket",
        conversationId,
        requestId,
        status,
      });
    };

    const handleGroupPinUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      if (conversationId && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("group:pin:updated", {
            detail: { conversationId },
          }),
        );
      }
      refreshGroupRoom(data);
    };

    const handleGroupSlowModeTriggered = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      const retryAfterSeconds =
        typeof payload?.retryAfterSeconds === "number"
          ? payload.retryAfterSeconds
          : 0;
      if (conversationId && retryAfterSeconds > 0) {
        setSlowModeCooldown(conversationId, retryAfterSeconds);
      }
      if (retryAfterSeconds > 0) {
        notifyRoomInline("chat:restriction:updated", {
          conversationId,
          type: "slow_mode",
          retryAfterSeconds,
        });
      }
    };

    const handleGroupSettingsUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      if (conversationId) {
        maybeNotifyGroupUpdate(
          conversationId,
          t("chat:group.settingsChanged", { defaultValue: "Cài đặt nhóm đã thay đổi." }),
          `settings:${asString(payload?.eventId) ?? Date.now()}`,
        );
      }
      refreshGroupRoom(data);
    };

    const handlePermissionChanged = (data: unknown) => {
      const payload = asRecord(data);
      const allowed =
        typeof payload?.allowed === "boolean" ? payload.allowed : true;
      const scope = asString(payload?.scope);
      const currentUserId = useAuthStore.getState().user?.id;
      const peerUserId =
        currentUserId && asString(payload?.userId) === currentUserId
          ? asString(payload?.peerUserId)
          : currentUserId && asString(payload?.peerUserId) === currentUserId
            ? asString(payload?.userId)
            : asString(payload?.peerUserId);

      if (scope === "direct_message" && peerUserId) {
        const targetConversation = useChatStore
          .getState()
          .conversations.find((conversation) => {
            if (
              conversation.type !== "direct" &&
              conversation.type !== "private"
            ) {
              return false;
            }

            const participantIds = new Set(
              (conversation.participants || []).map(
                (participant) => participant.id,
              ),
            );

            return (
              conversation.otherUser?.id === peerUserId ||
              participantIds.has(peerUserId)
            );
          });

        if (targetConversation) {
          if (allowed) {
            clearSendRestriction(targetConversation.id);
            updateConversation(targetConversation.id, {
              canCurrentUserSend: true,
              sendRestriction: null,
            });
          } else {
            const reasonCode = asString(payload?.reason);
            const reason =
              reasonCode === "BLOCKED"
                ? t("chat:composer.directMessagingBlocked", {
                    defaultValue: "Direct messaging is no longer allowed.",
                  })
                : reasonCode === "UNFRIENDED"
                  ? t("chat:composer.unfriendedRestriction", {
                      defaultValue:
                        "You are no longer friends. Add this person as a friend again to continue messaging.",
                    })
                  : reasonCode === "FRIENDSHIP_REQUIRED"
                    ? t("chat:composer.friendshipRequiredRestriction", {
                        defaultValue:
                          "You can only message friends. Send a friend request to start the conversation.",
                      })
                    : t("chat:composer.directPermissionChanged", {
                        defaultValue: "Direct messaging permission changed.",
                      });
            setSendRestriction(targetConversation.id, {
              kind: "permission",
              reason,
              code: reasonCode ?? "PERMISSION_CHANGED",
            });
            if (
              reasonCode === "UNFRIENDED" ||
              reasonCode === "FRIENDSHIP_REQUIRED"
            ) {
              updateConversation(targetConversation.id, {
                canCurrentUserSend: false,
                sendRestriction: {
                  code: "FRIENDSHIP_REQUIRED",
                  ...(reasonCode === "UNFRIENDED"
                    ? { reason: "UNFRIENDED" }
                    : {}),
                },
              });
            }
          }
        }
      }
      if (!allowed) {
        notifyRoomInline("chat:permission:updated", {
          scope,
          allowed,
        });
      }
    };

    const unsubscribeGroupEvents = registerGroupEvents(socket, {
      onGroupInviteUser: handleGroupInviteUser,
      onGroupInviteLinkCreated: handleGroupInviteLinkCreated,
      onGroupInviteUpdated: handleGroupInviteUpdated,
      onGroupMemberJoined: (data) =>
        refreshGroupRoom(data, { bumpMembers: true }),
      onGroupMemberLeft: (data) =>
        refreshGroupRoom(data, {
          skipIfCurrentUserIsTarget: true,
          bumpMembers: true,
        }),
      onGroupMemberRemoved: (data) =>
        refreshGroupRoom(data, {
          skipIfCurrentUserIsTarget: true,
          bumpMembers: true,
        }),
      onGroupMemberUpdated: (data) =>
        refreshGroupRoom(data, { bumpMembers: true }),
      onGroupMemberBanned: (data) =>
        refreshGroupRoom(data, {
          skipIfCurrentUserIsTarget: true,
          bumpMembers: true,
        }),
      onGroupSettingsUpdated: handleGroupSettingsUpdated,
      onGroupJoinRequestNew: handleGroupJoinRequestNew,
      onGroupJoinRequestResolved: handleGroupJoinRequestResolved,
      onGroupPinUpdated: handleGroupPinUpdated,
      onGroupSlowModeTriggered: handleGroupSlowModeTriggered,
      onPermissionChanged: handlePermissionChanged,
    });
    unsubscribersRef.current.push(unsubscribeGroupEvents);

    const handleTypingStart = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      if (!shouldProcessTypingEvent(asString(payload.eventId))) return;

      const conversationId = getConversationId(payload);
      const userId = asString(payload.senderId) ?? asString(payload.userId);
      if (!conversationId || !userId) return;

      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId && userId === currentUserId) return;

      const conversation = useChatStore.getState().conversationById[conversationId];
      const participant = conversation?.participants?.find((p) => p.id === userId);
      const userName = participant
        ? resolveUserDisplayName(participant, { allowLegacyFallback: true })
        : (asString(payload.displayName) ??
           asString(payload.senderName) ??
           asString(payload.userName) ??
           asString(payload.username) ??
           asString(payload.user_name) ??
           "");
      const expiresAt =
        asString(payload.expiresAt) ??
        new Date(Date.now() + REMOTE_TYPING_TTL_MS).toISOString();
      const activity =
        asString(payload.activity) === "recording" ||
        asString(payload.activity) === "uploading" ||
        asString(payload.activity) === "typing"
          ? (asString(payload.activity) as "typing" | "recording" | "uploading")
          : "typing";
      const lastEventAt = Date.now();
      const typingStatus: TypingStatus = {
        conversationId,
        userId,
        userName,
        isTyping: true,
        activity,
        confidence: 1,
        lastEventAt,
        expiresAt,
        deviceId: asString(payload.deviceId) ?? undefined,
        deviceType: normalizeDeviceType(asString(payload.deviceType)),
      };

      setTyping(typingStatus);
      dispatch(realtimeActions.typingStarted(typingStatus));

      scheduleRemoteTypingExpiry(conversationId, userId, expiresAt);
    };

    const handleTypingStop = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      if (!shouldProcessTypingEvent(asString(payload.eventId))) return;

      const conversationId = getConversationId(payload);
      const userId = asString(payload.senderId) ?? asString(payload.userId);
      if (!conversationId || !userId) return;

      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId && userId === currentUserId) return;

      clearRemoteTypingTimer(conversationId, userId);
      dispatch(
        realtimeActions.typingStopped({
          conversationId,
          userId,
        }),
      );
      setTyping({
        conversationId,
        userId,
        userName:
          asString(payload.displayName) ??
          asString(payload.senderName) ??
          asString(payload.userName) ??
          asString(payload.username) ??
          asString(payload.user_name) ??
          "",
        isTyping: false,
        activity: "online",
        confidence: 0,
        lastEventAt: Date.now(),
        deviceId: asString(payload.deviceId) ?? undefined,
        deviceType: normalizeDeviceType(asString(payload.deviceType)),
      });
      clearTyping(conversationId, userId);
    };

    const unsubscribePresenceEvents = registerPresenceEvents(socket, {
      onTypingStart: handleTypingStart,
      onTypingStop: handleTypingStop,
    });
    unsubscribersRef.current.push(unsubscribePresenceEvents);

    const handleConversationResyncedEvent = (data: unknown) => {
      const payload = asRecord(data);
      const targetRoomIds = payload !== null ? getConversationIds(payload) : [];
      handleConversationResynced(targetRoomIds);
    };

    const handleResyncRequiredEvent = (data: unknown) => {
      const payload = asRecord(data);
      const scopes = Array.isArray(payload?.scopes)
        ? payload.scopes
            .map((scope) => asString(scope))
            .filter((scope): scope is string => typeof scope === "string")
        : [];
      handleResyncRequired(scopes);
    };

    // Settings update from another device / admin
    const handleUserSettingsUpdated = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      // Validate required fields
      const version =
        typeof payload.version === "number" ? payload.version : null;
      const settings = asRecord(payload.settings);
      if (version === null || !settings) return;

      useSettingsStore
        .getState()
        .applyRemoteUpdate(payload as unknown as UserSettingsUpdatedPayload);
    };

    const unsubscribeSyncEvents = registerSyncEvents(socket, {
      onConversationResynced: handleConversationResyncedEvent,
      onResyncRequired: handleResyncRequiredEvent,
      onUserSettingsUpdated: handleUserSettingsUpdated,
    });
    unsubscribersRef.current.push(unsubscribeSyncEvents);

    const unsubscribeReminderFire = socket.on("reminder:fire", (data: unknown) => {
      const payload = asRecord(data);
      const content = asString(payload?.content) ?? t("chat:reminder.fired", { defaultValue: "Nhắc hẹn!" });
      // dedupe theo id của reminder — card gửi `reminderId`, reminder cá nhân gửi `id`.
      const dedupeKey =
        asString(payload?.reminderId) ?? asString(payload?.id) ?? undefined;
      notifyGlobalToast({ level: "info", message: content, dedupeKey });
    });
    unsubscribersRef.current.push(unsubscribeReminderFire);

    logMessageDebug("useWebSocket", "listener_setup_completed", {
      listenerCount: unsubscribersRef.current.length,
      socketListenerCount: socket.getListenerCount(),
      connectionState: socket.getConnectionState(),
    });

    return socket;
  }, [
    clearConversationJoinRetry,
    clearConversationSyncFallback,
    clearRemoteTypingTimer,
    clearTyping,
    dispatch,
    emit,
    handleReauthRequiredEvent,
    handleUnauthorizedEvent,
    onError,
    removeConversation,
    handleConversationJoinedAck,
    handleConversationResynced,
    handleResyncRequired,
    reconcileConversationAuthoritative,
    maybeNotifyGroupUpdate,
    maybeNotifyIncomingMessage,
    maybeNotifyMembershipEvent,
    maybeReconcileGap,
    applyConversationParticipantSummary,
    scheduleConversationSnapshotRefresh,
    scheduleRemoteTypingExpiry,
    shouldProcessTypingEvent,
    syncActiveConversationDelta,
    syncSelectedActiveConversationDelta,
    selectConversation,
    setSendRestriction,
    clearSendRestriction,
    setTyping,
    setSlowModeCooldown,
    bumpMemberListVersion,
    upsertJoinRequest,
    upsertConversationSummary,
    markJoinRequestResolved,
    shouldProcessRealtimeEvent,
    upsertInviteLink,
    updateConversation,
    refreshUnreadSummarySnapshot,
  ]);

  const connectionLifecycle = useMemo(
    () =>
      createWebSocketConnectionLifecycle({
        state: connectionLifecycleStateRef.current,
        onConnect,
        onDisconnect,
        ensureFreshAccessToken,
        setupSocket,
        connectSocket,
        disconnectSocket,
        handleConnectFailure,
        getReconnectPlan: () => handleSocketConnectedResync(),
        requestConversationJoin,
        flushEmitQueue,
        flushQueuedMessages,
        getConnectionState: () =>
          getSocket()?.getConnectionState() ?? "unknown",
        getJoinedConversationIds: () =>
          Array.from(conversationSyncStateRef.current.joinedConversationIds),
        getQueuedEmitCount: () => emitQueueRef.current.length,
        clearActiveTypingTimeout,
        clearAllRemoteTypingTimers,
        clearAllConversationJoinRetries,
        handleSocketDisconnectedResync,
        resetResyncCoordinator,
        resetConversationSyncState: () => {
          conversationSyncStateRef.current.joinedConversationIds.clear();
          conversationSyncStateRef.current.subscribedConversationIds.clear();
          conversationSyncStateRef.current.pendingConversationSync.clear();
        },
        clearEmitQueue: () => {
          emitQueueRef.current = [];
        },
        recoverSocketAuth: (trigger, reason) =>
          recoverSocketAuth(trigger, reason),
        resyncClientState,
        log: (event, details) => {
          logMessageDebug("useWebSocket", event, details);
        },
      }),
    [
      clearActiveTypingTimeout,
      clearAllConversationJoinRetries,
      clearAllRemoteTypingTimers,
      flushEmitQueue,
      flushQueuedMessages,
      handleConnectFailure,
      handleSocketConnectedResync,
      handleSocketDisconnectedResync,
      onConnect,
      onDisconnect,
      recoverSocketAuth,
      resyncClientState,
      requestConversationJoin,
      resetResyncCoordinator,
      setupSocket,
    ],
  );
  const {
    connect: connectLifecycle,
    disconnect: disconnectLifecycle,
    handleBrowserOnline,
    handleResume,
  } = connectionLifecycle;

  useEffect(() => {
    connectionLifecycleRef.current = connectionLifecycle;
  }, [connectionLifecycle]);

  const connect = useCallback(() => {
    void connectLifecycle();
  }, [connectLifecycle]);

  const disconnect = useCallback(() => {
    disconnectLifecycle();
  }, [disconnectLifecycle]);

  const joinConversation = useCallback(
    (conversationId: string, options?: { skipInitialDeltaSync?: boolean }) => {
      if (!conversationId) return;
      const strategy = registerConversationJoinIntent(
        conversationSyncStateRef.current,
        conversationId,
        options,
      );
      logMessageDebug("useWebSocket", "join_conversation_state_registered", {
        conversationId,
        strategy,
      });
      requestConversationJoin(conversationId, { reason: "initial" });
    },
    [requestConversationJoin],
  );

  const leaveConversation = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;
      if (!conversationSyncStateRef.current.joinedConversationIds.has(conversationId)) {
        return;
      }

      emit(WebSocketEvents.CONVERSATION_LEAVE, {
        conversationId,
      });
      removeConversationSyncTracking(
        conversationSyncStateRef.current,
        conversationId,
      );
      clearConversationJoinRetry(conversationId);
      clearConversationSyncFallback(conversationId);
      clearRemoteTypingTimersForConversation(conversationId);
      clearConversationTypingStatuses(conversationId);
    },
    [
      clearConversationTypingStatuses,
      clearConversationJoinRetry,
      clearConversationSyncFallback,
      clearRemoteTypingTimersForConversation,
      emit,
    ],
  );

  const sendMessage = useCallback(
    (conversationId: string, content: string, type: string = "text") => {
      emit(WebSocketEvents.MESSAGE_SEND, {
        conversationId,
        content,
        type,
      });
    },
    [emit],
  );

  const sendTyping = useCallback(
    (conversationId: string) => {
      emit(WebSocketEvents.CONVERSATION_TYPING_STARTED, {
        type: WebSocketEvents.CONVERSATION_TYPING_STARTED,
        conversationId,
        deviceType: "web",
      });

      clearActiveTypingTimeout();
      typingTimeoutRef.current = setTimeout(() => {
        emit(WebSocketEvents.CONVERSATION_TYPING_STOPPED, {
          type: WebSocketEvents.CONVERSATION_TYPING_STOPPED,
          conversationId,
          deviceType: "web",
        });
      }, 3000);
    },
    [clearActiveTypingTimeout, emit],
  );

  const stopTyping = useCallback(
    (conversationId: string) => {
      if (!typingTimeoutRef.current) return;
      clearActiveTypingTimeout();

      emit(WebSocketEvents.CONVERSATION_TYPING_STOPPED, {
        type: WebSocketEvents.CONVERSATION_TYPING_STOPPED,
        conversationId,
        deviceType: "web",
      });
    },
    [clearActiveTypingTimeout, emit],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastResumeHandledAt = 0;
    // Track when the tab was last hidden so we can skip or throttle resync
    // for very short tab switches that do not warrant a full conversation +
    // message reconciliation round-trip.
    let lastHiddenAt = 0;

    const shouldHandleResume = () => {
      const now = Date.now();
      if (now - lastResumeHandledAt < 1200) {
        return false;
      }

      lastResumeHandledAt = now;
      return true;
    };

    const handleOnlineEvent = () => {
      if (!shouldHandleResume()) {
        return;
      }
      syncSelectedActiveConversationDelta("browser-online");
      handleBrowserOnline();
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;

      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
        return;
      }

      if (document.visibilityState !== "visible" || !shouldHandleResume()) {
        return;
      }

      const hiddenDurationMs = lastHiddenAt > 0 ? Date.now() - lastHiddenAt : 0;

      // Even short hidden-tab intervals can miss a message-created frame on
      // throttled browsers while summary events still update the sidebar. Resume
      // always runs a lightweight active conversation reconcile; it dedupes by
      // cursor/id and does not reload the page.

      // For long absences (≥ 5 min) where the WebSocket may still be connected,
      // proactively refresh the access token before the resync API calls fire.
      // The disconnected path already calls ensureFreshAccessToken via connect().
      if (hiddenDurationMs >= 5 * 60_000) {
        void ensureFreshAccessToken("proactive").catch(() => undefined);
      }

      syncSelectedActiveConversationDelta("visibility-visible");
      handleResume("visibility_resume");
    };

    const handlePageShow = () => {
      if (!shouldHandleResume()) {
        return;
      }
      syncSelectedActiveConversationDelta("pageshow");
      handleResume("pageshow");
    };

    const handleFocus = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "hidden" &&
        shouldHandleResume()
      ) {
        syncSelectedActiveConversationDelta("window-focus");
        handleResume("focus");
      }
    };

    window.addEventListener("online", handleOnlineEvent);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnlineEvent);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleBrowserOnline, handleResume, syncSelectedActiveConversationDelta]);

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    if (isAuthenticated && isAuthInitialized && !isBootstrappingAuth) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      // 1. Clear all timer-based resources first (before disconnecting socket).
      // This prevents stale timers from firing into a disconnected socket or
      // cleaned-up state after a rapid unmount/reconnect cycle.
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      clearAllRemoteTypingTimers();
      clearAllConversationJoinRetries();
      clearActiveConversationDeltaSyncTimers();

      // 2. Clear the emit queue so no pending messages are flushed into a
      // socket that is about to be destroyed or has already changed identity.
      emitQueueRef.current = [];

      // 3. Unsubscribe all socket event listeners registered by setupSocket.
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];

      // 4. Unsubscribe external subscriptions (auth refresh, cross-tab unread).
      externalUnsubscribersRef.current.forEach((unsub) => unsub());
      externalUnsubscribersRef.current = [];

      // 5. Tear down the socket connection last.
      disconnect();
    };
  }, [
    autoConnect,
    connect,
    disconnect,
    clearActiveConversationDeltaSyncTimers,
    clearAllRemoteTypingTimers,
    clearAllConversationJoinRetries,
    isAuthenticated,
    isAuthInitialized,
    isBootstrappingAuth,
  ]);

  return {
    isConnected: connectionState === "connected",
    connectionState,
    connect,
    disconnect,
    emit,
    joinConversation,
    leaveConversation,
    sendMessage,
    sendTyping,
    stopTyping,
  };
};

export type { ConnectionState };
export default useWebSocket;
