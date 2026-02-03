/**
 * @fileoverview Socket.io client configuration
 * Quản lý WebSocket connection cho real-time features
 */

import { io, Socket } from "socket.io-client";
import { WEBSOCKET_URL, WEBSOCKET_CONFIG, AUTH_CONFIG } from "../config";

// Singleton socket instance
let socket: Socket | null = null;

/**
 * Lấy token từ storage
 */
const getAccessToken = (): string | null => {
  return (
    localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
    sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)
  );
};

/**
 * Khởi tạo socket connection
 */
export const initSocket = (): Socket => {
  if (socket?.connected) {
    return socket;
  }

  const token = getAccessToken();

  socket = io(WEBSOCKET_URL, {
    auth: {
      token,
    },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS,
    reconnectionDelay: WEBSOCKET_CONFIG.RECONNECT_DELAY,
    reconnectionDelayMax: WEBSOCKET_CONFIG.RECONNECT_DELAY_MAX,
    timeout: 20000,
    transports: ["websocket", "polling"],
  });

  return socket;
};

/**
 * Lấy socket instance hiện tại
 */
export const getSocket = (): Socket | null => {
  return socket;
};

/**
 * Kết nối socket
 */
export const connectSocket = (): void => {
  if (!socket) {
    socket = initSocket();
  }

  if (!socket.connected) {
    // Cập nhật token mới nhất trước khi connect
    const token = getAccessToken();
    socket.auth = { token };
    socket.connect();
  }
};

/**
 * Ngắt kết nối socket
 */
export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
  }
};

/**
 * Cập nhật token cho socket
 */
export const updateSocketAuth = (token: string): void => {
  if (socket) {
    socket.auth = { token };
    // Reconnect với token mới
    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    }
  }
};

// ============================================
// Socket Events Types
// ============================================

export interface SocketEvents {
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  reconnect: (attemptNumber: number) => void;
  reconnect_attempt: (attemptNumber: number) => void;
  reconnect_error: (error: Error) => void;
  reconnect_failed: () => void;

  // Authentication events
  authenticated: (data: { userId: string }) => void;
  authentication_error: (error: { message: string }) => void;

  // Room events
  "room:joined": (data: { roomId: string }) => void;
  "room:left": (data: { roomId: string }) => void;
  "room:updated": (data: { roomId: string; updates: unknown }) => void;
  "room:deleted": (data: { roomId: string }) => void;
  "room:member_added": (data: {
    roomId: string;
    userId: string;
    user: unknown;
  }) => void;
  "room:member_removed": (data: { roomId: string; userId: string }) => void;

  // Message events
  "message:new": (data: { roomId: string; message: unknown }) => void;
  "message:updated": (data: {
    roomId: string;
    messageId: string;
    updates: unknown;
  }) => void;
  "message:deleted": (data: { roomId: string; messageId: string }) => void;
  "message:reaction": (data: {
    roomId: string;
    messageId: string;
    reaction: unknown;
  }) => void;
  "message:read": (data: {
    roomId: string;
    userId: string;
    messageId: string;
  }) => void;

  // Presence events
  "user:online": (data: { userId: string }) => void;
  "user:offline": (data: { userId: string; lastSeen: string }) => void;
  "user:typing": (data: {
    roomId: string;
    userId: string;
    userName: string;
  }) => void;
  "user:stop_typing": (data: { roomId: string; userId: string }) => void;
  "user:status_changed": (data: { userId: string; status: string }) => void;

  // Error events
  error: (error: { code: string; message: string }) => void;
}

// ============================================
// Socket Emit Events
// ============================================

export interface SocketEmitEvents {
  // Authentication
  authenticate: (data: { token: string }) => void;

  // Room management
  "room:join": (data: { roomId: string }) => void;
  "room:leave": (data: { roomId: string }) => void;

  // Messages
  "message:send": (data: {
    roomId: string;
    content: string;
    type?: string;
    attachments?: unknown[];
    replyToId?: string;
  }) => void;
  "message:edit": (data: {
    roomId: string;
    messageId: string;
    content: string;
  }) => void;
  "message:delete": (data: { roomId: string; messageId: string }) => void;
  "message:react": (data: {
    roomId: string;
    messageId: string;
    emoji: string;
  }) => void;
  "message:mark_read": (data: { roomId: string; messageId: string }) => void;

  // Typing
  "typing:start": (data: { roomId: string }) => void;
  "typing:stop": (data: { roomId: string }) => void;

  // Presence
  "presence:update": (data: { status: string }) => void;
}

export default socket;
