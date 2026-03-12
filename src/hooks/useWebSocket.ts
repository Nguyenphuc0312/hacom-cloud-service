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
import { conversationApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { useAuthStore, useChatStore, useGroupStore } from "../stores";
import { getAccessToken } from "../services/tokenService";
import {
  ensureFreshAccessToken,
  refreshAccessTokenShared,
  subscribeToAuthRefreshEvents,
} from "../services/authRefreshCoordinator";
import { isTokenExpiringSoon } from "../utils/jwtHelpers";
import { toast } from "../utils/toast";

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
  joinRoom: (roomId: string) => void;
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

type MessageCursor = {
  at: string;
  id: string;
};

const REMOTE_TYPING_DECAY_INTERVAL_MS = 320;
const REMOTE_TYPING_HALF_LIFE_MS = 1400;
const REMOTE_TYPING_VISIBLE_THRESHOLD = 0.12;

const computeTypingConfidence = (lastEventAt: number, now: number): number =>
  Math.exp(-(now - lastEventAt) / REMOTE_TYPING_HALF_LIFE_MS);

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const clearTyping = useChatStore((s) => s.clearTyping);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const markMessagesReadUpTo = useChatStore((s) => s.markMessagesReadUpTo);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const setSlowModeCooldown = useGroupStore((s) => s.setSlowModeCooldown);
  const upsertInviteLink = useGroupStore((s) => s.upsertInviteLink);
  const upsertJoinRequest = useGroupStore((s) => s.upsertJoinRequest);
  const markJoinRequestResolved = useGroupStore((s) => s.markJoinRequestResolved);

  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    initSocket().getConnectionState(),
  );

  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitQueueRef = useRef<Array<{ event: string; data: unknown }>>([]);
  const hasConnectedOnceRef = useRef(false);
  const shouldResyncOnConnectRef = useRef(false);
  const remoteTypingTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const wsRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const wsReauthFailureHandledRef = useRef(false);

  useEffect(() => {
    const socket = initSocket();
    const unsub = socket.onStateChange((state) => {
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
        toast.error("Session expired. Please login again.");
        await useAuthStore.getState().handleAuthFailure("refresh_failed");
      }

      const message = error instanceof Error ? error.message : "refresh_failed";
      onError?.(new Error(`WebSocket auth recovery failed (${reason}): ${message}`));
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

    while (emitQueueRef.current.length > 0) {
      const queued = emitQueueRef.current.shift();
      if (!queued) continue;
      const sent = socket.send(queued.event, queued.data);
      if (!sent) {
        emitQueueRef.current.unshift(queued);
        break;
      }
    }
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    const socket = getSocket();
    if (!socket?.isConnected()) {
      emitQueueRef.current.push({ event, data });
      return;
    }
    socket.send(event, data);
  }, []);

  const emitJoinRoom = useCallback(
    (roomId: string) => {
      emit(WebSocketEvents.CONVERSATION_JOIN, {
        roomId,
        conversationId: roomId,
      });
    },
    [emit],
  );

  const resyncRoom = useCallback(
    async (roomId: string) => {
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

      // Fetch missed messages in pages to avoid dropping backlog on long disconnects.
      for (let attempts = 0; attempts < 10; attempts += 1) {
        const result = await fetchMessages(roomId, undefined, afterCursor.at, {
          afterId: afterCursor.id,
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

  const setupSocket = useCallback(() => {
    const socket = initSocket();

    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    const unsubConnect = socket.on("connect", () => {
      onConnect?.();

      const shouldResync = shouldResyncOnConnectRef.current;
      shouldResyncOnConnectRef.current = false;

      joinedRoomsRef.current.forEach((roomId) => {
        emitJoinRoom(roomId);
        if (shouldResync) {
          void resyncRoom(roomId);
        }
      });

      hasConnectedOnceRef.current = true;

      flushEmitQueue();
    });
    unsubscribersRef.current.push(unsubConnect);

    const unsubDisconnect = socket.on("disconnect", (data) => {
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
      if (code === 4401) {
        void recoverSocketAuth("ws_close_4401", "close_4401");
      }
      onDisconnect?.(reason);
    });
    unsubscribersRef.current.push(unsubDisconnect);

    const unsubConnectError = socket.on("connect_error", (data) => {
      const message =
        asString(asRecord(data)?.message) ?? "WebSocket connection error";
      onError?.(new Error(message));
    });
    unsubscribersRef.current.push(unsubConnectError);

    const unsubWsError = socket.on(WebSocketEvents.ERROR, (data) => {
      const message =
        asString(asRecord(data)?.message) ?? "WebSocket server error";
      onError?.(new Error(message));
    });
    unsubscribersRef.current.push(unsubWsError);

    const unsubAuthUnauthorized = socket.on(
      WebSocketEvents.AUTH_UNAUTHORIZED,
      (data) => {
        const payload = asRecord(data);
        const message =
          asString(payload?.message) ?? "WebSocket unauthorized";
        const code = asString(payload?.code) ?? "AUTH_UNAUTHORIZED";
        void recoverSocketAuth("ws_unauthorized", code);
        onError?.(new Error(message));
      },
    );
    unsubscribersRef.current.push(unsubAuthUnauthorized);

    const unsubReauthRequired = socket.on(
      WebSocketEvents.AUTH_REAUTH_REQUIRED,
      (data) => {
        const reason =
          asString(asRecord(data)?.reason) ?? "reauthentication required";
        void recoverSocketAuth(
          "ws_reauth_required",
          reason,
          reason === "authenticate_required" ? "reauth" : "reconnect",
        );
      },
    );
    unsubscribersRef.current.push(unsubReauthRequired);

    const upsertIncomingMessage = (data: unknown) => {
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
        asString(payload.clientMessageId) ??
        asString(messagePayload.clientMessageId) ??
        tempId ??
        undefined;
      const stableId =
        asString(messagePayload.stableId) ??
        clientMessageId ??
        localId ??
        messageId;
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
      }
    };

    const unsubMessageNew = socket.on(WebSocketEvents.MESSAGE_NEW, (data) => {
      upsertIncomingMessage(data);
    });
    unsubscribersRef.current.push(unsubMessageNew);

    const unsubMessageUpdated = socket.on(
      WebSocketEvents.MESSAGE_UPDATED,
      (data) => {
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

        updateMessage(
          conversationId,
          messageId,
          messagePayload as unknown as Parameters<typeof updateMessage>[2],
        );
      },
    );
    unsubscribersRef.current.push(unsubMessageUpdated);

    const unsubMessageDeleted = socket.on(
      WebSocketEvents.MESSAGE_DELETED,
      (data) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        const messageId =
          asString(payload.messageId) ??
          asString(payload.id) ??
          asString(payload._id) ??
          asString(asRecord(payload.message)?.id);
        if (!conversationId || !messageId) return;

        removeMessage(conversationId, messageId);
      },
    );
    unsubscribersRef.current.push(unsubMessageDeleted);

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

      markMessagesReadUpTo(
        conversationId,
        lastMessageId,
        asString(payload.senderId) ?? asString(payload.userId) ?? undefined,
      );
    };

    const unsubRead = socket.on(
      WebSocketEvents.MESSAGE_READ,
      handleReadReceipt,
    );
    unsubscribersRef.current.push(unsubRead);

    const unsubMemberUpdated = socket.on(
      WebSocketEvents.MEMBER_UPDATED,
      (data) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        if (!conversationId) return;

        void conversationApi
          .getConversationById(conversationId)
          .then((response) => {
            updateConversation(conversationId, unwrapApiSuccess(response));
          })
          .catch(() => {
            // no-op: best effort refresh member/role changes
          });
      },
    );
    unsubscribersRef.current.push(unsubMemberUpdated);

    const unsubConversationDeleted = socket.on(
      WebSocketEvents.CONVERSATION_DELETED,
      (data) => {
        const payload = asRecord(data);
        if (!payload) return;

        const conversationId = getConversationId(payload);
        if (!conversationId) return;

        const currentUserId = useAuthStore.getState().user?.id ?? null;
        const deletedBy =
          asString(payload.deletedBy) ?? asString(payload.userId);
        if (deletedBy && currentUserId && deletedBy !== currentUserId) {
          return;
        }

        joinedRoomsRef.current.delete(conversationId);
        removeConversation(conversationId);
        if (useChatStore.getState().selectedConversationId === conversationId) {
          selectConversation(null);
        }
      },
    );
    unsubscribersRef.current.push(unsubConversationDeleted);

    const unsubFriendRequestNew = socket.on(
      WebSocketEvents.FRIEND_REQUEST_NEW,
      () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("friend:updated"));
        }
        toast.info("New friend request");
      },
    );
    unsubscribersRef.current.push(unsubFriendRequestNew);

    const unsubFriendRequestUpdated = socket.on(
      WebSocketEvents.FRIEND_REQUEST_UPDATED,
      () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("friend:updated"));
        }
        toast.info("Friend request updated");
      },
    );
    unsubscribersRef.current.push(unsubFriendRequestUpdated);

    const unsubFriendStatusChanged = socket.on(
      WebSocketEvents.FRIEND_STATUS_CHANGED,
      (data) => {
        const payload = asRecord(data);
        const status = asString(payload?.status);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("friend:updated"));
        }
        if (status === "blocked" || status === "canceled") {
          toast.info("Friendship status changed");
        }
      },
    );
    unsubscribersRef.current.push(unsubFriendStatusChanged);

    const unsubGroupInviteNew = socket.on(
      WebSocketEvents.GROUP_INVITE_NEW,
      (data) => {
        const payload = asRecord(data);
        const roomId = payload ? getConversationId(payload) : null;
        const candidate =
          asRecord(payload?.inviteLink) ?? asRecord(payload?.link) ?? payload;
        if (roomId && candidate && typeof candidate.id === "string") {
          upsertInviteLink(roomId, {
            id: candidate.id,
            roomId,
            name:
              typeof candidate.name === "string" ? candidate.name : undefined,
            inviteUrl:
              typeof candidate.inviteUrl === "string"
                ? candidate.inviteUrl
                : undefined,
            token:
              typeof candidate.token === "string" ? candidate.token : undefined,
            tokenPreview:
              typeof candidate.tokenPreview === "string"
                ? candidate.tokenPreview
                : undefined,
            usageCount:
              typeof candidate.usageCount === "number"
                ? candidate.usageCount
                : 0,
            usageLimit:
              typeof candidate.usageLimit === "number"
                ? candidate.usageLimit
                : null,
            expireAt:
              typeof candidate.expireAt === "string" ? candidate.expireAt : null,
            revokedAt:
              typeof candidate.revokedAt === "string"
                ? candidate.revokedAt
                : null,
            createdAt:
              typeof candidate.createdAt === "string"
                ? candidate.createdAt
                : new Date().toISOString(),
          });
        }
        toast.info("You received a group invite");
      },
    );
    unsubscribersRef.current.push(unsubGroupInviteNew);

    const unsubGroupInviteUpdated = socket.on(
      WebSocketEvents.GROUP_INVITE_UPDATED,
      () => {
        toast.info("Group invite updated");
      },
    );
    unsubscribersRef.current.push(unsubGroupInviteUpdated);

    const refreshGroupRoom = (data: unknown) => {
      const payload = asRecord(data);
      const conversationId = payload ? getConversationId(payload) : null;
      if (conversationId) {
        void resyncRoom(conversationId);
      }
    };

    const unsubGroupMemberJoined = socket.on(
      WebSocketEvents.GROUP_MEMBER_JOINED,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupMemberJoined);

    const unsubGroupMemberLeft = socket.on(
      WebSocketEvents.GROUP_MEMBER_LEFT,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupMemberLeft);

    const unsubGroupMemberUpdated = socket.on(
      WebSocketEvents.GROUP_MEMBER_UPDATED,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupMemberUpdated);

    const unsubGroupMemberBanned = socket.on(
      WebSocketEvents.GROUP_MEMBER_BANNED,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupMemberBanned);

    const unsubGroupSettingsUpdated = socket.on(
      WebSocketEvents.GROUP_SETTINGS_UPDATED,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupSettingsUpdated);

    const unsubGroupJoinRequestNew = socket.on(
      WebSocketEvents.GROUP_JOIN_REQUEST_NEW,
      (data) => {
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
        toast.info("New group join request");
      },
    );
    unsubscribersRef.current.push(unsubGroupJoinRequestNew);

    const unsubGroupJoinRequestResolved = socket.on(
      WebSocketEvents.GROUP_JOIN_REQUEST_RESOLVED,
      (data) => {
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
        toast.info("Group join request updated");
      },
    );
    unsubscribersRef.current.push(unsubGroupJoinRequestResolved);

    const unsubGroupPinUpdated = socket.on(
      WebSocketEvents.GROUP_PIN_UPDATED,
      (data) => {
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
      },
    );
    unsubscribersRef.current.push(unsubGroupPinUpdated);

    const unsubGroupSlowModeTriggered = socket.on(
      WebSocketEvents.GROUP_SLOW_MODE_TRIGGERED,
      (data) => {
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
          toast.warning(`Slow mode is active. Retry in ${retryAfterSeconds}s`);
        }
      },
    );
    unsubscribersRef.current.push(unsubGroupSlowModeTriggered);

    const unsubPermissionChanged = socket.on(
      WebSocketEvents.PERMISSION_CHANGED,
      (data) => {
        const payload = asRecord(data);
        const allowed = typeof payload?.allowed === "boolean" ? payload.allowed : true;
        if (!allowed) {
          toast.warning("Direct messaging permission changed");
        }
      },
    );
    unsubscribersRef.current.push(unsubPermissionChanged);

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

    const unsubTypingStart = socket.on(
      WebSocketEvents.TYPING_START,
      handleTypingStart,
    );
    unsubscribersRef.current.push(unsubTypingStart);

    const unsubTypingStop = socket.on(
      WebSocketEvents.TYPING_STOP,
      handleTypingStop,
    );
    unsubscribersRef.current.push(unsubTypingStop);

    const unsubSyncComplete = socket.on(WebSocketEvents.SYNC_COMPLETE, () => {
      joinedRoomsRef.current.forEach((roomId) => {
        void resyncRoom(roomId);
      });
    });
    unsubscribersRef.current.push(unsubSyncComplete);

    // Settings update from another device / admin
    const unsubSettingsUpdated = socket.on(
      WebSocketEvents.USER_SETTINGS_UPDATED,
      (data) => {
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
      },
    );
    unsubscribersRef.current.push(unsubSettingsUpdated);

    return socket;
  }, [
    addMessage,
    clearRemoteTypingTimer,
    clearTyping,
    emitJoinRoom,
    flushEmitQueue,
    markMessagesReadUpTo,
    onConnect,
    onDisconnect,
    onError,
    removeConversation,
    recoverSocketAuth,
    resyncRoom,
    removeMessage,
    scheduleRemoteTypingDecay,
    selectConversation,
    setTyping,
    setSlowModeCooldown,
    upsertJoinRequest,
    markJoinRequestResolved,
    upsertInviteLink,
    updateConversation,
    updateMessage,
  ]);

  const connect = useCallback(() => {
    void (async () => {
      try {
        await ensureFreshAccessToken("ws_connect");
        setupSocket();
        connectSocket();
      } catch (error) {
        await handleWsRefreshFailure("ws_connect", error);
      }
    })();
  }, [handleWsRefreshFailure, setupSocket]);

  const disconnect = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    clearAllRemoteTypingTimers();
    joinedRoomsRef.current.clear();
    emitQueueRef.current = [];
    disconnectSocket();
  }, [clearAllRemoteTypingTimers]);

  const joinRoom = useCallback(
    (roomId: string) => {
      if (!roomId) return;
      joinedRoomsRef.current.add(roomId);
      emitJoinRoom(roomId);
    },
    [emitJoinRoom],
  );

  const leaveRoom = useCallback(
    (roomId: string) => {
      if (!roomId) return;

      emit(WebSocketEvents.CONVERSATION_LEAVE, {
        roomId,
        conversationId: roomId,
      });
      joinedRoomsRef.current.delete(roomId);

      const typingStatuses = useChatStore
        .getState()
        .typingStatuses.filter((item) => item.conversationId === roomId);
      typingStatuses.forEach((item) => {
        clearRemoteTypingTimer(roomId, item.userId);
        clearTyping(roomId, item.userId);
      });
    },
    [clearRemoteTypingTimer, clearTyping, emit],
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
