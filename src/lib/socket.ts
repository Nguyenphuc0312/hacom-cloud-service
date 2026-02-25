/**
 * @fileoverview Raw WebSocket client configuration
 * Quản lý WebSocket connection cho real-time features
 *
 * FIX #2: Chuyển từ Socket.IO sang raw WebSocket
 * để tương thích với Gorilla WebSocket backend
 */

import { WEBSOCKET_URL, WEBSOCKET_CONFIG } from "../config";
import {
  getAccessToken as getStoredAccessToken,
  updateAccessToken,
} from "../services/tokenService";

// ============================================
// Types
// ============================================

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

export interface WebSocketEvent {
  event: string;
  type?: string;
  data?: unknown;
  [key: string]: unknown;
}

export type EventHandler = (data: unknown) => void;

// ============================================
// WebSocket Manager Class
// ============================================

class WebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private connectionState: ConnectionState = "disconnected";
  private stateChangeHandlers: Set<(state: ConnectionState) => void> =
    new Set();

  /**
   * Lấy token từ storage
   */
  private getAccessToken(): string | null {
    return getStoredAccessToken();
  }

  /**
   * Cập nhật connection state
   */
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.stateChangeHandlers.forEach((handler) => handler(state));
  }

  /**
   * Đăng ký listener cho state changes
   */
  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Lấy connection state hiện tại
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Kiểm tra đã connected chưa
   */
  isConnected(): boolean {
    return (
      this.socket !== null &&
      this.socket.readyState === WebSocket.OPEN &&
      this.connectionState === "connected"
    );
  }

  /**
   * Kết nối WebSocket
   */
  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const token = this.getAccessToken();
    if (!token) {
      console.error("No access token available");
      this.setConnectionState("error");
      return;
    }

    this.setConnectionState("connecting");

    // Build WebSocket URL với token
    // Backend expects: ws://host:port/ws?token=JWT_TOKEN
    const wsUrl = `${WEBSOCKET_URL}/ws?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(wsUrl);
      this.setupSocketHandlers();
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      this.setConnectionState("error");
      this.scheduleReconnect();
    }
  }

  /**
   * Setup các event handlers cho WebSocket
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log("WebSocket connected");
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;
      this.startPingInterval();

      // Trigger custom connect event
      this.emit("connect", {});
    };

    this.socket.onclose = (event) => {
      console.log("WebSocket disconnected:", event.code, event.reason);
      this.socket = null;
      this.setConnectionState("disconnected");
      this.stopPingInterval();

      // Trigger custom disconnect event
      this.emit("disconnect", { code: event.code, reason: event.reason });

      // Tự động reconnect nếu không phải đóng chủ động
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.setConnectionState("error");
      this.emit("connect_error", { error });
    };

    this.socket.onmessage = (event) => {
      const messages = this.parseIncomingMessages(event.data);
      if (messages.length === 0) {
        console.error("Failed to parse WebSocket message:", event.data);
        return;
      }
      messages.forEach((message) => this.handleMessage(message));
    };
  }

  /**
   * Xử lý message nhận được từ server
   */
  private handleMessage(message: WebSocketEvent): void {
    const type =
      (typeof message.event === "string" && message.event) ||
      (typeof message.type === "string" ? message.type : "");
    if (!type) return;

    const payload = Object.prototype.hasOwnProperty.call(message, "data")
      ? message.data
      : Object.fromEntries(
          Object.entries(message).filter(
            ([key]) => key !== "type" && key !== "event",
          ),
        );

    // Log for debugging
    console.debug("WebSocket received:", type, payload);

    // Emit to registered handlers
    this.emit(type, payload);
  }

  /**
   * Parse payload from raw websocket frame.
   * Some backends emit multiple JSON objects separated by newlines in one frame.
   */
  private parseIncomingMessages(raw: unknown): WebSocketEvent[] {
    const toEventArray = (value: unknown): WebSocketEvent[] => {
      const isEventShape = (item: unknown): item is WebSocketEvent =>
        item !== null &&
        typeof item === "object" &&
        (typeof (item as Record<string, unknown>).event === "string" ||
          typeof (item as Record<string, unknown>).type === "string");

      if (Array.isArray(value)) {
        return value.filter((item): item is WebSocketEvent => isEventShape(item));
      }

      if (isEventShape(value)) {
        return [value as WebSocketEvent];
      }

      return [];
    };

    if (typeof raw !== "string") {
      return [];
    }

    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      return toEventArray(JSON.parse(trimmed));
    } catch {
      // Fallback for NDJSON/newline-delimited payloads.
      const events: WebSocketEvent[] = [];
      const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          events.push(...toEventArray(parsed));
        } catch {
          // Skip malformed line and continue parsing remaining lines.
        }
      }

      return events;
    }
  }

  /**
   * Schedule reconnect với exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS) {
      console.error("Max reconnect attempts reached");
      this.setConnectionState("error");
      this.emit("reconnect_failed", {});
      return;
    }

    this.setConnectionState("reconnecting");
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      WEBSOCKET_CONFIG.RECONNECT_DELAY *
        Math.pow(2, this.reconnectAttempts - 1),
      WEBSOCKET_CONFIG.RECONNECT_DELAY_MAX,
    );

    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS})`,
    );

    this.emit("reconnect_attempt", { attempt: this.reconnectAttempts });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start ping interval để giữ connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    // WebSocket protocol có built-in ping/pong, không cần manual ping
    this.pingTimer = setInterval(() => {
      // Noop - built-in ping/pong
    }, WEBSOCKET_CONFIG.PING_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Ngắt kết nối WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();
    this.reconnectAttempts = 0;

    if (this.socket) {
      this.socket.close(1000, "Client disconnect");
      this.socket = null;
    }

    this.setConnectionState("disconnected");
  }

  /**
   * Gửi event đến server
   */
  send(type: string, data: unknown): boolean {
    if (!this.isConnected()) {
      console.warn("Cannot send message, WebSocket not connected");
      return false;
    }

    try {
      const message = {
        event: type,
        data,
      } as WebSocketEvent;
      this.socket!.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  }

  /**
   * Đăng ký event handler
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Hủy đăng ký event handler
   */
  off(eventType: string, handler?: EventHandler): void {
    if (handler) {
      this.eventHandlers.get(eventType)?.delete(handler);
    } else {
      this.eventHandlers.delete(eventType);
    }
  }

  /**
   * Emit event đến local handlers
   */
  private emit(eventType: string, data: unknown): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Cập nhật token và reconnect
   */
  updateAuth(token: string): void {
    // Lưu token mới
    updateAccessToken(token);

    // Reconnect với token mới
    if (this.isConnected()) {
      this.disconnect();
      this.connect();
    }
  }
}

