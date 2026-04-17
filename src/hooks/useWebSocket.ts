/**
 * @fileoverview useWebSocket hook
 * Manages raw WebSocket connection and real-time chat events.
 */

import { useEffect, useCallback, useRef, useState } from "react";
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
  notifyGlobalToast,
  notifyRoomInline,
  notifySidebarState,
} from "../utils/notificationRouter";
import {
  broadcastUnreadSnapshot,
  emitBrowserNotification,
  isDocumentVisibleAndFocused,
  subscribeUnreadSnapshotBroadcast,
  syncAppBadge,
  syncDocumentTitleBadge,
} from "../utils/realtimeNotifications";
import { logMessageDebug } from "../utils/messageDebug";
import { buildMessageCorrelationKey } from "../utils/messageIdentity";
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
} from "../features/chat/realtime";
import { getConversationByIdUseCase } from "../features/chat/usecases/getConversationById";
import { useSettingsStore } from "../settings/settingsStore";
import type { Conversation } from "../types";
import { useNotificationStore } from "../features/notification/state/notificationStore";

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
  joinRoom: (
    roomId: string,
    options?: { skipInitialDeltaSync?: boolean },
  ) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string, type?: string) => void;
  sendTyping: (roomId: string) => void;
  stopTyping: (roomId: string) => void;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const getConversationId = (payload: Record<string, unknown>): string | null => {
  return (
    asString(payload.conversationId) ??
    asString(payload.roomId) ??
    asString(payload.room_id) ??
    asString(payload.room) ??
    asString(asRecord(payload.message)?.conversationId) ??
    asString(asRecord(payload.message)?.roomId) ??
    asString(asRecord(payload.message)?.room_id) ??
    null
  );
};

const getMessagePayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> | null => {
  const nested = asRecord(payload.message);
  if (nested) return nested;
  if (
    asString(payload.id) ||
    asString(payload._id) ||
    asString(payload.messageId)
  ) {
    return payload;
  }
  return null;
};

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

const getConversationIds = (payload: Record<string, unknown>): string[] => {
  const candidates = [payload.conversationIds, payload.roomIds, payload.rooms];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => asString(item))
        .filter((item): item is string => typeof item === "string");
    }
  }

  const singleConversationId = getConversationId(payload);
  return singleConversationId ? [singleConversationId] : [];
};

export const shouldSkipGroupRoomRefreshForCurrentUser = (
  payload: Record<string, unknown> | null,
  currentUserId: string | null | undefined,
): boolean => {
  if (!payload || !currentUserId) {
    return false;
  }

  const targetUserId =
    asString(payload.userId) ?? asString(payload.targetUserId);
  return targetUserId === currentUserId;
};

type MessageCursor = {
  at: string;
  id: string;
};

export type PendingRoomSyncStrategy = "skip" | "initial-sync" | "reconnect";

type DrainedPendingRoomSync = {
  roomId: string;
  strategy: PendingRoomSyncStrategy;
};

export const drainPendingRoomSync = (
  pendingMap: Map<string, PendingRoomSyncStrategy>,
  joinedRooms: Set<string>,
  targetRoomIds: string[],
): DrainedPendingRoomSync[] => {
  const roomIdsToDrain =
    targetRoomIds.length > 0
      ? targetRoomIds.filter((roomId) => joinedRooms.has(roomId))
      : Array.from(pendingMap.keys());

  const drained: DrainedPendingRoomSync[] = [];
  roomIdsToDrain.forEach((roomId) => {
    const strategy = pendingMap.get(roomId) ?? "initial-sync";
    pendingMap.delete(roomId);
    drained.push({ roomId, strategy });
  });

  return drained;
};

export const drainPendingRoomSyncForResyncRequired = (
  pendingMap: Map<string, PendingRoomSyncStrategy>,
  joinedRooms: Set<string>,
): DrainedPendingRoomSync[] => {
  return Array.from(joinedRooms).map((roomId) => {
    const pending = pendingMap.get(roomId);
    pendingMap.delete(roomId);

    return {
      roomId,
      strategy:
        pending === "initial-sync" || pending === "reconnect"
          ? pending
          : "reconnect",
    };
  });
};

const REMOTE_TYPING_DECAY_INTERVAL_MS = 320;
const REMOTE_TYPING_HALF_LIFE_MS = 1400;
const REMOTE_TYPING_VISIBLE_THRESHOLD = 0.12;
const ROOM_JOIN_ACK_TIMEOUT_MS = 2_000;
const ROOM_JOIN_RETRY_DELAY_MAX_MS = 8_000;
const ROOM_SYNC_FALLBACK_TIMEOUT_MS = 2_500;
const CONVERSATION_SNAPSHOT_REFRESH_DEBOUNCE_MS = 250;

