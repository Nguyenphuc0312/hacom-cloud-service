import { describe, expect, it } from "vitest";
import {
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
  shouldSkipGroupConversationRefreshForCurrentUser,
  shouldUseDeltaConversationRefresh,
  type PendingConversationSyncStrategy,
} from "./useWebSocket";
import {
  acknowledgeConversationJoined,
  createConversationSyncCoordinatorState,
  registerConversationJoinIntent,
  registerReconnectConversationJoins,
  removeConversationSyncTracking,
} from "./useWebSocketConversationCoordinator";

describe("useWebSocket sync machine", () => {
  it("join conversation + conversation:resynced drains pending sync deterministically", () => {
    const pending = new Map<string, PendingConversationSyncStrategy>([
      ["room-1", "initial-sync"],
    ]);
    const joined = new Set<string>(["room-1"]);

    const drained = drainPendingConversationSync(pending, joined, ["room-1"]);

    expect(drained).toEqual([
      { conversationId: "room-1", strategy: "initial-sync" },
    ]);
    expect(pending.has("room-1")).toBe(false);
  });

  it("resync:required drains pending map and normalizes strategy to reconnect when needed", () => {
    const pending = new Map<string, PendingConversationSyncStrategy>([
      ["room-1", "skip"],
      ["room-2", "reconnect"],
    ]);
    const joined = new Set<string>(["room-1", "room-2"]);

    const drained = drainPendingConversationSyncForResyncRequired(
      pending,
      joined,
    );

    expect(drained).toEqual([
      { conversationId: "room-1", strategy: "reconnect" },
      { conversationId: "room-2", strategy: "reconnect" },
    ]);
    expect(pending.size).toBe(0);
  });

  it("skips room refresh when the current user is the removed member", () => {
    expect(
      shouldSkipGroupConversationRefreshForCurrentUser(
        { roomId: "room-1", userId: "user-a" },
        "user-a",
      ),
    ).toBe(true);

    expect(
      shouldSkipGroupConversationRefreshForCurrentUser(
        { roomId: "room-1", userId: "user-b" },
        "user-a",
      ),
    ).toBe(false);
  });

  it("uses delta conversation refresh only for active or joined conversations", () => {
    const joinedConversationIds = new Set<string>(["room-2"]);

    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "room-1",
        selectedConversationId: "room-1",
        joinedConversationIds,
      }),
    ).toBe(true);

    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "room-2",
        selectedConversationId: "room-9",
        joinedConversationIds,
      }),
    ).toBe(true);

    expect(
      shouldUseDeltaConversationRefresh({
        conversationId: "room-3",
        selectedConversationId: "room-9",
        joinedConversationIds,
      }),
    ).toBe(false);
  });

  it("registers join intent and reconnect sync strategy through the coordinator", () => {
    const state = createConversationSyncCoordinatorState();

    const initialStrategy = registerConversationJoinIntent(state, "room-1");
    const skippedStrategy = registerConversationJoinIntent(state, "room-2", {
      skipInitialDeltaSync: true,
    });

    expect(initialStrategy).toBe("initial-sync");
    expect(skippedStrategy).toBe("skip");
    expect(state.joinedConversationIds.has("room-1")).toBe(true);
    expect(state.pendingConversationSync.get("room-2")).toBe("skip");

    const reconnectRooms = registerReconnectConversationJoins(state, true);

    expect(reconnectRooms).toEqual(["room-1", "room-2"]);
    expect(state.pendingConversationSync.get("room-1")).toBe("reconnect");
    expect(state.pendingConversationSync.get("room-2")).toBe("reconnect");
  });

  it("acknowledges joins and clears tracking when a room leaves scope", () => {
    const state = createConversationSyncCoordinatorState();

    registerConversationJoinIntent(state, "room-1");
    const pending = acknowledgeConversationJoined(state, "room-1");

    expect(pending).toBe("initial-sync");
    expect(state.subscribedConversationIds.has("room-1")).toBe(true);

    removeConversationSyncTracking(state, "room-1");

    expect(state.joinedConversationIds.has("room-1")).toBe(false);
    expect(state.subscribedConversationIds.has("room-1")).toBe(false);
    expect(state.pendingConversationSync.has("room-1")).toBe(false);
    expect(state.joinRetryAttempts.has("room-1")).toBe(false);
  });
});
