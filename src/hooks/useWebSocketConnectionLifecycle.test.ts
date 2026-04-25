import { describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "../lib/socket";
import {
  createWebSocketConnectionLifecycle,
  createWebSocketConnectionLifecycleState,
  normalizeDisconnectEvent,
} from "./useWebSocketConnectionLifecycle";

const createLifecycle = () => {
  const calls: string[] = [];
  const deps = {
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    ensureFreshAccessToken: vi.fn(async () => {
      calls.push("ensureFreshAccessToken");
      return "token";
    }),
    setupSocket: vi.fn(() => {
      calls.push("setupSocket");
    }),
    connectSocket: vi.fn(() => {
      calls.push("connectSocket");
    }),
    disconnectSocket: vi.fn(() => {
      calls.push("disconnectSocket");
    }),
    handleConnectFailure: vi.fn(async () => {
      calls.push("handleConnectFailure");
    }),
    getReconnectPlan: vi.fn(() => ({
      conversationIdsToJoin: ["room-1", "room-2"],
      shouldResync: true,
    })),
    requestConversationJoin: vi.fn((conversationId: string) => {
      calls.push(`requestConversationJoin:${conversationId}`);
    }),
    flushEmitQueue: vi.fn(() => {
      calls.push("flushEmitQueue");
    }),
    flushQueuedMessages: vi.fn(async () => {
      calls.push("flushQueuedMessages");
    }),
    getConnectionState: vi.fn<() => ConnectionState | "unknown">(
      () => "connected",
    ),
    getJoinedConversationIds: vi.fn(() => ["room-1", "room-2"]),
    getQueuedEmitCount: vi.fn(() => 3),
    clearActiveTypingTimeout: vi.fn(() => {
      calls.push("clearActiveTypingTimeout");
    }),
    clearAllRemoteTypingTimers: vi.fn(() => {
      calls.push("clearAllRemoteTypingTimers");
    }),
    clearAllConversationJoinRetries: vi.fn(() => {
      calls.push("clearAllConversationJoinRetries");
    }),
    handleSocketDisconnectedResync: vi.fn(() => {
      calls.push("handleSocketDisconnectedResync");
    }),
    resetResyncCoordinator: vi.fn(() => {
      calls.push("resetResyncCoordinator");
    }),
    resetConversationSyncState: vi.fn(() => {
      calls.push("resetConversationSyncState");
    }),
    clearEmitQueue: vi.fn(() => {
      calls.push("clearEmitQueue");
    }),
    recoverSocketAuth: vi.fn(async () => {
      calls.push("recoverSocketAuth");
    }),
    resyncClientState: vi.fn(async (reason: string) => {
      calls.push(`resyncClientState:${reason}`);
    }),
    log: vi.fn((event: string) => {
      calls.push(`log:${event}`);
    }),
  };

  const lifecycle = createWebSocketConnectionLifecycle({
    state: createWebSocketConnectionLifecycleState(),
    ...deps,
  });

  return { lifecycle, deps, calls };
};

describe("useWebSocketConnectionLifecycle", () => {
  it("replays joined rooms and flushes queues on socket connect", () => {
    vi.useFakeTimers();
    const { lifecycle, deps, calls } = createLifecycle();

    lifecycle.handleSocketConnected();
    vi.runAllTimers();

    expect(deps.onConnect).toHaveBeenCalled();
    expect(deps.requestConversationJoin).toHaveBeenNthCalledWith(1, "room-1", {
      reason: "reconnect",
    });
    expect(deps.requestConversationJoin).toHaveBeenNthCalledWith(2, "room-2", {
      reason: "reconnect",
    });
    expect(calls).toContain("flushEmitQueue");
    expect(calls).toContain("flushQueuedMessages");
    vi.useRealTimers();
  });

  it("connect ensures a fresh token before setup and socket connect", async () => {
    const { lifecycle, calls } = createLifecycle();

    await lifecycle.connect();

    expect(calls).toEqual([
      "log:connect_requested",
      "ensureFreshAccessToken",
      "log:connect_token_ready",
      "setupSocket",
      "connectSocket",
    ]);
  });

  it("connect delegates failures to the connect failure handler", async () => {
    const { lifecycle, deps } = createLifecycle();
    deps.ensureFreshAccessToken.mockRejectedValueOnce(new Error("boom"));

    await lifecycle.connect();

    expect(deps.handleConnectFailure).toHaveBeenCalled();
  });

  it("disconnect clears timers, sync state, and socket connection", () => {
    const { lifecycle, calls } = createLifecycle();

    lifecycle.disconnect();

    expect(calls).toEqual([
      "log:disconnect_requested",
      "clearActiveTypingTimeout",
      "clearAllRemoteTypingTimers",
      "clearAllConversationJoinRetries",
      "resetResyncCoordinator",
      "resetConversationSyncState",
      "clearEmitQueue",
      "disconnectSocket",
    ]);
  });

  it("routes 4401 disconnects through auth recovery and notifies disconnect listeners", () => {
    const { lifecycle, deps } = createLifecycle();
    lifecycle.handleSocketConnected();

    lifecycle.handleSocketDisconnected({
      code: 4401,
      reason: "close_4401",
    });

    expect(deps.handleSocketDisconnectedResync).toHaveBeenCalledWith({
      hasConnectedOnce: true,
    });
    expect(deps.recoverSocketAuth).toHaveBeenCalledWith(
      "ws_close_4401",
      "close_4401",
    );
    expect(deps.onDisconnect).toHaveBeenCalledWith("close_4401");
  });

  it("resyncs instead of reconnecting when the app resumes while already connected", async () => {
    const { lifecycle, deps } = createLifecycle();

    lifecycle.handleResume("visibility_resume");
    await Promise.resolve();

    expect(deps.resyncClientState).toHaveBeenCalledWith("visibility_resume");
    expect(deps.connectSocket).not.toHaveBeenCalled();
  });

  it("reconnects on browser resume when the socket is offline", async () => {
    const { lifecycle, deps } = createLifecycle();
    deps.getConnectionState.mockReturnValue("disconnected");

    lifecycle.handleResume("pageshow");
    await Promise.resolve();

    expect(deps.ensureFreshAccessToken).toHaveBeenCalledTimes(1);
    expect(deps.resyncClientState).not.toHaveBeenCalled();
  });

  it("flushes queued messages and resyncs when the browser comes back online", async () => {
    const { lifecycle, deps } = createLifecycle();

    lifecycle.handleBrowserOnline();
    await Promise.resolve();

    expect(deps.flushQueuedMessages).toHaveBeenCalledTimes(1);
    expect(deps.resyncClientState).toHaveBeenCalledWith("browser_online");
    expect(deps.connectSocket).not.toHaveBeenCalled();
  });

  it("normalizes disconnect payloads defensively", () => {
    expect(normalizeDisconnectEvent({ code: "4401", reason: "" })).toEqual({
      code: 4401,
      reason: "4401",
    });
    expect(normalizeDisconnectEvent({ code: 0, reason: "manual" })).toEqual({
      code: 0,
      reason: "manual",
    });
  });
});
