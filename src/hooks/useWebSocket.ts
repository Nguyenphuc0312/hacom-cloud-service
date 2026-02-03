/**
 * @fileoverview useWebSocket hook
 * Custom hook quản lý WebSocket connection và events
 */

import { useEffect, useCallback, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import {
  initSocket,
  connectSocket,
  disconnectSocket,
  getSocket,
} from "../lib/socket";
import { useAuthStore, useChatStore } from "../stores";
import { toast } from "../components/ui";
import type { Message, Conversation } from "../types";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: unknown) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendTyping: (roomId: string) => void;
  stopTyping: (roomId: string) => void;
}

export const useWebSocket = (
  options: UseWebSocketOptions = {},
): UseWebSocketReturn => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;

  const { isAuthenticated } = useAuthStore();
  const {
    addMessage,
    updateMessage,
    removeMessage,
    setTyping,
    clearTyping,
    updateConversation,
  } = useChatStore();

  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize và setup event listeners
  const setupSocket = useCallback(() => {
    const socket = initSocket();
    socketRef.current = socket;

    // Connection events
    socket.on("connect", () => {
      setConnectionState("connected");
      console.log("WebSocket connected");
      onConnect?.();

      // Rejoin rooms after reconnect
      joinedRoomsRef.current.forEach((roomId) => {
        socket.emit("room:join", { roomId });
      });
    });

    socket.on("disconnect", (reason) => {
      setConnectionState("disconnected");
      console.log("WebSocket disconnected:", reason);
      onDisconnect?.(reason);

      if (reason === "io server disconnect") {
        // Server disconnected, need to reconnect manually
        socket.connect();
      }
    });

    socket.on("connect_error", (error) => {
      setConnectionState("error");
      console.error("WebSocket connection error:", error);
      onError?.(error);
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log("WebSocket reconnected after", attemptNumber, "attempts");
      toast.success("Đã kết nối lại");
    });

    socket.on("reconnect_attempt", (attemptNumber) => {
      setConnectionState("reconnecting");
      console.log("WebSocket reconnecting... attempt", attemptNumber);
    });

    socket.on("reconnect_failed", () => {
      setConnectionState("error");
      toast.error("Không thể kết nối lại. Vui lòng tải lại trang.");
    });

    // Authentication events
    socket.on("authenticated", ({ userId }) => {
      console.log("WebSocket authenticated for user:", userId);
    });

    socket.on("authentication_error", ({ message }) => {
      console.error("WebSocket authentication failed:", message);
      toast.error("Xác thực thất bại. Vui lòng đăng nhập lại.");
    });

    // Message events
    socket.on("message:new", ({ roomId, message }) => {
      addMessage(roomId, message as Message);
    });

    socket.on("message:updated", ({ roomId, messageId, updates }) => {
      updateMessage(roomId, messageId, updates as Partial<Message>);
    });

    socket.on("message:deleted", ({ roomId, messageId }) => {
      removeMessage(roomId, messageId);
    });

    // Typing events
    socket.on("user:typing", ({ roomId, userId, userName }) => {
      setTyping({
        conversationId: roomId,
        userId,
        userName,
        isTyping: true,
      });

      // Auto clear after 3 seconds
      setTimeout(() => {
        clearTyping(roomId, userId);
      }, 3000);
    });

    socket.on("user:stop_typing", ({ roomId, userId }) => {
      clearTyping(roomId, userId);
    });

    // Room events
    socket.on("room:updated", ({ roomId, updates }) => {
      updateConversation(roomId, updates as Partial<Conversation>);
    });

    // Presence events
    socket.on("user:online", ({ userId }) => {
      // Update user status in conversations
      console.log("User online:", userId);
    });

    socket.on("user:offline", ({ userId }) => {
      console.log("User offline:", userId);
    });

    // Error handling
    socket.on("error", ({ code, message }) => {
      console.error("WebSocket error:", code, message);
      toast.error(message);
    });

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
    if (!socketRef.current) {
      setupSocket();
    }
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
    if (socket?.connected) {
      socket.emit(event, data);
    } else {
      console.warn("Socket not connected, cannot emit:", event);
    }
  }, []);

  // Join room
  const joinRoom = useCallback(
    (roomId: string) => {
      if (!joinedRoomsRef.current.has(roomId)) {
        emit("room:join", { roomId });
        joinedRoomsRef.current.add(roomId);
      }
    },
    [emit],
  );

  // Leave room
  const leaveRoom = useCallback(
    (roomId: string) => {
      emit("room:leave", { roomId });
      joinedRoomsRef.current.delete(roomId);
    },
    [emit],
  );

  // Send typing indicator
  const sendTyping = useCallback(
    (roomId: string) => {
      emit("typing:start", { roomId });

      // Auto stop typing after 3 seconds
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        emit("typing:stop", { roomId });
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
      emit("typing:stop", { roomId });
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
    socket: getSocket(),
    isConnected: connectionState === "connected",
    connectionState,
    connect,
    disconnect,
    emit,
    joinRoom,
    leaveRoom,
    sendTyping,
    stopTyping,
  };
};

export default useWebSocket;
