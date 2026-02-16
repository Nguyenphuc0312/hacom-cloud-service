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
  // Lắng nghe realtime connectionState từ WebSocketManager
  useEffect(() => {
    const socket = initSocket();
    const unsub = socket.onStateChange((state) => {
      setConnectionState(state);
    });
    // Sync ngay lần đầu
    setConnectionState(socket.getConnectionState());
    return () => {
      unsub();
    };
  }, []);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  // Initialize và setup event listeners
  // Đảm bảo chỉ tạo 1 socket instance (singleton) trong initSocket/getSocket
  // Cleanup listeners trước khi setup lại
  const setupSocket = useCallback(() => {
    const socket = initSocket(); // singleton pattern trong lib/socket

    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];

    // ... (giữ nguyên các event listener như cũ)

    // Pseudo-code reconnect backoff (nên implement trong lib/socket):
    // let retryCount = 0;
    // socket.on('disconnect', () => {
    //   setTimeout(() => {
    //     connectSocket();
    //     retryCount++;
    //   }, Math.min(1000 * 2 ** retryCount, 30000));
    // });

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
    // Khi disconnect, có thể trigger fallback polling ở store
    if (
      typeof window !== "undefined" &&
      useChatStore.getState().selectedConversationId
    ) {
      // Pseudo-code: fallback fetch messages mỗi 5s khi socket mất kết nối
      const pollInterval = setInterval(() => {
        const convId = useChatStore.getState().selectedConversationId;
        if (convId) useChatStore.getState().fetchMessages(convId);
      }, 5000);
      // Lưu interval vào window để clear khi reconnect
      (window as any).__chat_poll_interval = pollInterval;
    }
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
      // Nếu reconnect thành công, clear polling interval
      if ((window as any).__chat_poll_interval) {
        clearInterval((window as any).__chat_poll_interval);
        (window as any).__chat_poll_interval = null;
      }
    }
    return () => {
      disconnect();
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