const computeTypingConfidence = (lastEventAt: number, now: number): number =>
  Math.exp(-(now - lastEventAt) / REMOTE_TYPING_HALF_LIFE_MS);

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const totalUnreadCount = useChatStore((s) => s.totalUnreadCount);
  const conversations = useChatStore((s) => s.conversations);

  const ingestConversationMessageEvent = useChatStore(
    (s) => s.ingestConversationMessageEvent,
  );
  const removeMessage = useChatStore((s) => s.removeMessage);
  const upsertConversationSummary = useChatStore(
    (s) => s.upsertConversationSummary,
  );
  const applyUnreadSummary = useChatStore((s) => s.applyUnreadSummary);
  const setTyping = useChatStore((s) => s.setTyping);
  const clearTyping = useChatStore((s) => s.clearTyping);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const markMessagesReadUpTo = useChatStore((s) => s.markMessagesReadUpTo);
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

  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const subscribedRoomsRef = useRef<Set<string>>(new Set());
  const pendingRoomSyncRef = useRef<Map<string, PendingRoomSyncStrategy>>(
    new Map(),
  );
  const roomJoinRetryTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const roomSyncFallbackTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const roomJoinRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedRealtimeEventIdsRef = useRef<Map<string, number>>(new Map());
  const resyncGapCooldownRef = useRef<Map<string, number>>(new Map());
  const conversationListRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const suppressUnreadBroadcastRef = useRef(false);
  const emitQueueRef = useRef<Array<{ event: string; data: unknown }>>([]);
  const hasConnectedOnceRef = useRef(false);
  const shouldResyncOnConnectRef = useRef(false);
  const roomResyncInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const conversationRefreshInFlightRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );
  const conversationRefreshTimerRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const remoteTypingTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const wsRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const wsReauthFailureHandledRef = useRef(false);

  useEffect(() => {
    const socket = initSocket();
    const unsub = socket.onStateChange((state) => {
      logMessageDebug("useWebSocket", "connection_state_changed", {
        state,
        joinedRooms: Array.from(joinedRoomsRef.current),
      });
      setConnectionState(state);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    return subscribeToAuthRefreshEvents((event) => {
      if (event.type === "token_refreshed") {
        wsReauthFailureHandledRef.current = false;
        resetAuthFailureState();
      }
    });
  }, []);

  useEffect(() => {
    syncDocumentTitleBadge(totalUnreadCount);
    void syncAppBadge(totalUnreadCount);
  }, [totalUnreadCount]);

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
        }),
      ),
      source: "socket",
      syncedAtMs,
    });
  }, [conversations, totalUnreadCount]);

  useEffect(() => {
    return subscribeUnreadSnapshotBroadcast((snapshot) => {
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
  }, [applyUnreadSummary]);

  const getNotificationPreferences = useCallback(() => {
    return useSettingsStore.getState().notifications;
  }, []);

  const shouldProcessRealtimeEvent = useCallback(
    (eventKey: string, details?: Record<string, unknown>): boolean => {
      if (!eventKey) {
        return true;
      }

      const now = Date.now();
      processedRealtimeEventIdsRef.current.forEach((seenAt, key) => {
        if (now - seenAt > 5 * 60_000) {
          processedRealtimeEventIdsRef.current.delete(key);
        }
      });

      if (processedRealtimeEventIdsRef.current.has(eventKey)) {
        logMessageDebug("useWebSocket", "duplicate_realtime_event_suppressed", {
          eventKey,
          ...details,
        });
        return false;
      }

      processedRealtimeEventIdsRef.current.set(eventKey, now);
      if (processedRealtimeEventIdsRef.current.size > 1000) {
        const oldestKey = processedRealtimeEventIdsRef.current.keys().next().value;
        if (typeof oldestKey === "string") {
          processedRealtimeEventIdsRef.current.delete(oldestKey);
        }
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

  const clearRoomJoinRetry = useCallback((roomId: string) => {
    const timer = roomJoinRetryTimersRef.current.get(roomId);
    if (timer) {
      clearTimeout(timer);
      roomJoinRetryTimersRef.current.delete(roomId);
    }
  }, []);

  const clearAllRoomJoinRetries = useCallback(() => {
    roomJoinRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    roomJoinRetryTimersRef.current.clear();
    roomJoinRetryAttemptsRef.current.clear();
  }, []);

  const clearRoomSyncFallback = useCallback((roomId: string) => {
    const timer = roomSyncFallbackTimersRef.current.get(roomId);
    if (timer) {
      clearTimeout(timer);
      roomSyncFallbackTimersRef.current.delete(roomId);
    }
  }, []);

  const clearAllRoomSyncFallbacks = useCallback(() => {
    roomSyncFallbackTimersRef.current.forEach((timer) => clearTimeout(timer));
    roomSyncFallbackTimersRef.current.clear();
  }, []);

  const clearConversationSnapshotRefresh = useCallback((conversationId: string) => {
    const timer = conversationRefreshTimerRef.current.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      conversationRefreshTimerRef.current.delete(conversationId);
    }
  }, []);

  const clearAllConversationSnapshotRefreshes = useCallback(() => {
    conversationRefreshTimerRef.current.forEach((timer) => clearTimeout(timer));
    conversationRefreshTimerRef.current.clear();
  }, []);

  const scheduleRemoteTypingDecay = useCallback(
    (conversationId: string, userId: string, userName: string) => {
      const key = `${conversationId}:${userId}`;
      clearRemoteTypingTimer(conversationId, userId);

      const tick = () => {
        const current = useChatStore
          .getState()
          .typingStatuses.find(
            (item) =>
              item.conversationId === conversationId && item.userId === userId,
          );
        const lastEventAt = current?.lastEventAt;
        if (!lastEventAt) {
          clearTyping(conversationId, userId);
          remoteTypingTimersRef.current.delete(key);
          return;
        }

        const confidence = computeTypingConfidence(lastEventAt, Date.now());
        if (confidence < REMOTE_TYPING_VISIBLE_THRESHOLD) {
          clearTyping(conversationId, userId);
          remoteTypingTimersRef.current.delete(key);
          return;
        }

        setTyping({
          conversationId,
          userId,
          userName: current?.userName || userName,
          isTyping: true,
          activity: current?.activity || "typing",
          confidence,
          lastEventAt,
        });

        const timer = setTimeout(tick, REMOTE_TYPING_DECAY_INTERVAL_MS);
        remoteTypingTimersRef.current.set(key, timer);
      };

      const timer = setTimeout(tick, REMOTE_TYPING_DECAY_INTERVAL_MS);
      remoteTypingTimersRef.current.set(key, timer);
    },
    [clearRemoteTypingTimer, clearTyping, setTyping],
  );

  const handleWsRefreshFailure = useCallback(
    async (reason: string, error: unknown) => {
      if (!wsReauthFailureHandledRef.current) {
        wsReauthFailureHandledRef.current = true;
        notifyGlobalToast({
          level: "error",
          message: "Session expired. Please login again.",
          dedupeKey: "auth:session-expired",
          cooldownMs: 30000,
        });
        await useAuthStore.getState().handleAuthFailure("refresh_failed");
      }

      const message = error instanceof Error ? error.message : "refresh_failed";
      onError?.(
        new Error(`WebSocket auth recovery failed (${reason}): ${message}`),
      );
    },
    [onError],
  );

  const recoverSocketAuth = useCallback(
    async (
      trigger: "ws_reauth_required" | "ws_unauthorized" | "ws_close_4401",
      reason: string,
      mode: "reauth" | "reconnect" = "reconnect",
    ) => {
      if (!wsRecoveryPromiseRef.current) {
        wsRecoveryPromiseRef.current = (async () => {
          try {
            let accessToken: string;

            if (mode === "reauth") {
              const currentAccessToken = getAccessToken();
              if (!currentAccessToken) {
                throw new Error("Missing access token");
              }

              if (
                isTokenExpiringSoon(
                  currentAccessToken,
                  AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD,
                )
              ) {
                accessToken = await refreshAccessTokenShared(trigger);
                updateSocketAuth(accessToken);
              } else {
                accessToken = currentAccessToken;
                authenticateSocket(accessToken);
              }
            } else {
              accessToken = await refreshAccessTokenShared(trigger);
              updateSocketAuth(accessToken);
            }

            resetAuthFailureState();
            wsReauthFailureHandledRef.current = false;
          } catch (error) {
            await handleWsRefreshFailure(reason, error);
          }
        })().finally(() => {
          wsRecoveryPromiseRef.current = null;
        });
      }

      return wsRecoveryPromiseRef.current;
    },
    [handleWsRefreshFailure],
  );

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

  const emitJoinRoom = useCallback(
    (roomId: string) => {
      logMessageDebug("useWebSocket", "room_join_requested", {
        roomId,
        connectionState: getSocket()?.getConnectionState() ?? "unknown",
      });
      emit(WebSocketEvents.CONVERSATION_JOIN, {
        roomId,
        conversationId: roomId,
      });
    },
    [emit],
  );

  const resyncRoom = useCallback(
    async (
      roomId: string,
      options?: { reason?: "initial-sync" | "reconnect" | "room-refresh" },
    ) => {
      const chatState = useChatStore.getState();
      if (
        options?.reason === "initial-sync" &&
        chatState.hasAuthoritativeHistoryByConversation[roomId] &&
        chatState.hasNewerMessagesByConversation[roomId] === false
      ) {
        logMessageDebug("useWebSocket", "delta_sync_blocked_known_latest", {
          roomId,
          reason: options?.reason,
          hydrated: chatState.messagesHydratedByConversation[roomId],
          hasAuthoritativeHistory:
            chatState.hasAuthoritativeHistoryByConversation[roomId],
          hasNext: chatState.hasNewerMessagesByConversation[roomId],
        });
        return;
      }

      const resolveLatestCursor = (): MessageCursor | undefined => {
        const roomMessages = useChatStore.getState().messages[roomId] || [];
        for (let index = roomMessages.length - 1; index >= 0; index -= 1) {
          const candidate = roomMessages[index];
          const candidateId = candidate?.id;
          const candidateAt = toCursorValue(candidate?.createdAt);
          if (
            typeof candidateId === "string" &&
            !candidateId.startsWith("temp-") &&
            typeof candidateAt === "string"
          ) {
            return {
              at: candidateAt,
              id: candidateId,
            };
          }
        }
        return undefined;
      };

      let afterCursor = resolveLatestCursor();

      if (!afterCursor) return;
      logMessageDebug("useWebSocket", "delta_sync_started", {
        roomId,
        reason: options?.reason,
        afterCursor,
      });

      // Fetch missed messages in pages to avoid dropping backlog on long disconnects.
      for (let attempts = 0; attempts < 10; attempts += 1) {
        const result = await fetchMessages(roomId, undefined, afterCursor.at, {
          afterId: afterCursor.id,
          syncReason: options?.reason,
          source: "delta_sync",
          queryType: "pagination_newer",
          selectedConversationIdAtDispatch:
            useChatStore.getState().selectedConversationId ?? null,
        });
        logMessageDebug("useWebSocket", "delta_sync_page_completed", {
          roomId,
          reason: options?.reason,
          attempt: attempts,
          afterCursor,
          result,
        });

        if (!result.loaded || !result.hasMore) {
          break;
        }

        const nextCursor = resolveLatestCursor();
        if (
          !nextCursor ||
          (nextCursor.at === afterCursor.at && nextCursor.id === afterCursor.id)
        ) {
          break;
        }

        afterCursor = nextCursor;
      }
    },
    [fetchMessages],
  );

  const scheduleRoomResync = useCallback(
    (
      roomId: string,
      options?: { reason?: "initial-sync" | "reconnect" | "room-refresh" },
    ) => {
      const chatState = useChatStore.getState();
      const willBlockAsKnownLatest =
        options?.reason === "initial-sync" &&
        chatState.hasAuthoritativeHistoryByConversation[roomId] &&
        chatState.hasNewerMessagesByConversation[roomId] === false;
      if (willBlockAsKnownLatest) {
        logMessageDebug("useWebSocket", "delta_sync_schedule_skipped", {
          roomId,
          reason: options?.reason,
        });
        return Promise.resolve();
      }

      const inFlight = roomResyncInFlightRef.current.get(roomId);
      if (inFlight) {
        return inFlight;
      }

      const request = resyncRoom(roomId, options).finally(() => {
        roomResyncInFlightRef.current.delete(roomId);
      });
      roomResyncInFlightRef.current.set(roomId, request);
      logMessageDebug("useWebSocket", "delta_sync_scheduled", {
        roomId,
        reason: options?.reason,
      });
      return request;
    },
    [resyncRoom],
  );

  const refreshConversationSnapshot = useCallback(
    (conversationId: string): Promise<void> => {
      const inFlight =
        conversationRefreshInFlightRef.current.get(conversationId);
      if (inFlight) {
        return inFlight;
      }

      const request = getConversationByIdUseCase(conversationId)
        .then((response) => {
          upsertConversationSummary(unwrapApiSuccess(response));
        })
        .catch(async () => {
          await fetchConversations().catch(() => {
            // no-op: best effort authoritative refresh
          });
        })
        .finally(() => {
          conversationRefreshInFlightRef.current.delete(conversationId);
        });

      conversationRefreshInFlightRef.current.set(conversationId, request);
      return request;
    },
    [fetchConversations, upsertConversationSummary],
  );

  const scheduleConversationSnapshotRefresh = useCallback(
    (
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
          conversationRefreshTimerRef.current.delete(conversationId);
          logMessageDebug("useWebSocket", "conversation_snapshot_refresh_scheduled", {
            conversationId,
            reason: options?.reason,
          });
          void refreshConversationSnapshot(conversationId).finally(resolve);
        }, Math.max(0, delayMs));

        conversationRefreshTimerRef.current.set(conversationId, timer);
      }),
    [clearConversationSnapshotRefresh, refreshConversationSnapshot],
  );

  const refreshChangedConversationSummaries = useCallback(
    async (options?: {
      reason?: "initial" | "reconnect" | "retry" | "resync_required";
      forceFull?: boolean;
    }): Promise<void> => {
      if (conversationListRefreshInFlightRef.current) {
        return conversationListRefreshInFlightRef.current;
      }

      const currentCursor = useChatStore.getState().lastConversationUpdatedAfterCursor;
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
          const response = await conversationApi.getConversations(page, limit, {
            updatedAfter: currentCursor,
          });
          const batch = (unwrapApiSuccess(response) as unknown[] | undefined) ?? [];
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
            error:
              error instanceof Error ? error.message : "unknown_refresh_error",
          });
          await fetchConversations();
        })
        .finally(() => {
          conversationListRefreshInFlightRef.current = null;
        });

      conversationListRefreshInFlightRef.current = request;
      return request;
    },
    [fetchConversations, upsertConversationSummary],
  );

  const refreshUnreadSummarySnapshot = useCallback(async (): Promise<void> => {
    const requestedAtMs = Date.now();
    const response = await conversationApi.getUnreadSummary();
    applyUnreadSummary(unwrapApiSuccess(response), {
      requestedAtMs,
      appliedAtMs: Date.now(),
      source: "snapshot",
    });
  }, [applyUnreadSummary]);

  const reconcileConversationAuthoritative = useCallback(
    (
      roomId: string,
      reason: "skip" | "initial-sync" | "reconnect" | "room-refresh",
    ): Promise<void> => {
      if (reason === "skip") {
        return scheduleConversationSnapshotRefresh(roomId, {
          delayMs: 0,
          reason,
        }).catch(() => {
          // no-op: best effort authoritative refresh
        });
      }

      return Promise.allSettled([
        scheduleRoomResync(roomId, { reason }),
        scheduleConversationSnapshotRefresh(roomId, {
          delayMs: 0,
          reason,
        }),
      ]).then(() => {
        // no-op: best effort authoritative reconcile
      });
    },
    [scheduleConversationSnapshotRefresh, scheduleRoomResync],
  );

  const maybeReconcileGap = useCallback(
    (conversationId: string, reason: string) => {
      const now = Date.now();
      const lastAt = resyncGapCooldownRef.current.get(conversationId) ?? 0;
      if (now - lastAt < 5_000) {
        return;
      }

      resyncGapCooldownRef.current.set(conversationId, now);
      logMessageDebug("useWebSocket", "conversation_gap_reconcile_requested", {
        conversationId,
        reason,
      });
      void refreshUnreadSummarySnapshot().catch(() => {
        // no-op: best effort badge reconcile
      });
      void reconcileConversationAuthoritative(conversationId, "room-refresh");
    },
    [reconcileConversationAuthoritative, refreshUnreadSummarySnapshot],
  );

  const maybeNotifyIncomingMessage = useCallback(
    (input: {
      conversationId: string;
      messageId: string;
      senderId: string | null;
      senderName: string | null;
      content: string;
      mentions: string[];
      kind?: "message" | "mention" | "group_activity" | "system";
      eventId?: string | null;
    }) => {
      const currentUserId = useAuthStore.getState().user?.id ?? null;
      if (!currentUserId || !input.senderId || input.senderId === currentUserId) {
        return;
      }

      const notificationSettings = getNotificationPreferences();
      if (!notificationSettings.enabled) {
        return;
      }

      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === input.conversationId);
      const hasMention = input.mentions.includes(currentUserId);
      const isMuted = Boolean(conversation?.isMuted);
      if (isMuted && !hasMention) {
        return;
      }

      const isActiveConversation =
        useChatStore.getState().selectedConversationId === input.conversationId;
      const visibleAndFocused = isDocumentVisibleAndFocused();
      const conversationLabel =
        conversation?.displayName ||
        conversation?.name ||
        input.senderName ||
        "Conversation";
      const notificationKind =
        input.kind === "system"
          ? "system"
          : hasMention
            ? "mention"
            : input.kind || "message";

      useNotificationStore.getState().upsertNotification({
        id:
          input.eventId ||
          `message:${input.conversationId}:${input.messageId}:${notificationKind}`,
        kind: notificationKind,
        title: conversationLabel,
        body:
          input.content ||
          (notificationKind === "system"
            ? "System activity"
            : "Sent an attachment"),
        createdAt: new Date().toISOString(),
        conversationId: input.conversationId,
        messageId: input.messageId,
        actorId: input.senderId,
        isRead: false,
      });

      if (isActiveConversation && visibleAndFocused && !hasMention) {
        return;
      }
      const preview = notificationSettings.messagePreview
        ? input.content || "Sent an attachment"
        : hasMention
          ? "You were mentioned."
          : "New message";
      const notificationId =
        input.eventId ||
        `message:${input.conversationId}:${input.messageId}:${hasMention ? "mention" : "new"}`;
      const toastMessage = hasMention
        ? `${input.senderName || "Someone"} mentioned you in ${conversationLabel}`
        : `${input.senderName || conversationLabel}: ${preview}`;

      notifyGlobalToast({
        level: "info",
        message: toastMessage,
        dedupeKey: notificationId,
        cooldownMs: 20_000,
      });

      if (!visibleAndFocused) {
        emitBrowserNotification({
          id: notificationId,
          tag: `conversation:${input.conversationId}`,
          title: hasMention
            ? `${conversationLabel} · Mention`
            : conversationLabel,
          body: preview,
          silent: !notificationSettings.sound,
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent("chat:notification:clicked", {
                detail: {
                  conversationId: input.conversationId,
                  messageId: input.messageId,
                },
              }),
            );
          },
        });
      }
    },
    [getNotificationPreferences],
  );

  const maybeNotifyMembershipEvent = useCallback(
    (conversationId: string, membershipState: string, reason: string | null) => {
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      const conversationLabel =
        conversation?.displayName || conversation?.name || "Group";
      const notificationId = `membership:${conversationId}:${membershipState}:${reason ?? "unknown"}`;
      const message =
        membershipState === "active" && reason === "added"
          ? `You were added to ${conversationLabel}.`
          : membershipState === "active" && reason === "restored"
            ? `You can access ${conversationLabel} again.`
            : `Membership changed for ${conversationLabel}.`;

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
    [getNotificationPreferences],
  );

  const maybeNotifyGroupUpdate = useCallback(
    (conversationId: string, body: string, notificationSuffix: string) => {
      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      const conversationLabel =
        conversation?.displayName || conversation?.name || "Group";
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
    [getNotificationPreferences],
  );

  const requestRoomJoin = useCallback(
    (
      roomId: string,
      options?: {
        reason?: "initial" | "reconnect" | "retry";
      },
    ) => {
      if (!roomId || !joinedRoomsRef.current.has(roomId)) {
        return;
      }

      emitJoinRoom(roomId);
      clearRoomJoinRetry(roomId);

      const attempt = roomJoinRetryAttemptsRef.current.get(roomId) ?? 0;
      const retryDelay = Math.min(
        ROOM_JOIN_ACK_TIMEOUT_MS * Math.max(attempt + 1, 1),
        ROOM_JOIN_RETRY_DELAY_MAX_MS,
      );

      const retryTimer = setTimeout(() => {
        roomJoinRetryTimersRef.current.delete(roomId);

        if (
          !joinedRoomsRef.current.has(roomId) ||
          subscribedRoomsRef.current.has(roomId)
        ) {
          return;
        }

        const connectionState = getSocket()?.getConnectionState() ?? "unknown";
        if (connectionState !== "connected") {
          logMessageDebug(
            "useWebSocket",
            "room_join_retry_waiting_connection",
            {
              roomId,
              reason: options?.reason,
              connectionState,
            },
          );
          return;
        }

        const nextAttempt = attempt + 1;
        roomJoinRetryAttemptsRef.current.set(roomId, nextAttempt);

        logMessageDebug("useWebSocket", "room_join_ack_timeout", {
          roomId,
          reason: options?.reason,
          attempt: nextAttempt,
          retryDelay,
        });

        if (useChatStore.getState().selectedConversationId === roomId) {
          void scheduleRoomResync(roomId, { reason: "room-refresh" });
        }

        requestRoomJoin(roomId, { reason: "retry" });
      }, retryDelay);

      roomJoinRetryTimersRef.current.set(roomId, retryTimer);
    },
    [clearRoomJoinRetry, emitJoinRoom, scheduleRoomResync],
  );

  const setupSocket = useCallback(() => {
    const socket = initSocket();
    logMessageDebug("useWebSocket", "listener_setup_started", {
      existingListenerCount: unsubscribersRef.current.length,
      connectionState: socket.getConnectionState(),
    });

    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    const handleConnect = () => {
      logMessageDebug("useWebSocket", "socket_connected", {
        shouldResync: shouldResyncOnConnectRef.current,
        joinedRooms: Array.from(joinedRoomsRef.current),
      });
      onConnect?.();

      const shouldResync = shouldResyncOnConnectRef.current;
      shouldResyncOnConnectRef.current = false;

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
        useFriendshipStore.getState().triggerResync("socket_reconnect");
      }

      joinedRoomsRef.current.forEach((roomId) => {
        clearRoomSyncFallback(roomId);
        subscribedRoomsRef.current.delete(roomId);
        roomJoinRetryAttemptsRef.current.set(roomId, 0);
        pendingRoomSyncRef.current.set(
          roomId,
          shouldResync ? "reconnect" : "skip",
        );
        requestRoomJoin(roomId, {
          reason: shouldResync ? "reconnect" : "initial",
        });
      });

      hasConnectedOnceRef.current = true;

      flushEmitQueue();
      logMessageDebug("useWebSocket", "offline_queue_flush_requested", {
        reason: "socket_connected",
        joinedRooms: Array.from(joinedRoomsRef.current),
      });
      void flushQueuedMessages();
    };

    const handleDisconnect = (data: unknown) => {
      const payload = asRecord(data);
      const code =
        typeof payload?.code === "number"
          ? payload.code
          : Number(asString(payload?.code) ?? "0");
      const reason =
        asString(payload?.reason) ??
        (Number.isFinite(code) && code > 0 ? String(code) : "disconnected");
      if (hasConnectedOnceRef.current) {
        shouldResyncOnConnectRef.current = true;
      }
      subscribedRoomsRef.current.clear();
      clearAllRoomSyncFallbacks();
      clearAllRoomJoinRetries();
      if (code === 4401) {
        void recoverSocketAuth("ws_close_4401", "close_4401");
      }
      onDisconnect?.(reason);
    };

    const handleConnectError = (data: unknown) => {
      const message =
        asString(asRecord(data)?.message) ?? "WebSocket connection error";
      onError?.(new Error(message));
    };

    const handleWsError = (data: unknown) => {
      const message =
        asString(asRecord(data)?.message) ?? "WebSocket server error";
      onError?.(new Error(message));
    };

    const handleAuthUnauthorized = (data: unknown) => {
      const payload = asRecord(data);
      const message = asString(payload?.message) ?? "WebSocket unauthorized";
      const code = asString(payload?.code) ?? "AUTH_UNAUTHORIZED";
      void recoverSocketAuth("ws_unauthorized", code);
      onError?.(new Error(message));
    };

    const handleAuthReauthRequired = (data: unknown) => {
      const reason =
        asString(asRecord(data)?.reason) ?? "reauthentication required";
      void recoverSocketAuth(
        "ws_reauth_required",
        reason,
        reason === "authenticate_required" ? "reauth" : "reconnect",
      );
    };

    const unsubscribeConnectionEvents = registerConnectionEvents(socket, {
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onConnectError: handleConnectError,
      onWsError: handleWsError,
      onAuthUnauthorized: handleAuthUnauthorized,
      onAuthReauthRequired: handleAuthReauthRequired,
    });
    unsubscribersRef.current.push(unsubscribeConnectionEvents);

    const upsertIncomingMessage = (
      data: unknown,
      eventType: "message:new" | "message:updated",
    ) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const messagePayload = getMessagePayload(payload);
      const messageId = messagePayload
        ? (asString(messagePayload.id) ??
          asString(messagePayload._id) ??
          asString(messagePayload.messageId) ??
          asString(messagePayload.stableId) ??
          asString(messagePayload.localId) ??
          asString(messagePayload.tempId))
        : null;
      if (!conversationId || !messagePayload || !messageId) return;

      const tempId =
        asString(payload.tempId) ??
        asString(messagePayload.tempId) ??
        asString(payload.clientMessageId) ??
        asString(messagePayload.clientMessageId);
      const clientMessageId =
        asString(payload.clientMessageId) ??
        asString(messagePayload.clientMessageId) ??
        tempId ??
        undefined;
      const localId =
        asString(messagePayload.localId) ??
        asString(payload.localId) ??
        tempId ??
        undefined;
      const stableId =
        asString(messagePayload.stableId) ?? localId ?? messageId;
      const senderId =
        asString(messagePayload.senderId) ?? asString(payload.senderId);
      const correlationKey = buildMessageCorrelationKey({
        conversationId,
        clientMessageId,
        tempId: tempId ?? undefined,
        localId,
      });
      const eventId =
        asString(payload.eventId) ??
        asString(messagePayload.eventId) ??
        `${eventType}:${conversationId}:${messageId}:${
          asString(messagePayload.updatedAt) ??
          asString(messagePayload.createdAt) ??
          "unknown"
        }`;
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
      });
      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?.id;
      const isActiveConversation =
        chatState.selectedConversationId === conversationId;
      const visibleAndFocused = isDocumentVisibleAndFocused();
      const isSelfAuthoredMessage =
        Boolean(senderId && currentUserId && senderId === currentUserId);
      const isAmbiguousSelfReconcile =
        eventType === "message:new" &&
        isSelfAuthoredMessage &&
        !clientMessageId &&
        !localId;
      const shouldIncrementUnread = Boolean(
        eventType === "message:new" &&
          senderId &&
          currentUserId &&
          senderId !== currentUserId &&
          (!isActiveConversation || !visibleAndFocused),
      );
      const ingestResult = ingestConversationMessageEvent(conversationId, {
        ...(messagePayload as unknown as Parameters<
          typeof ingestConversationMessageEvent
        >[1]),
        ...(stableId ? { stableId } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(localId ? { localId } : {}),
      }, {
        incrementUnread: shouldIncrementUnread,
        source: eventType,
      });

      if (eventType === "message:new" && ingestResult.status === "new") {
        maybeNotifyIncomingMessage({
          conversationId,
          messageId,
          senderId,
          senderName:
            asString(messagePayload.senderName) ?? asString(payload.senderName),
          content:
            typeof messagePayload.content === "string" ? messagePayload.content : "",
          mentions: Array.isArray(messagePayload.mentions)
            ? messagePayload.mentions.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          kind:
            asString(messagePayload.type) === "system" ? "system" : "message",
          eventId,
        });
      }

      if (isAmbiguousSelfReconcile) {
        logMessageDebug("useWebSocket", "socket_message_missing_reconcile_alias", {
          conversationId,
          eventId,
          messageId,
          senderId,
          stableId,
        });
        void fetchMessages(conversationId, undefined, undefined, {
          force: true,
          syncReason: "room-refresh",
          source: "socket_room_refresh",
          queryType: "room_refresh",
          selectedConversationIdAtDispatch:
            useChatStore.getState().selectedConversationId ?? null,
        });
      }

      if (
        eventType !== "message:new" ||
        ingestResult.status === "ignored" ||
        ingestResult.status === "merged" ||
        (chatState.selectedConversationId !== conversationId &&
          senderId &&
          currentUserId &&
          senderId !== currentUserId)
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

        removeMessage(conversationId, messageId);
        void scheduleConversationSnapshotRefresh(conversationId, {
          reason: "socket:message:deleted",
        });
      },
    });
    unsubscribersRef.current.push(unsubscribeChatEvents);

    const handleRoomJoined = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      const roomId = getConversationId(payload);
      if (!roomId) return;

      subscribedRoomsRef.current.add(roomId);
      roomJoinRetryAttemptsRef.current.delete(roomId);
      clearRoomJoinRetry(roomId);

      logMessageDebug("useWebSocket", "room_joined", {
        roomId,
        connectionState: getSocket()?.getConnectionState() ?? "unknown",
        pendingSyncStrategy: pendingRoomSyncRef.current.get(roomId) ?? null,
      });

      const syncStrategy = pendingRoomSyncRef.current.get(roomId);
      if (!syncStrategy) {
        return;
      }

      clearRoomSyncFallback(roomId);
      const fallbackTimer = setTimeout(() => {
        roomSyncFallbackTimersRef.current.delete(roomId);

        const stillPending = pendingRoomSyncRef.current.get(roomId);
        if (!stillPending) {
          return;
        }

        pendingRoomSyncRef.current.delete(roomId);
        logMessageDebug("useWebSocket", "room_sync_fallback_applied", {
          roomId,
          strategy: stillPending,
        });

        const fallbackReason =
          stillPending === "skip" ? "room-refresh" : stillPending;
        void reconcileConversationAuthoritative(roomId, fallbackReason);
      }, ROOM_SYNC_FALLBACK_TIMEOUT_MS);

      roomSyncFallbackTimersRef.current.set(roomId, fallbackTimer);
    };

    const handleRoomLeft = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      const roomId = getConversationId(payload);
      if (!roomId) return;

      subscribedRoomsRef.current.delete(roomId);
      roomJoinRetryAttemptsRef.current.delete(roomId);
      clearRoomJoinRetry(roomId);
      clearRoomSyncFallback(roomId);

      logMessageDebug("useWebSocket", "room_left_acknowledged", {
        roomId,
      });
    };

    const handleReadReceipt = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const lastMessageId =
        asString(payload.lastMessageId) ??
        asString(payload.messageId) ??
        asString(payload.id) ??
        asString(payload._id);
      if (!conversationId || !lastMessageId) return;
      logMessageDebug("useWebSocket", "socket_message_read_received", {
        conversationId,
        lastMessageId,
      });

      markMessagesReadUpTo(
        conversationId,
        lastMessageId,
        asString(payload.senderId) ?? asString(payload.userId) ?? undefined,
      );
    };

    const handleConversationSummaryUpdated = (data: unknown) => {
      const normalized = normalizeConversation(data);
      if (!normalized) {
        return;
      }

      const summaryResult = upsertConversationSummary(normalized);
      if (!summaryResult.applied) {
        logMessageDebug("useWebSocket", "conversation_summary_ignored", {
          conversationId: normalized.id,
          reason: summaryResult.reason,
          previousVersion: summaryResult.previousVersion,
          nextVersion: summaryResult.nextVersion,
        });
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
        roomId: normalized.id,
      });
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
          roomId: conversationId,
          membershipState,
        });
        return;
      }

      joinedRoomsRef.current.delete(conversationId);
      subscribedRoomsRef.current.delete(conversationId);
      pendingRoomSyncRef.current.delete(conversationId);
      roomJoinRetryAttemptsRef.current.delete(conversationId);
      clearRoomJoinRetry(conversationId);
      clearRoomSyncFallback(conversationId);
      removeConversation(conversationId);
      if (useChatStore.getState().selectedConversationId === conversationId) {
        selectConversation(null);
      }
      notifySidebarState("conversation:membership:updated", {
        source: "socket",
        roomId: conversationId,
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

      joinedRoomsRef.current.delete(conversationId);
      removeConversation(conversationId);
      if (useChatStore.getState().selectedConversationId === conversationId) {
        selectConversation(null);
      }
    };

    const unsubscribeConversationEvents = registerConversationEvents(socket, {
      onRoomJoined: handleRoomJoined,
      onConversationJoined: handleRoomJoined,
      onRoomLeft: handleRoomLeft,
      onConversationLeft: handleRoomLeft,
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
      if (
        conversationId &&
        options?.bumpMembers
      ) {
        bumpMemberListVersion(conversationId);
      }
      if (
        conversationId &&
        !(options?.skipIfCurrentUserIsTarget &&
          shouldSkipGroupRoomRefreshForCurrentUser(payload, currentUserId))
      ) {
        void scheduleRoomResync(conversationId, { reason: "room-refresh" });
      }
    };

    const handleGroupInviteUser = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      notifySidebarState("group:invite:updated", {
        source: "socket",
        roomId,
      });
    };

    const handleGroupInviteLinkCreated = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      const inviteLinkId = asString(payload?.inviteLinkId);
      if (roomId && inviteLinkId) {
        upsertInviteLink(roomId, {
          id: inviteLinkId,
          roomId,
          createdAt:
            typeof payload?.occurredAt === "string"
              ? payload.occurredAt
              : new Date().toISOString(),
        });
      }
      notifySidebarState("group:invite:updated", {
        source: "socket",
        roomId,
      });
    };

    const handleGroupInviteUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      notifySidebarState("group:invite:updated", {
        source: "socket",
        roomId,
      });
    };

    const handleGroupJoinRequestNew = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      const requestId =
        asString(payload?.requestId) ??
        asString(payload?.id) ??
        asString(asRecord(payload?.request)?.id);
      const userId =
        asString(payload?.userId) ??
        asString(payload?.requesterId) ??
        asString(asRecord(payload?.request)?.userId);
      if (roomId && requestId && userId) {
        upsertJoinRequest(roomId, {
          id: requestId,
          roomId,
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
        roomId,
        requestId,
      });
    };

    const handleGroupJoinRequestResolved = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      const requestId =
        asString(payload?.requestId) ??
        asString(payload?.id) ??
        asString(asRecord(payload?.request)?.id);
      const status = asString(payload?.status);
      if (
        roomId &&
        requestId &&
        (status === "approved" || status === "rejected")
      ) {
        markJoinRequestResolved(roomId, requestId, status);
      }
      notifySidebarState("group:join-request:updated", {
        source: "socket",
        roomId,
        requestId,
        status,
      });
    };

    const handleGroupPinUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      if (roomId && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("group:pin:updated", {
            detail: { conversationId: roomId, roomId },
          }),
        );
      }
      refreshGroupRoom(data);
    };

    const handleGroupSlowModeTriggered = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      const retryAfterSeconds =
        typeof payload?.retryAfterSeconds === "number"
          ? payload.retryAfterSeconds
          : 0;
      if (roomId && retryAfterSeconds > 0) {
        setSlowModeCooldown(roomId, retryAfterSeconds);
      }
      if (retryAfterSeconds > 0) {
        notifyRoomInline("chat:restriction:updated", {
          conversationId: roomId,
          type: "slow_mode",
          retryAfterSeconds,
        });
      }
    };

    const handleGroupSettingsUpdated = (data: unknown) => {
      const payload = asRecord(data);
      const roomId = payload ? getConversationId(payload) : null;
      if (roomId) {
        maybeNotifyGroupUpdate(
          roomId,
          "Group settings changed.",
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
          } else {
            const reason =
              asString(payload?.reason) === "BLOCKED"
                ? "Direct messaging is no longer allowed."
                : "Direct messaging permission changed.";
            setSendRestriction(targetConversation.id, {
              kind: "permission",
              reason,
              code: asString(payload?.reason) ?? "PERMISSION_CHANGED",
            });
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

      const conversationId = getConversationId(payload);
      const userId = asString(payload.senderId) ?? asString(payload.userId);
      if (!conversationId || !userId) return;

      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId && userId === currentUserId) return;

      const userName =
        asString(payload.senderName) ??
        asString(payload.userName) ??
        asString(payload.username) ??
        asString(payload.user_name) ??
        "";
      const activity =
        asString(payload.activity) === "recording" ||
        asString(payload.activity) === "uploading" ||
        asString(payload.activity) === "typing"
          ? (asString(payload.activity) as "typing" | "recording" | "uploading")
          : "typing";
      const lastEventAt = Date.now();

      setTyping({
        conversationId,
        userId,
        userName,
        isTyping: true,
        activity,
        confidence: 1,
        lastEventAt,
      });

      scheduleRemoteTypingDecay(conversationId, userId, userName);
    };

    const handleTypingStop = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const userId = asString(payload.senderId) ?? asString(payload.userId);
      if (!conversationId || !userId) return;

      clearRemoteTypingTimer(conversationId, userId);
      setTyping({
        conversationId,
        userId,
        userName:
          asString(payload.senderName) ??
          asString(payload.userName) ??
          asString(payload.username) ??
          "",
        isTyping: false,
        activity: "online",
        confidence: 0,
        lastEventAt: Date.now(),
      });
      clearTyping(conversationId, userId);
    };

    const unsubscribePresenceEvents = registerPresenceEvents(socket, {
      onTypingStart: handleTypingStart,
      onTypingStop: handleTypingStop,
    });
    unsubscribersRef.current.push(unsubscribePresenceEvents);

    const handleConversationResynced = (data: unknown) => {
      const payload = asRecord(data);
      const targetRoomIds = payload !== null ? getConversationIds(payload) : [];
      logMessageDebug("useWebSocket", "conversation_resynced_received", {
        targetRoomIds,
      });
      const drainedRooms = drainPendingRoomSync(
        pendingRoomSyncRef.current,
        joinedRoomsRef.current,
        targetRoomIds,
      );

      drainedRooms.forEach(({ roomId, strategy }) => {
        clearRoomSyncFallback(roomId);
        logMessageDebug("useWebSocket", "conversation_resynced_applied", {
          roomId,
          strategy,
          targetRoomIds,
        });

        void reconcileConversationAuthoritative(roomId, strategy);
      });
    };

    const handleResyncRequired = (data: unknown) => {
      const payload = asRecord(data);
      const scopes = Array.isArray(payload?.scopes)
        ? payload.scopes
            .map((scope) => asString(scope))
            .filter((scope): scope is string => typeof scope === "string")
        : [];

      logMessageDebug("useWebSocket", "resync_required_received", {
        scopes,
        source: asString(payload?.source),
        reason: asString(payload?.reason),
      });

      if (
        scopes.length === 0 ||
        scopes.some((scope) =>
          [
            "rooms",
            "conversations",
            "groups",
            "user_scoped",
            "permissions",
          ].includes(scope),
        )
      ) {
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

      if (
        scopes.length === 0 ||
        scopes.some((scope) =>
          ["rooms", "conversations", "groups"].includes(scope),
        )
      ) {
        const drainedRooms = drainPendingRoomSyncForResyncRequired(
          pendingRoomSyncRef.current,
          joinedRoomsRef.current,
        );

        drainedRooms.forEach(({ roomId, strategy }) => {
          clearRoomSyncFallback(roomId);
          void reconcileConversationAuthoritative(roomId, strategy);
        });
      }

      if (
        scopes.length === 0 ||
        scopes.some((scope) =>
          ["friendships", "permissions", "user_scoped"].includes(scope),
        )
      ) {
        useFriendshipStore.getState().triggerResync("socket_reconnect");
      }

      if (scopes.length === 0 || scopes.includes("user_settings")) {
        void useSettingsStore.getState().syncFromServer();
      }
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
        .applyRemoteUpdate(
          payload as unknown as import("@hacom/chat-shared-types").UserSettingsUpdatedPayload,
        );
    };

    const unsubscribeSyncEvents = registerSyncEvents(socket, {
      onConversationResynced: handleConversationResynced,
      onResyncRequired: handleResyncRequired,
      onUserSettingsUpdated: handleUserSettingsUpdated,
    });
    unsubscribersRef.current.push(unsubscribeSyncEvents);

    logMessageDebug("useWebSocket", "listener_setup_completed", {
      listenerCount: unsubscribersRef.current.length,
      connectionState: socket.getConnectionState(),
    });

    return socket;
  }, [
    clearAllRoomJoinRetries,
    clearAllRoomSyncFallbacks,
    clearRoomJoinRetry,
    clearRoomSyncFallback,
    clearRemoteTypingTimer,
    clearTyping,
    fetchMessages,
    flushEmitQueue,
    markMessagesReadUpTo,
    onConnect,
    onDisconnect,
    onError,
    removeConversation,
    recoverSocketAuth,
    refreshChangedConversationSummaries,
    refreshUnreadSummarySnapshot,
    removeMessage,
    requestRoomJoin,
    flushQueuedMessages,
    refreshConversationSnapshot,
    reconcileConversationAuthoritative,
    maybeNotifyGroupUpdate,
    maybeNotifyIncomingMessage,
    maybeNotifyMembershipEvent,
    maybeReconcileGap,
    ingestConversationMessageEvent,
    scheduleRemoteTypingDecay,
    scheduleRoomResync,
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
  ]);

  const connect = useCallback(() => {
    void (async () => {
      try {
        logMessageDebug("useWebSocket", "connect_requested", {
          connectionState: getSocket()?.getConnectionState() ?? "unknown",
        });
        await ensureFreshAccessToken("ws_connect");
        logMessageDebug("useWebSocket", "connect_token_ready", {
          connectionState: getSocket()?.getConnectionState() ?? "unknown",
        });
        setupSocket();
        connectSocket();
      } catch (error) {
        await handleWsRefreshFailure("ws_connect", error);
      }
    })();
  }, [handleWsRefreshFailure, setupSocket]);

  const disconnect = useCallback(() => {
    logMessageDebug("useWebSocket", "disconnect_requested", {
      joinedRooms: Array.from(joinedRoomsRef.current),
      queuedEmitCount: emitQueueRef.current.length,
    });
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    clearAllRemoteTypingTimers();
    clearAllRoomJoinRetries();
    clearAllRoomSyncFallbacks();
    joinedRoomsRef.current.clear();
    subscribedRoomsRef.current.clear();
    pendingRoomSyncRef.current.clear();
    roomResyncInFlightRef.current.clear();
    emitQueueRef.current = [];
    disconnectSocket();
  }, [
    clearAllRemoteTypingTimers,
    clearAllRoomJoinRetries,
    clearAllRoomSyncFallbacks,
  ]);

  const joinRoom = useCallback(
    (roomId: string, options?: { skipInitialDeltaSync?: boolean }) => {
      if (!roomId) return;
      joinedRoomsRef.current.add(roomId);
      subscribedRoomsRef.current.delete(roomId);
      roomJoinRetryAttemptsRef.current.set(roomId, 0);
      pendingRoomSyncRef.current.set(
        roomId,
        options?.skipInitialDeltaSync ? "skip" : "initial-sync",
      );
      logMessageDebug("useWebSocket", "join_room_state_registered", {
        roomId,
        strategy: options?.skipInitialDeltaSync ? "skip" : "initial-sync",
      });
      requestRoomJoin(roomId, { reason: "initial" });
    },
    [requestRoomJoin],
  );

  const leaveRoom = useCallback(
    (roomId: string) => {
      if (!roomId) return;

      emit(WebSocketEvents.CONVERSATION_LEAVE, {
        roomId,
        conversationId: roomId,
      });
      joinedRoomsRef.current.delete(roomId);
      subscribedRoomsRef.current.delete(roomId);
      pendingRoomSyncRef.current.delete(roomId);
      roomJoinRetryAttemptsRef.current.delete(roomId);
      clearRoomJoinRetry(roomId);
      clearRoomSyncFallback(roomId);

      const typingStatuses = useChatStore
        .getState()
        .typingStatuses.filter((item) => item.conversationId === roomId);
      typingStatuses.forEach((item) => {
        clearRemoteTypingTimer(roomId, item.userId);
        clearTyping(roomId, item.userId);
      });
    },
    [
      clearRemoteTypingTimer,
      clearRoomJoinRetry,
      clearRoomSyncFallback,
      clearTyping,
      emit,
    ],
  );

  const sendMessage = useCallback(
    (roomId: string, content: string, type: string = "text") => {
      emit(WebSocketEvents.MESSAGE_SEND, {
        roomId,
        conversationId: roomId,
        content,
        type,
      });
    },
    [emit],
  );

  const sendTyping = useCallback(
    (roomId: string) => {
      emit(WebSocketEvents.TYPING_START, {
        roomId,
        conversationId: roomId,
        isTyping: true,
      });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        emit(WebSocketEvents.TYPING_STOP, {
          roomId,
          conversationId: roomId,
          isTyping: false,
        });
      }, 3000);
    },
    [emit],
  );

  const stopTyping = useCallback(
    (roomId: string) => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      emit(WebSocketEvents.TYPING_STOP, {
        roomId,
        conversationId: roomId,
        isTyping: false,
      });
    },
    [emit],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      logMessageDebug("useWebSocket", "offline_queue_flush_requested", {
        reason: "browser_online",
        connectionState: getSocket()?.getConnectionState() ?? "unknown",
      });
      void flushQueuedMessages();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [flushQueuedMessages]);

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
      clearAllConversationSnapshotRefreshes();
      disconnect();
    };
  }, [
    autoConnect,
    clearAllConversationSnapshotRefreshes,
    connect,
    disconnect,
    isAuthenticated,
  ]);

  return {
    isConnected: connectionState === "connected",
    connectionState,
    connect,
    disconnect,
    emit,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    stopTyping,
  };
};

export type { ConnectionState };
export default useWebSocket;