// ============================================
// Singleton instance
// ============================================

const wsManager = new WebSocketManager();

// ============================================
// Export functions (giữ tương thích API cũ)
// ============================================

/**
 * Khởi tạo socket connection
 */
export const initSocket = (): WebSocketManager => {
  return wsManager;
};

/**
 * Lấy socket manager instance
 */
export const getSocket = (): WebSocketManager | null => {
  return wsManager;
};

/**
 * Kết nối socket
 */
export const connectSocket = (): void => {
  wsManager.connect();
};

/**
 * Ngắt kết nối socket
 */
export const disconnectSocket = (): void => {
  wsManager.disconnect();
};

/**
 * Cập nhật token cho socket
 */
export const updateSocketAuth = (token: string): void => {
  wsManager.updateAuth(token);
};

// ============================================
// Event Types (mapping với backend)
// ============================================

export const WebSocketEvents = {
  // Client → Server
  MESSAGE_SEND: "message:send",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  LEGACY_TYPING_START: "user:typing",
  LEGACY_TYPING_STOP: "user:stop_typing",

  // Server → Client
  MESSAGE_NEW: "message:new",
  MESSAGE_UPDATE: "message:update",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  MESSAGE_READ_CONFIRMED: "message:read_confirmed",
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  ROOM_JOINED: "room:joined",
  ROOM_LEFT: "room:left",
  USER_TYPING: "user:typing",
  USER_STOP_TYPING: "user:stop_typing",
  TYPING: "typing",
  SYNC_COMPLETE: "sync:complete",
  ERROR: "error",
  PRESENCE_SYNC: "presence:sync",
} as const;

export default wsManager;

