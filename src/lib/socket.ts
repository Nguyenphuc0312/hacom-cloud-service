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
} from "../config";
import {
  getAccessToken as getStoredAccessToken,
  updateAccessToken,
} from "../services/tokenService";
import { RealtimeEventNames, WsEventNames } from "@hacom/chat-shared-types/ws";
import {
  getJwtExpirationMs,
  isJwtLike,
  isTokenExpired,
  isTokenExpiringSoon,
  normalizeToken,
} from "../utils/jwtHelpers";
import { logger } from "../utils/logger";

// ============================================
// Types
// ============================================

export type ConnectionState =
  | "connecting"
  | "authenticating"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "unauthenticated"
  | "auth_failed"
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
  private nextCloseState: ConnectionState | null = null;
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

  private buildWebSocketUrl(): string {
    const normalizedBase = WEBSOCKET_URL.replace(/\/+$/, "");
    return normalizedBase.endsWith("/ws")
      ? normalizedBase
      : `${normalizedBase}/ws`;
  }

  /**
   * Cập nhật connection state
   */
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.stateChangeHandlers.forEach((handler) => handler(state));
  }

  private closeSocketWithState(state: ConnectionState, reason: string): void {
    this.nextCloseState = state;
    this.isManualDisconnect = true;
    this.stopPingInterval();
    this.clearAuthRefreshTimer();
    if (this.socket) {
      this.socket.close(1000, reason);
    }
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
  //     logger.debug("socket", "already_connected");
  //     return;
  //   }
  //   if (this.socket?.readyState === WebSocket.CONNECTING) {
  //     return;
  //   }

  //   const token = this.getAccessToken();

  //   if (!token) {
  //     logger.warn("socket", "missing_access_token");
  //     this.setConnectionState("error");
  //     return;
  //   }

  //   this.setConnectionState("connecting");

  //   // Build WebSocket URL với token
  //   const wsUrl = `${WEBSOCKET_URL}/ws`;

  //   try {
  //     this.setupSocketHandlers();
  //   } catch (error) {
  //     logger.error("socket", "create_failed", error);
  //     this.setConnectionState("error");
  //     this.scheduleReconnect();
  //   }
  // }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      logger.debug("socket", "already_connected");
      return;
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const rawToken = this.getAccessToken();

    if (!isJwtLike(rawToken)) {
      logger.warn("socket", "connect_skipped_invalid_token");
      this.setConnectionState("unauthenticated");
      // optional: scheduleReconnect() chỉ khi token hợp lệ
      return;
    }

    const token = normalizeToken(rawToken);
    if (!isJwtLike(token)) {
      logger.warn("socket", "connect_skipped_invalid_normalized_token");
      this.setConnectionState("unauthenticated");
      return;
    }

    if (isTokenExpiringSoon(token, AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD)) {
      this.setConnectionState("unauthenticated");
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

    const wsUrl = this.buildWebSocketUrl();
    logger.info("socket", "connecting", {
      authMode: "post-open-auth",
    });

    try {
      this.socket = new WebSocket(wsUrl);
      this.setupSocketHandlers();
    } catch (error) {
      logger.error("socket", "create_failed", error);
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
      logger.info("socket", "connected");
      const rawToken = this.getAccessToken();
      if (!isJwtLike(rawToken)) {
        this.setConnectionState("unauthenticated");
        this.closeSocketWithState("unauthenticated", "missing_access_token");
        return;
      }

      const token = normalizeToken(rawToken);
      if (!isJwtLike(token)) {
        this.setConnectionState("unauthenticated");
        this.closeSocketWithState(
          "unauthenticated",
          "invalid_access_token_format",
        );
        return;
      }

      this.sendAuthenticate(token);
      this.setConnectionState("authenticating");
    };

    this.socket.onclose = (event) => {
      const wasManualDisconnect = this.isManualDisconnect;
      this.isManualDisconnect = false;
      const closeState = this.nextCloseState;
      this.nextCloseState = null;

      logger.info("socket", "disconnected", {
        code: event.code,
        reason: event.reason,
      });
      this.socket = null;
      this.stopPingInterval();
      this.clearAuthRefreshTimer();

      if (closeState) {
        this.setConnectionState(closeState);
      } else if (event.code === 4401 && !wasManualDisconnect) {
        this.setConnectionState("auth_failed");
      } else {
        this.setConnectionState("disconnected");
      }

      // Trigger custom disconnect event
      this.emit("disconnect", { code: event.code, reason: event.reason });

      // Auto reconnect only for non-manual close
      if (event.code === 4401 && !wasManualDisconnect) {
        return;
      }

      if (event.code !== 1000 && !wasManualDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (error) => {
      logger.error("socket", "transport_error", error);
      this.setConnectionState("error");
      this.emit("connect_error", { error });
    };

    this.socket.onmessage = (event) => {
      const messages = this.parseIncomingMessages(event.data);
      if (messages.length === 0) {
        logger.warn("socket", "parse_failed", {
          rawType: typeof event.data,
          rawLength:
            typeof event.data === "string" ? event.data.length : undefined,
        });
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
      ? (() => {
          const rawData = message.data;
          if (rawData && typeof rawData === "object") {
            return {
              ...(rawData as Record<string, unknown>),
              ...(typeof message.eventId === "string" &&
              !Object.prototype.hasOwnProperty.call(rawData, "eventId")
                ? { eventId: message.eventId }
                : {}),
              ...(typeof message.correlationId === "string" &&
              !Object.prototype.hasOwnProperty.call(rawData, "correlationId")
                ? { correlationId: message.correlationId }
                : {}),
            };
          }
          return rawData;
        })()
      : Object.fromEntries(
          Object.entries(message).filter(
            ([key]) => key !== "type" && key !== "event",
          ),
        );

    logger.debug(
      "socket",
      "message_received",
      {
        type,
        payload,
      },
      { debugOnly: true },
    );
    logger.debug(
      "socket",
      "event_received",
      {
        eventName: type,
        data: payload,
      },
      { debugOnly: true },
    );

    if (type === WsEventNames.AUTH_AUTHENTICATED) {
      this.reconnectAttempts = 0;
      this.setConnectionState("connected");
      this.startPingInterval();
      const accessToken = this.getAccessToken();
      if (accessToken) {
        this.scheduleTokenRefresh(accessToken);
      }
      this.emit("connect", {});
    }

    if (type === WsEventNames.AUTH_UNAUTHORIZED) {
      this.nextCloseState = "auth_failed";
      this.setConnectionState("auth_failed");
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
    if (
      this.connectionState === "unauthenticated" ||
      this.connectionState === "auth_failed"
    ) {
      logger.warn("socket", "reconnect_skipped_terminal_auth_state", {
        connectionState: this.connectionState,
      });
      return;
    }

    if (this.reconnectAttempts >= WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS) {
      logger.error("socket", "max_reconnect_attempts_reached", {
        reconnectAttempts: this.reconnectAttempts,
      });
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

    logger.info("socket", "reconnecting", {
      delay,
      attempt: this.reconnectAttempts,
      maxAttempts: WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS,
    });

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
    this.nextCloseState = null;

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
      logger.warn("socket", "send_skipped_not_connected", { type });
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
      logger.error("socket", "send_failed", { type, error });
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
          logger.error("socket", "event_handler_failed", {
            eventType,
            error,
          });
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
  MESSAGE_DELIVERY_ACK: RealtimeEventNames.MESSAGE_DELIVERY_ACK,
  CONVERSATION_JOIN: WsEventNames.CONVERSATION_JOIN,
  CONVERSATION_LEAVE: WsEventNames.CONVERSATION_LEAVE,
  // Deprecated transport aliases kept for inbound/outbound compat only.
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  CONVERSATION_TYPING_STARTED: RealtimeEventNames.CONVERSATION_TYPING_STARTED,
  CONVERSATION_TYPING_STOPPED: RealtimeEventNames.CONVERSATION_TYPING_STOPPED,
  TYPING_START: WsEventNames.TYPING_START,
  TYPING_STOP: WsEventNames.TYPING_STOP,

  // Server → Client
  AUTH_AUTHENTICATED: WsEventNames.AUTH_AUTHENTICATED,
  AUTH_REAUTH_REQUIRED: WsEventNames.AUTH_REAUTH_REQUIRED,
  AUTH_UNAUTHORIZED: WsEventNames.AUTH_UNAUTHORIZED,
  MESSAGE_NEW: WsEventNames.MESSAGE_NEW,
  MESSAGE_UPDATED: WsEventNames.MESSAGE_UPDATED,
  MESSAGE_DELETED: WsEventNames.MESSAGE_DELETED,
  MESSAGE_DELIVERED: RealtimeEventNames.MESSAGE_DELIVERED,
  CONVERSATION_READ_ADVANCED: RealtimeEventNames.CONVERSATION_READ_ADVANCED,
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
  GROUP_MEMBER_REMOVED: "group:member:removed",
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
  CONVERSATION_SUMMARY_UPDATED: "conversation:summary:updated",
  CONVERSATION_MEMBERSHIP_UPDATED: "conversation:membership:updated",
  CONVERSATION_PARTICIPANT_UPDATED: "conversation:participant:updated",
  RESYNC_REQUIRED: WsEventNames.RESYNC_REQUIRED,
  NOTIFICATION_CREATED: "notification:created",
  // Deprecated transport aliases kept for inbound compat only.
  ROOM_JOINED: "room:joined",
  ROOM_LEFT: "room:left",
  ERROR: "error",
} as const;

export default wsManager;
