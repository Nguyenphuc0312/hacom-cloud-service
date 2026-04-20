import type { ConnectionState } from "../lib/socket";

type WebSocketConnectionLifecycleState = {
  hasConnectedOnce: boolean;
};

type CreateWebSocketConnectionLifecycleOptions = {
  state: WebSocketConnectionLifecycleState;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  ensureFreshAccessToken: (trigger: "ws_connect") => Promise<string>;
  setupSocket: () => void;
  connectSocket: () => void;
  disconnectSocket: () => void;
  handleConnectFailure: (error: unknown) => Promise<void>;
  getReconnectPlan: () => {
    conversationIdsToJoin: string[];
    shouldResync: boolean;
  };
  requestConversationJoin: (
    conversationId: string,
    options: { reason: "initial" | "reconnect" },
  ) => void;
  flushEmitQueue: () => void;
  flushQueuedMessages: () => Promise<void> | void;
  getConnectionState: () => ConnectionState | "unknown";
  getJoinedConversationIds: () => string[];
  getQueuedEmitCount: () => number;
  clearActiveTypingTimeout: () => void;
  clearAllRemoteTypingTimers: () => void;
  clearAllConversationJoinRetries: () => void;
  handleSocketDisconnectedResync: (input: {
    hasConnectedOnce: boolean;
  }) => void;
  resetResyncCoordinator: () => void;
  resetConversationSyncState: () => void;
  clearEmitQueue: () => void;
  recoverSocketAuth: (
    trigger: "ws_close_4401",
    reason: string,
  ) => Promise<void>;
  log: (event: string, details: Record<string, unknown>) => void;
};

const RECONNECT_JOIN_REPLAY_DELAY_MS = 150;

export const createWebSocketConnectionLifecycleState =
  (): WebSocketConnectionLifecycleState => ({
    hasConnectedOnce: false,
  });

export const normalizeDisconnectEvent = (
  payload: Record<string, unknown> | null,
): { code: number; reason: string } => {
  const code =
    typeof payload?.code === "number"
      ? payload.code
      : Number(
          typeof payload?.code === "string" && payload.code.trim().length > 0
            ? payload.code
            : "0",
        );
  const reason =
    typeof payload?.reason === "string" && payload.reason.trim().length > 0
      ? payload.reason
      : Number.isFinite(code) && code > 0
        ? String(code)
        : "disconnected";

  return { code, reason };
};

export const createWebSocketConnectionLifecycle = ({
  state,
  onConnect,
  onDisconnect,
  ensureFreshAccessToken,
  setupSocket,
  connectSocket,
  disconnectSocket,
  handleConnectFailure,
  getReconnectPlan,
  requestConversationJoin,
  flushEmitQueue,
  flushQueuedMessages,
  getConnectionState,
  getJoinedConversationIds,
  getQueuedEmitCount,
  clearActiveTypingTimeout,
  clearAllRemoteTypingTimers,
  clearAllConversationJoinRetries,
  handleSocketDisconnectedResync,
  resetResyncCoordinator,
  resetConversationSyncState,
  clearEmitQueue,
  recoverSocketAuth,
  log,
}: CreateWebSocketConnectionLifecycleOptions) => {
  const connect = async (): Promise<void> => {
    try {
      log("connect_requested", {
        connectionState: getConnectionState(),
      });
      await ensureFreshAccessToken("ws_connect");
      log("connect_token_ready", {
        connectionState: getConnectionState(),
      });
      setupSocket();
      connectSocket();
    } catch (error) {
      await handleConnectFailure(error);
    }
  };

  const disconnect = (): void => {
    log("disconnect_requested", {
      joinedConversationIds: getJoinedConversationIds(),
      queuedEmitCount: getQueuedEmitCount(),
    });
    clearActiveTypingTimeout();
    clearAllRemoteTypingTimers();
    clearAllConversationJoinRetries();
    resetResyncCoordinator();
    resetConversationSyncState();
    clearEmitQueue();
    disconnectSocket();
  };

  const handleSocketConnected = (): void => {
    onConnect?.();
    const { conversationIdsToJoin, shouldResync } = getReconnectPlan();
    conversationIdsToJoin.forEach((conversationId, index) => {
      const delayMs = index * RECONNECT_JOIN_REPLAY_DELAY_MS;
      window.setTimeout(() => {
        if (getConnectionState() !== "connected") {
          log("conversation_join_replay_skipped", {
            conversationId,
            delayMs,
            connectionState: getConnectionState(),
          });
          return;
        }

        requestConversationJoin(conversationId, {
          reason: shouldResync ? "reconnect" : "initial",
        });
      }, delayMs);
    });

    state.hasConnectedOnce = true;

    flushEmitQueue();
    log("offline_queue_flush_requested", {
      reason: "socket_connected",
      joinedConversationIds: getJoinedConversationIds(),
    });
    void flushQueuedMessages();
  };

  const handleSocketDisconnected = (input: {
    code: number;
    reason: string;
  }): void => {
    handleSocketDisconnectedResync({
      hasConnectedOnce: state.hasConnectedOnce,
    });
    clearAllConversationJoinRetries();
    if (input.code === 4401) {
      void recoverSocketAuth("ws_close_4401", "close_4401");
    }
    onDisconnect?.(input.reason);
  };

  return {
    connect,
    disconnect,
    handleSocketConnected,
    handleSocketDisconnected,
  };
};
