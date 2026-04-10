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
import { logMessageDebug } from "../utils/messageDebug";
import { buildMessageCorrelationKey } from "../utils/messageIdentity";
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

type MessageCursor = {
  at: string;
  id: string;
};

const REMOTE_TYPING_DECAY_INTERVAL_MS = 320;
const REMOTE_TYPING_HALF_LIFE_MS = 1400;
const REMOTE_TYPING_VISIBLE_THRESHOLD = 0.12;
const ROOM_JOIN_ACK_TIMEOUT_MS = 2_000;
const ROOM_JOIN_RETRY_DELAY_MAX_MS = 8_000;

const computeTypingConfidence = (lastEventAt: number, now: number): number =>
  Math.exp(-(now - lastEventAt) / REMOTE_TYPING_HALF_LIFE_MS);

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const addMessage = useChatStore((s) => s.addMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
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

  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    initSocket().getConnectionState(),
  );

  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const subscribedRoomsRef = useRef<Set<string>>(new Set());
  const pendingRoomSyncRef = useRef<
    Map<string, "skip" | "initial-sync" | "reconnect">
  >(new Map());
  const roomJoinRetryTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const roomJoinRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitQueueRef = useRef<Array<{ event: string; data: unknown }>>([]);
  const hasConnectedOnceRef = useRef(false);
  const shouldResyncOnConnectRef = useRef(false);
  const roomResyncInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const conversationRefreshInFlightRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );
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
        chatState.messagesHydratedByConversation[roomId] &&
        chatState.hasNewerMessagesByConversation[roomId] === false
      ) {
        logMessageDebug("useWebSocket", "delta_sync_blocked_known_latest", {
          roomId,
          reason: options?.reason,
          hydrated: chatState.messagesHydratedByConversation[roomId],
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
        chatState.messagesHydratedByConversation[roomId] &&
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
          updateConversation(conversationId, unwrapApiSuccess(response));
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
    [fetchConversations, updateConversation],
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
        void fetchConversations().catch(() => {
          // no-op: best effort sidebar resync
        });
        useFriendshipStore.getState().triggerResync("socket_reconnect");
      }

      joinedRoomsRef.current.forEach((roomId) => {
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
          asString(messagePayload.messageId))
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
      const correlationKey = buildMessageCorrelationKey({
        conversationId,
        clientMessageId,
        tempId: tempId ?? undefined,
        localId,
      });
      logMessageDebug("useWebSocket", `socket_${eventType}_received`, {
        conversationId,
        eventId: asString(payload.eventId) ?? asString(messagePayload.eventId),
        correlationKey,
        messageId,
        tempId,
        localId,
        clientMessageId,
        stableId,
      });
      addMessage(conversationId, {
        ...(messagePayload as unknown as Parameters<typeof addMessage>[1]),
        ...(stableId ? { stableId } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(localId ? { localId } : {}),
      });

      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?.id;
      const senderId =
        asString(messagePayload.senderId) ?? asString(payload.senderId);

      if (
        chatState.selectedConversationId === conversationId &&
        senderId &&
        currentUserId &&
        senderId !== currentUserId
      ) {
        void chatState.markAsRead(conversationId).catch(() => {
          // no-op: best effort read receipt
        });
      } else if (
        eventType !== "message:new" ||
        (chatState.selectedConversationId !== conversationId &&
          senderId &&
          currentUserId &&
          senderId !== currentUserId)
      ) {
        void refreshConversationSnapshot(conversationId);
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
          asString(asRecord(payload.message)?.id);
        if (!conversationId || !messageId) return;
        logMessageDebug("useWebSocket", "socket_message_deleted_received", {
          conversationId,
          messageId,
        });

        removeMessage(conversationId, messageId);
        void refreshConversationSnapshot(conversationId);
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
    };

    const handleRoomLeft = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;
      const roomId = getConversationId(payload);
      if (!roomId) return;

      subscribedRoomsRef.current.delete(roomId);
      roomJoinRetryAttemptsRef.current.delete(roomId);
      clearRoomJoinRetry(roomId);

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
      void refreshConversationSnapshot(conversationId);
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

      const currentUserId = useAuthStore.getState().user?.id ?? null;
      const deletedBy = asString(payload.deletedBy) ?? asString(payload.userId);
      if (deletedBy && currentUserId && deletedBy !== currentUserId) {
        return;
      }

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

    const refreshGroupRoom = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      if (conversationId) {
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
      onGroupMemberJoined: refreshGroupRoom,
      onGroupMemberLeft: refreshGroupRoom,
      onGroupMemberUpdated: refreshGroupRoom,
      onGroupMemberBanned: refreshGroupRoom,
      onGroupSettingsUpdated: refreshGroupRoom,
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
      const roomIdsToResync =
        targetRoomIds.length > 0
          ? targetRoomIds.filter((roomId) => joinedRoomsRef.current.has(roomId))
          : Array.from(pendingRoomSyncRef.current.keys());

      roomIdsToResync.forEach((roomId) => {
        const syncStrategy =
          pendingRoomSyncRef.current.get(roomId) ?? "initial-sync";
        pendingRoomSyncRef.current.delete(roomId);
        logMessageDebug("useWebSocket", "conversation_resynced_applied", {
          roomId,
          strategy: syncStrategy,
          targetRoomIds,
        });
        if (syncStrategy === "skip") {
          return;
        }
        void scheduleRoomResync(roomId, { reason: syncStrategy });
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
        void fetchConversations().catch(() => {
          // no-op: best effort sidebar refresh
        });
      }

      if (
        scopes.length === 0 ||
        scopes.some((scope) =>
          ["rooms", "conversations", "groups"].includes(scope),
        )
      ) {
        joinedRoomsRef.current.forEach((roomId) => {
          void scheduleRoomResync(roomId, { reason: "reconnect" });
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

      if (
        scopes.length === 0 ||
        scopes.includes("user_settings")
      ) {
        void import("../settings/settingsStore").then(({ useSettingsStore }) =>
          useSettingsStore.getState().syncFromServer(),
        );
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

      // Import dynamically to avoid circular deps at module init time
      import("../settings/settingsStore").then(({ useSettingsStore }) => {
        useSettingsStore
          .getState()
          .applyRemoteUpdate(
            payload as unknown as import("@hacom/chat-shared-types").UserSettingsUpdatedPayload,
          );
      });
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
    addMessage,
    clearAllRoomJoinRetries,
    clearRoomJoinRetry,
    clearRemoteTypingTimer,
    clearTyping,
    flushEmitQueue,
    markMessagesReadUpTo,
    onConnect,
    onDisconnect,
    onError,
    removeConversation,
    recoverSocketAuth,
    fetchConversations,
    removeMessage,
    requestRoomJoin,
    flushQueuedMessages,
    refreshConversationSnapshot,
    scheduleRemoteTypingDecay,
    scheduleRoomResync,
    selectConversation,
    setSendRestriction,
    clearSendRestriction,
    setTyping,
    setSlowModeCooldown,
    upsertJoinRequest,
    markJoinRequestResolved,
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
    joinedRoomsRef.current.clear();
    subscribedRoomsRef.current.clear();
    pendingRoomSyncRef.current.clear();
    roomResyncInFlightRef.current.clear();
    emitQueueRef.current = [];
    disconnectSocket();
  }, [clearAllRemoteTypingTimers, clearAllRoomJoinRetries]);

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

      const typingStatuses = useChatStore
        .getState()
        .typingStatuses.filter((item) => item.conversationId === roomId);
      typingStatuses.forEach((item) => {
        clearRemoteTypingTimer(roomId, item.userId);
        clearTyping(roomId, item.userId);
      });
    },
    [clearRemoteTypingTimer, clearRoomJoinRetry, clearTyping, emit],
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
      disconnect();
    };
  }, [autoConnect, connect, disconnect, isAuthenticated]);

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
