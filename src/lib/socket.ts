/**
 * @fileoverview Raw WebSocket client configuration
 * Quản lý WebSocket connection cho real-time features
 *
 * FIX #2: Chuyển từ Socket.IO sang raw WebSocket
 * để tương thích với Gorilla WebSocket backend
 */

import {
  AUTH_CONFIG,
  WEBSOCKET_URL,
  WEBSOCKET_CONFIG,
  WEBSOCKET_AUTH_CONFIG,
} from "../config";
import {
  getAccessToken as getStoredAccessToken,
  updateAccessToken,
} from "../services/tokenService";
import { WsEventNames } from "@hacom/chat-shared-types";
import {
  getJwtExpirationMs,
  isJwtLike,
  isTokenExpired,
  isTokenExpiringSoon,
  normalizeToken,
} from "../utils/jwtHelpers";

const QUERY_TOKEN_BY_ENV = WEBSOCKET_AUTH_CONFIG.USE_QUERY_TOKEN;
const AUTO_QUERY_TOKEN_FALLBACK_ENABLED =
  WEBSOCKET_AUTH_CONFIG.AUTO_QUERY_TOKEN_FALLBACK;

// ============================================
// Types
// ============================================

export type ConnectionState =
  | "connecting"
  | "authenticating"
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
  private authRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;
  private queryTokenFallbackEnabled = false;
  private queryTokenFallbackAttempted = false;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private connectionState: ConnectionState = "disconnected";
  private stateChangeHandlers: Set<(state: ConnectionState) => void> =
    new Set();

  private sendAuthenticate(accessToken: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WebSocketEvent = {
      event: WsEventNames.AUTH_AUTHENTICATE,
      data: { accessToken },
    };
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Lấy token từ storage
   */
  private getAccessToken(): string | null {
    return getStoredAccessToken();
  }

  private buildWebSocketUrl(token: string): string {
    const normalizedBase = WEBSOCKET_URL.replace(/\/+$/, "");
    const endpoint = normalizedBase.endsWith("/ws")
      ? normalizedBase
      : `${normalizedBase}/ws`;

    const useQueryToken = QUERY_TOKEN_BY_ENV || this.queryTokenFallbackEnabled;

    if (!useQueryToken) {
      return endpoint;
    }

    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}token=${encodeURIComponent(token)}`;
  }

  /**
   * Cập nhật connection state
   */
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.stateChangeHandlers.forEach((handler) => handler(state));
  }

  private clearAuthRefreshTimer(): void {
    if (this.authRefreshTimer) {
      clearTimeout(this.authRefreshTimer);
      this.authRefreshTimer = null;
    }
  }

  private scheduleTokenRefresh(accessToken: string): void {
    this.clearAuthRefreshTimer();

    if (!isJwtLike(accessToken)) {
      return;
    }

    const expiresSoon = isTokenExpiringSoon(
      accessToken,
      AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD,
    );
    const expired = isTokenExpired(accessToken);

    if (expired || expiresSoon) {
      this.emit(WsEventNames.AUTH_REAUTH_REQUIRED, {
        reason: expired ? "token_expired" : "token_expiring",
      });
      return;
    }

    const expMs = getJwtExpirationMs(accessToken);
    if (!expMs) {
      return;
    }

    const delay = Math.max(
      expMs - Date.now() - AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD,
      0,
    );

    this.authRefreshTimer = setTimeout(() => {
      this.emit(WsEventNames.AUTH_REAUTH_REQUIRED, {
        reason: "token_expiring",
      });
    }, delay);
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
  // connect(): void {
  //   if (this.socket?.readyState === WebSocket.OPEN) {
  //     console.log("WebSocket already connected");
  //     return;
  //   }
  //   if (this.socket?.readyState === WebSocket.CONNECTING) {
  //     return;
  //   }

  //   const token = this.getAccessToken();

  //   if (!token) {
  //     console.error("No access token available");
  //     this.setConnectionState("error");
  //     return;
  //   }

  //   this.setConnectionState("connecting");

  //   // Build WebSocket URL với token
  //   // Backend expects: ws://host:port/ws?token=JWT_TOKEN
  //   const wsUrl = `${WEBSOCKET_URL}/ws`;

  //   try {
  //     this.socket = new WebSocket(wsUrl);
  //     this.setupSocketHandlers();
  //   } catch (error) {
  //     console.error("Failed to create WebSocket:", error);
  //     this.setConnectionState("error");
  //     this.scheduleReconnect();
  //   }
  // }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const rawToken = this.getAccessToken();

    if (!isJwtLike(rawToken)) {
      console.error("WS: invalid/missing token, skip connect:", rawToken);
      this.setConnectionState("error");
      // optional: scheduleReconnect() chỉ khi token hợp lệ
      return;
    }

    const token = normalizeToken(rawToken);
    if (!isJwtLike(token)) {
      console.error("WS: token normalized but still invalid:", token);
      this.setConnectionState("error");
      return;
    }

    if (isTokenExpiringSoon(token, AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD)) {
      this.emit(WsEventNames.AUTH_REAUTH_REQUIRED, {
        reason: isTokenExpired(token) ? "token_expired" : "token_expiring",
      });
      return;
    }

    this.setConnectionState("connecting");
    this.isManualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsUrl = this.buildWebSocketUrl(token);
    const useQueryToken = wsUrl.includes("token=");
    console.log(
      `WebSocket connecting (${useQueryToken ? "query-token" : "post-open-auth"})`,
    );

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
    let hasOpened = false;

    this.socket.onopen = () => {
      hasOpened = true;
      this.queryTokenFallbackAttempted = false;
      console.log("WebSocket connected");
      const rawToken = this.getAccessToken();
      if (!isJwtLike(rawToken)) {
        this.setConnectionState("error");
        this.disconnect();
        return;
      }

      const token = normalizeToken(rawToken);
      this.sendAuthenticate(token);
      this.setConnectionState("authenticating");
    };

    this.socket.onclose = (event) => {
      const wasManualDisconnect = this.isManualDisconnect;
      this.isManualDisconnect = false;

      console.log("WebSocket disconnected:", event.code, event.reason);
      this.socket = null;
      this.setConnectionState("disconnected");
      this.stopPingInterval();
      this.clearAuthRefreshTimer();

      // Trigger custom disconnect event
      this.emit("disconnect", { code: event.code, reason: event.reason });

      const shouldTryQueryTokenFallback =
        !wasManualDisconnect &&
        !hasOpened &&
        event.code === 1006 &&
        !QUERY_TOKEN_BY_ENV &&
        AUTO_QUERY_TOKEN_FALLBACK_ENABLED &&
        !this.queryTokenFallbackAttempted;

      if (shouldTryQueryTokenFallback) {
        this.queryTokenFallbackAttempted = true;
        this.queryTokenFallbackEnabled = true;
        console.warn(
          "WebSocket handshake closed before onopen, retrying with query-token auth",
        );
        this.connect();
        return;
      }

      // Auto reconnect only for non-manual close
      if (event.code === 4401 && !wasManualDisconnect) {
        return;
      }

      if (event.code !== 1000 && !wasManualDisconnect) {
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
   * Handle message received from server.
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

    if (type === WsEventNames.AUTH_AUTHENTICATED) {
      this.queryTokenFallbackEnabled = false;
      this.queryTokenFallbackAttempted = false;
      this.reconnectAttempts = 0;
      this.setConnectionState("connected");
      this.startPingInterval();
      const accessToken = this.getAccessToken();
      if (accessToken) {
        this.scheduleTokenRefresh(accessToken);
      }
      this.emit("connect", {});
    }

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
        return value.filter((item): item is WebSocketEvent =>
          isEventShape(item),
        );
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
   * Start ping interval to detect dead connections.
   * Sends an app-level "ping" event. If no data is received within
   * PONG_TIMEOUT, treat the connection as dead and trigger reconnect.
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      // Send lightweight app-level ping (server echoes EventPong)
      this.send("ping", { t: Date.now() });
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
    this.isManualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();
    this.clearAuthRefreshTimer();
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
    const normalizedToken = normalizeToken(token);
    if (!isJwtLike(normalizedToken)) {
      return;
    }

    const currentToken = this.getAccessToken();
    if (
      currentToken &&
      normalizeToken(currentToken) === normalizedToken &&
      this.isConnected()
    ) {
      return;
    }

    updateAccessToken(normalizedToken);
    this.disconnect();
    this.connect();
  }

  authenticate(token: string): void {
    const normalizedToken = normalizeToken(token);
    if (!isJwtLike(normalizedToken)) {
      return;
    }

    updateAccessToken(normalizedToken);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendAuthenticate(normalizedToken);
      this.setConnectionState("authenticating");
      return;
    }

    this.connect();
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

export const authenticateSocket = (token: string): void => {
  wsManager.authenticate(token);
};

// ============================================
// Event Types (mapping với backend)
// ============================================

export const WebSocketEvents = {
  // Client → Server
  AUTH_AUTHENTICATE: WsEventNames.AUTH_AUTHENTICATE,
  MESSAGE_SEND: "message:send",
  CONVERSATION_JOIN: WsEventNames.CONVERSATION_JOIN,
  CONVERSATION_LEAVE: WsEventNames.CONVERSATION_LEAVE,
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  TYPING_START: WsEventNames.TYPING_START,
  TYPING_STOP: WsEventNames.TYPING_STOP,

  // Server → Client
  AUTH_AUTHENTICATED: WsEventNames.AUTH_AUTHENTICATED,
  AUTH_REAUTH_REQUIRED: WsEventNames.AUTH_REAUTH_REQUIRED,
  AUTH_UNAUTHORIZED: WsEventNames.AUTH_UNAUTHORIZED,
  MESSAGE_NEW: WsEventNames.MESSAGE_NEW,
  MESSAGE_UPDATED: WsEventNames.MESSAGE_UPDATED,
  MESSAGE_DELETED: WsEventNames.MESSAGE_DELETED,
  MESSAGE_READ: WsEventNames.MESSAGE_READ,
  MEMBER_UPDATED: WsEventNames.MEMBER_UPDATED,
  CONVERSATION_DELETED: WsEventNames.CONVERSATION_DELETED,
  FRIENDSHIP_REQUEST_CREATED: "friendship:request:created",
  FRIENDSHIP_REQUEST_UPDATED: "friendship:request:updated",
  FRIENDSHIP_RELATION_UPDATED: "friendship:relation:updated",
  FRIEND_REQUEST_NEW: WsEventNames.FRIEND_REQUEST_NEW,
  FRIEND_REQUEST_UPDATED: WsEventNames.FRIEND_REQUEST_UPDATED,
  FRIEND_STATUS_CHANGED: WsEventNames.FRIEND_STATUS_CHANGED,
  GROUP_INVITE_USER: WsEventNames.GROUP_INVITE_USER,
  GROUP_INVITE_LINK_CREATED: WsEventNames.GROUP_INVITE_LINK_CREATED,
  GROUP_INVITE_UPDATED: WsEventNames.GROUP_INVITE_UPDATED,
  GROUP_MEMBER_JOINED: WsEventNames.GROUP_MEMBER_JOINED,
  GROUP_MEMBER_LEFT: WsEventNames.GROUP_MEMBER_LEFT,
  GROUP_MEMBER_UPDATED: WsEventNames.GROUP_MEMBER_UPDATED,
  GROUP_MEMBER_BANNED: WsEventNames.GROUP_MEMBER_BANNED,
  GROUP_SETTINGS_UPDATED: WsEventNames.GROUP_SETTINGS_UPDATED,
  GROUP_JOIN_REQUEST_NEW: WsEventNames.GROUP_JOIN_REQUEST_NEW,
  GROUP_JOIN_REQUEST_RESOLVED: WsEventNames.GROUP_JOIN_REQUEST_RESOLVED,
  GROUP_PIN_UPDATED: WsEventNames.GROUP_PIN_UPDATED,
  GROUP_SLOW_MODE_TRIGGERED: WsEventNames.GROUP_SLOW_MODE_TRIGGERED,
  PERMISSION_CHANGED: WsEventNames.PERMISSION_CHANGED,
  PRESENCE_UPDATE: WsEventNames.PRESENCE_UPDATE,
  PRESENCE_SUBSCRIBE: WsEventNames.PRESENCE_SUBSCRIBE,
  PRESENCE_UNSUBSCRIBE: WsEventNames.PRESENCE_UNSUBSCRIBE,
  PRESENCE_SNAPSHOT: WsEventNames.PRESENCE_SNAPSHOT,
  USER_SETTINGS_UPDATED: WsEventNames.USER_SETTINGS_UPDATED,
  CONVERSATION_JOINED: WsEventNames.CONVERSATION_JOINED,
  CONVERSATION_LEFT: WsEventNames.CONVERSATION_LEFT,
  CONVERSATION_RESYNCED: WsEventNames.CONVERSATION_RESYNCED,
  CONVERSATION_SUMMARY_UPDATED: WsEventNames.CONVERSATION_SUMMARY_UPDATED,
  CONVERSATION_MEMBERSHIP_UPDATED: WsEventNames.CONVERSATION_MEMBERSHIP_UPDATED,
  RESYNC_REQUIRED: WsEventNames.RESYNC_REQUIRED,
  ROOM_JOINED: "room:joined",
  ROOM_LEFT: "room:left",
  ERROR: "error",
} as const;

export default wsManager;
