/**
 * @fileoverview useWebSocket hook
 * Custom hook quản lý WebSocket connection và events
 *
 * FIX #2: Updated to work with raw WebSocket instead of Socket.IO
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
import { useAuthStore, useChatStore } from "../stores";
import { toast } from "../components/ui";
import type { Message, Conversation } from "../types";

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
  const updateConversation = useChatStore((s) => s.updateConversation);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  // Initialize và setup event listeners
  const setupSocket = useCallback(() => {
    const socket = initSocket();

    // Cleanup previous listeners
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    // Subscribe to state changes
    const unsubState = socket.onStateChange((state) => {
      setConnectionState(state);
    });
    unsubscribersRef.current.push(unsubState);

    // Connection events
    const unsubConnect = socket.on("connect", () => {
      console.log("WebSocket connected");
      onConnect?.();

      // Rejoin rooms after reconnect
      joinedRoomsRef.current.forEach((roomId) => {
        socket.send(WebSocketEvents.ROOM_JOIN, { roomId });
      });
    });
    unsubscribersRef.current.push(unsubConnect);

    const unsubDisconnect = socket.on(
      "disconnect",
      (data: { code?: number; reason?: string }) => {
        console.log("WebSocket disconnected:", data);
        onDisconnect?.(data.reason || "Unknown");
      },
    );
    unsubscribersRef.current.push(unsubDisconnect);

    const unsubError = socket.on("connect_error", (data: { error?: Error }) => {
      console.error("WebSocket connection error:", data);
      onError?.(data.error || new Error("Connection error"));
    });
    unsubscribersRef.current.push(unsubError);

    const unsubReconnectFailed = socket.on("reconnect_failed", () => {
      toast.error("Không thể kết nối lại. Vui lòng tải lại trang.");
    });
    unsubscribersRef.current.push(unsubReconnectFailed);

    // Message events
    const unsubNewMsg = socket.on(
      WebSocketEvents.MESSAGE_NEW,
      (data: { roomId: string; message: Message } | Message) => {
        // Handle both formats
        if ("roomId" in data && "message" in data) {
          addMessage(data.roomId, data.message);
        } else {
          // Message contains roomId directly
          const msg = data as Message;
          if (msg.roomId) {
            addMessage(msg.roomId, msg);
          }
        }
      },
    );
    unsubscribersRef.current.push(unsubNewMsg);

    // Typing events
    const unsubTyping = socket.on(
      WebSocketEvents.TYPING,
      (data: {
        roomId: string;
        userId: string;
        username: string;
        isTyping: boolean;
      }) => {
        if (data.isTyping) {
          setTyping({
            conversationId: data.roomId,
            userId: data.userId,
            userName: data.username,
            isTyping: true,
          });

          // Auto clear after 3 seconds
          setTimeout(() => {
            clearTyping(data.roomId, data.userId);
          }, 3000);
        } else {
          clearTyping(data.roomId, data.userId);
        }
      },
    );
    unsubscribersRef.current.push(unsubTyping);

    // Room events
    const unsubRoomJoined = socket.on(
      WebSocketEvents.ROOM_JOINED,
      (data: { roomId: string }) => {
        console.log("Joined room:", data.roomId);
      },
    );
    unsubscribersRef.current.push(unsubRoomJoined);

    // Presence events
    const unsubOnline = socket.on(
      WebSocketEvents.USER_ONLINE,
      (data: { userId: string }) => {
        console.log("User online:", data.userId);
      },
    );
    unsubscribersRef.current.push(unsubOnline);

    const unsubOffline = socket.on(
      WebSocketEvents.USER_OFFLINE,
      (data: { userId: string }) => {
        console.log("User offline:", data.userId);
      },
    );
    unsubscribersRef.current.push(unsubOffline);

    // Error handling
    const unsubErr = socket.on(
      WebSocketEvents.ERROR,
      (data: { code: string; message: string }) => {
        console.error("WebSocket error:", data.code, data.message);
        toast.error(data.message);
      },
    );
    unsubscribersRef.current.push(unsubErr);

    return socket;
  }, [
    addMessage,
    updateMessage,
    removeMessage,
    setTyping,
    clearTyping,
    updateConversation,
    onConnect,
    onDisconnect,
    onError,
  ]);

  // Connect
  const connect = useCallback(() => {
    setupSocket();
    connectSocket();
  }, [setupSocket]);

  // Disconnect
  const disconnect = useCallback(() => {
    disconnectSocket();
    joinedRoomsRef.current.clear();
  }, []);

  // Emit event
  const emit = useCallback((event: string, data: unknown) => {
    const socket = getSocket();
    if (socket?.isConnected()) {
      socket.send(event, data);
    } else {
      console.warn("Socket not connected, cannot emit:", event);
    }
  }, []);

  // Join room
  const joinRoom = useCallback(
    (roomId: string) => {
      if (!joinedRoomsRef.current.has(roomId)) {
        emit(WebSocketEvents.ROOM_JOIN, { roomId });
        joinedRoomsRef.current.add(roomId);
      }
    },
    [emit],
  );

  // Leave room
  const leaveRoom = useCallback(
    (roomId: string) => {
      emit(WebSocketEvents.ROOM_LEAVE, { roomId });
      joinedRoomsRef.current.delete(roomId);
    },
    [emit],
  );

  // Send message
  const sendMessage = useCallback(
    (roomId: string, content: string, type: string = "text") => {
      emit(WebSocketEvents.MESSAGE_SEND, {
        roomId,
        content,
        messageType: type,
      });
    },
    [emit],
  );

  // Send typing indicator
  const sendTyping = useCallback(
    (roomId: string) => {
      emit(WebSocketEvents.TYPING_START, { roomId });

      // Auto stop typing after 3 seconds
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        emit(WebSocketEvents.TYPING_STOP, { roomId });
      }, 3000);
    },
    [emit],
  );

  // Stop typing indicator
  const stopTyping = useCallback(
    (roomId: string) => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      emit(WebSocketEvents.TYPING_STOP, { roomId });
    },
    [emit],
  );

  // Auto connect when authenticated
  useEffect(() => {
    if (autoConnect && isAuthenticated) {
      connect();
    }

    return () => {
      disconnect();
      // Cleanup all event listeners
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
    };
  }, [autoConnect, isAuthenticated, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

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
