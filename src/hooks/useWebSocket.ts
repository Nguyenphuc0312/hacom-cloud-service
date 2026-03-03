/**
 * @fileoverview useWebSocket hook
 * Manages raw WebSocket connection and real-time chat events.
 */

import { useEffect, useCallback, useRef, useState } from "react";
import {
  initSocket,
  connectSocket,
  disconnectSocket,
  getSocket,
  WebSocketEvents,
  type ConnectionState,
} from "../lib/socket";
import { conversationApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { useAuthStore, useChatStore } from "../stores";
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

  useEffect(() => {
    const socket = initSocket();
    const unsub = socket.onStateChange((state) => {
      setConnectionState(state);
    });
    return () => {
      unsub();
    };
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
      emit(WebSocketEvents.ROOM_JOIN, {
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
      const reason =
        asString(asRecord(data)?.reason) ??
        asString(asRecord(data)?.code) ??
        "disconnected";
      if (hasConnectedOnceRef.current) {
        shouldResyncOnConnectRef.current = true;
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
      const localId =
        asString(messagePayload.localId) ??
        asString(payload.localId) ??
        asString(payload.clientMessageId) ??
        asString(messagePayload.clientMessageId) ??
        tempId ??
        undefined;
      addMessage(conversationId, {
        ...(messagePayload as unknown as Parameters<typeof addMessage>[1]),
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
        toast.info("New friend request");
      },
    );
    unsubscribersRef.current.push(unsubFriendRequestNew);

    const unsubFriendRequestUpdated = socket.on(
      WebSocketEvents.FRIEND_REQUEST_UPDATED,
      () => {
        toast.info("Friend request updated");
      },
    );
    unsubscribersRef.current.push(unsubFriendRequestUpdated);

    const unsubFriendStatusChanged = socket.on(
      WebSocketEvents.FRIEND_STATUS_CHANGED,
      (data) => {
        const payload = asRecord(data);
        const status = asString(payload?.status);
        if (status === "blocked" || status === "canceled") {
          toast.info("Friendship status changed");
        }
      },
    );
    unsubscribersRef.current.push(unsubFriendStatusChanged);

    const unsubGroupInviteNew = socket.on(
      WebSocketEvents.GROUP_INVITE_NEW,
      () => {
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
      () => {
        toast.info("New group join request");
      },
    );
    unsubscribersRef.current.push(unsubGroupJoinRequestNew);

    const unsubGroupJoinRequestResolved = socket.on(
      WebSocketEvents.GROUP_JOIN_REQUEST_RESOLVED,
      () => {
        toast.info("Group join request updated");
      },
    );
    unsubscribersRef.current.push(unsubGroupJoinRequestResolved);

    const unsubGroupPinUpdated = socket.on(
      WebSocketEvents.GROUP_PIN_UPDATED,
      (data) => {
        refreshGroupRoom(data);
      },
    );
    unsubscribersRef.current.push(unsubGroupPinUpdated);

    const unsubGroupSlowModeTriggered = socket.on(
      WebSocketEvents.GROUP_SLOW_MODE_TRIGGERED,
      (data) => {
        const payload = asRecord(data);
        const retryAfterSeconds =
          typeof payload?.retryAfterSeconds === "number"
            ? payload.retryAfterSeconds
            : 0;
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

      setTyping({
        conversationId,
        userId,
        userName,
        isTyping: true,
      });

      clearRemoteTypingTimer(conversationId, userId);
      const key = `${conversationId}:${userId}`;
      const timer = setTimeout(() => {
        clearTyping(conversationId, userId);
        remoteTypingTimersRef.current.delete(key);
      }, 4000);
      remoteTypingTimersRef.current.set(key, timer);
    };

    const handleTypingStop = (data: unknown) => {
      const payload = asRecord(data);
      if (!payload) return;

      const conversationId = getConversationId(payload);
      const userId = asString(payload.senderId) ?? asString(payload.userId);
      if (!conversationId || !userId) return;

      clearRemoteTypingTimer(conversationId, userId);
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
    resyncRoom,
    removeMessage,
    selectConversation,
    setTyping,
    updateConversation,
    updateMessage,
  ]);

  const connect = useCallback(() => {
    setupSocket();
    connectSocket();
  }, [setupSocket]);

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

      emit(WebSocketEvents.ROOM_LEAVE, {
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
