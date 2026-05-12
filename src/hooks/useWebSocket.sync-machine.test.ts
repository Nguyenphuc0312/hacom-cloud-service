/**
 * @fileoverview WebSocket sync machine tests
 *
 * Tests the WebSocket sync state machine, conversation join/leave coordination,
 * reconnect resync, and delta sync logic in isolation without the React hook.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createConversationSyncCoordinatorState,
  registerConversationJoinIntent,
  acknowledgeConversationJoined,
  acknowledgeConversationLeft,
  removeConversationSyncTracking,
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
  registerReconnectConversationJoins,
} from "../hooks/useWebSocketConversationCoordinator";
import {
  createWebSocketResyncCoordinatorState,
  shouldRefreshConversationSummariesForScopes,
  shouldResyncJoinedConversationsForScopes,
  shouldTriggerFriendshipResyncForScopes,
  shouldSyncUserSettingsForScopes,
} from "../hooks/useWebSocketResyncCoordinator";

// ============================================
// Conversation Sync Coordinator
// ============================================

describe("useWebSocket.sync-machine — conversation sync coordinator", () => {
  let state: ReturnType<typeof createConversationSyncCoordinatorState>;

  beforeEach(() => {
    state = createConversationSyncCoordinatorState();
  });

  describe("registerConversationJoinIntent", () => {
    it("registers a conversation and returns initial-sync strategy by default", () => {
      const strategy = registerConversationJoinIntent(state, "conv-1");
      expect(strategy).toBe("initial-sync");
      expect(state.joinedConversationIds.has("conv-1")).toBe(true);
      expect(state.pendingConversationSync.get("conv-1")).toBe("initial-sync");
    });

    it("returns skip strategy when skipInitialDeltaSync is true", () => {
      const strategy = registerConversationJoinIntent(state, "conv-2", { skipInitialDeltaSync: true });
      expect(strategy).toBe("skip");
      expect(state.pendingConversationSync.get("conv-2")).toBe("skip");
    });

    it("clears subscribed state when re-registering", () => {
      registerConversationJoinIntent(state, "conv-1");
      expect(state.subscribedConversationIds.has("conv-1")).toBe(false);
    });

    it("resets join retry attempts on re-registration", () => {
      state.joinRetryAttempts.set("conv-1", 5);
      registerConversationJoinIntent(state, "conv-1");
      expect(state.joinRetryAttempts.get("conv-1")).toBe(0);
    });

    it("allows registering multiple conversations independently", () => {
      registerConversationJoinIntent(state, "conv-1");
      registerConversationJoinIntent(state, "conv-2");
      expect(state.joinedConversationIds.size).toBe(2);
    });
  });

  describe("acknowledgeConversationJoined", () => {
    it("adds to subscribed and returns pending strategy", () => {
      registerConversationJoinIntent(state, "conv-1");
      const strategy = acknowledgeConversationJoined(state, "conv-1");
      expect(strategy).toBe("initial-sync");
      expect(state.subscribedConversationIds.has("conv-1")).toBe(true);
    });

    it("clears join retry attempts on ack", () => {
      registerConversationJoinIntent(state, "conv-1");
      state.joinRetryAttempts.set("conv-1", 3);
      acknowledgeConversationJoined(state, "conv-1");
      expect(state.joinRetryAttempts.has("conv-1")).toBe(false);
    });

    it("returns null when no pending strategy", () => {
      const strategy = acknowledgeConversationJoined(state, "conv-unknown");
      expect(strategy).toBeNull();
    });
  });

  describe("acknowledgeConversationLeft", () => {
    it("removes from subscribed and clears retry attempts", () => {
      registerConversationJoinIntent(state, "conv-1");
      acknowledgeConversationJoined(state, "conv-1");
      state.joinRetryAttempts.set("conv-1", 2);

      acknowledgeConversationLeft(state, "conv-1");

      expect(state.subscribedConversationIds.has("conv-1")).toBe(false);
      expect(state.joinRetryAttempts.has("conv-1")).toBe(false);
    });

    it("is safe when conversation was not in state", () => {
      expect(() => acknowledgeConversationLeft(state, "conv-unknown")).not.toThrow();
    });
  });

  describe("removeConversationSyncTracking", () => {
    it("removes conversation from all tracking sets and maps", () => {
      registerConversationJoinIntent(state, "conv-1");
      acknowledgeConversationJoined(state, "conv-1");
      state.joinRetryAttempts.set("conv-1", 3);

      removeConversationSyncTracking(state, "conv-1");

      expect(state.joinedConversationIds.has("conv-1")).toBe(false);
      expect(state.subscribedConversationIds.has("conv-1")).toBe(false);
      expect(state.pendingConversationSync.has("conv-1")).toBe(false);
      expect(state.joinRetryAttempts.has("conv-1")).toBe(false);
    });
  });

  describe("drainPendingConversationSync", () => {
    beforeEach(() => {
      registerConversationJoinIntent(state, "conv-1");
      registerConversationJoinIntent(state, "conv-2");
      registerConversationJoinIntent(state, "conv-3");
    });

    it("drains all when targetRoomIds is empty", () => {
      const drained = drainPendingConversationSync(
        state.pendingConversationSync,
        state.joinedConversationIds,
        [],
      );
      // When targetRoomIds is empty, ALL pending entries are drained (no filtering)
      expect(drained).toHaveLength(3);
      expect(state.pendingConversationSync.size).toBe(0);
    });

    it("drains only target room IDs when provided", () => {
      const drained = drainPendingConversationSync(
        state.pendingConversationSync,
        state.joinedConversationIds,
        ["conv-1", "conv-2"],
      );

      expect(drained.map((d) => d.conversationId)).toEqual(["conv-1", "conv-2"]);
      expect(state.pendingConversationSync.size).toBe(1);
      expect(state.pendingConversationSync.has("conv-3")).toBe(true);
    });

    it("skips rooms not in joinedConversationIds", () => {
      // drainPendingConversationSync only filters when targetRoomIds is non-empty.
      // When targetRoomIds is empty, all pending entries are drained regardless of join status.
      state.joinedConversationIds.delete("conv-1");

      const drained = drainPendingConversationSync(
        state.pendingConversationSync,
        state.joinedConversationIds,
        [],
      );

      // Empty targetRoomIds means drain everything
      expect(drained.map((d) => d.conversationId)).toContain("conv-1");
      expect(drained.map((d) => d.conversationId)).toContain("conv-2");
      expect(drained.map((d) => d.conversationId)).toContain("conv-3");
    });

    it("defaults strategy to initial-sync when not found", () => {
      state.pendingConversationSync.delete("conv-1");

      const drained = drainPendingConversationSync(
        state.pendingConversationSync,
        state.joinedConversationIds,
        ["conv-1"],
      );

      expect(drained[0].strategy).toBe("initial-sync");
    });
  });

  describe("registerReconnectConversationJoins", () => {
    it("sets reconnect strategy when shouldResync is true", () => {
      registerConversationJoinIntent(state, "conv-1");
      registerConversationJoinIntent(state, "conv-2");

      const ids = registerReconnectConversationJoins(state, true);

      expect(ids).toContain("conv-1");
      expect(ids).toContain("conv-2");
      expect(state.pendingConversationSync.get("conv-1")).toBe("reconnect");
    });

    it("sets skip strategy when shouldResync is false", () => {
      registerConversationJoinIntent(state, "conv-1");

      registerReconnectConversationJoins(state, false);

      expect(state.pendingConversationSync.get("conv-1")).toBe("skip");
    });

    it("clears subscribed on reconnect registration", () => {
      registerConversationJoinIntent(state, "conv-1");
      acknowledgeConversationJoined(state, "conv-1");

      registerReconnectConversationJoins(state, true);

      expect(state.subscribedConversationIds.has("conv-1")).toBe(false);
    });
  });

  describe("drainPendingConversationSyncForResyncRequired", () => {
    beforeEach(() => {
      registerConversationJoinIntent(state, "conv-1");
      registerConversationJoinIntent(state, "conv-2", { skipInitialDeltaSync: true });
    });

    it("returns all joined conversations with reconnect strategy", () => {
      const drained = drainPendingConversationSyncForResyncRequired(
        state.pendingConversationSync,
        state.joinedConversationIds,
      );

      expect(drained).toHaveLength(2);
      // drainPendingConversationSyncForResyncRequired: pending=initial-sync → keeps "initial-sync",
      // pending=skip → returns "reconnect" (the override case)
      const byId: Record<string, string> = {};
      drained.forEach(({ conversationId, strategy }) => { byId[conversationId] = strategy; });
      expect(byId["conv-1"]).toBe("initial-sync");
      expect(byId["conv-2"]).toBe("reconnect");
    });

    it("clears pending map", () => {
      drainPendingConversationSyncForResyncRequired(
        state.pendingConversationSync,
        state.joinedConversationIds,
      );
      expect(state.pendingConversationSync.size).toBe(0);
    });
  });
});

// ============================================
// Resync Coordinator — scope filtering
// ============================================

describe("useWebSocket.sync-machine — resync scope filtering", () => {
  describe("shouldRefreshConversationSummariesForScopes", () => {
    it("returns true when scopes is empty (refresh all)", () => {
      expect(shouldRefreshConversationSummariesForScopes([])).toBe(true);
    });

    it("returns true for rooms scope", () => {
      expect(shouldRefreshConversationSummariesForScopes(["rooms"])).toBe(true);
    });

    it("returns true for conversations scope", () => {
      expect(shouldRefreshConversationSummariesForScopes(["conversations"])).toBe(true);
    });

    it("returns true for groups scope", () => {
      expect(shouldRefreshConversationSummariesForScopes(["groups"])).toBe(true);
    });

    it("returns true for user_scoped scope", () => {
      expect(shouldRefreshConversationSummariesForScopes(["user_scoped"])).toBe(true);
    });

    it("returns true for permissions scope", () => {
      expect(shouldRefreshConversationSummariesForScopes(["permissions"])).toBe(true);
    });

    it("returns false for unrelated scopes", () => {
      expect(shouldRefreshConversationSummariesForScopes(["friendships"])).toBe(false);
    });

    it("returns true when any matching scope is present", () => {
      expect(shouldRefreshConversationSummariesForScopes(["friendships", "rooms"])).toBe(true);
    });
  });

  describe("shouldResyncJoinedConversationsForScopes", () => {
    it("returns true when scopes is empty", () => {
      expect(shouldResyncJoinedConversationsForScopes([])).toBe(true);
    });

    it("returns true for rooms scope", () => {
      expect(shouldResyncJoinedConversationsForScopes(["rooms"])).toBe(true);
    });

    it("returns true for conversations scope", () => {
      expect(shouldResyncJoinedConversationsForScopes(["conversations"])).toBe(true);
    });

    it("returns true for groups scope", () => {
      expect(shouldResyncJoinedConversationsForScopes(["groups"])).toBe(true);
    });

    it("returns false for unrelated scopes", () => {
      expect(shouldResyncJoinedConversationsForScopes(["friendships", "user_settings"])).toBe(
        false,
      );
    });
  });

  describe("shouldTriggerFriendshipResyncForScopes", () => {
    it("returns true when scopes is empty", () => {
      expect(shouldTriggerFriendshipResyncForScopes([])).toBe(true);
    });

    it("returns true for friendships scope", () => {
      expect(shouldTriggerFriendshipResyncForScopes(["friendships"])).toBe(true);
    });

    it("returns true for permissions scope", () => {
      expect(shouldTriggerFriendshipResyncForScopes(["permissions"])).toBe(true);
    });

    it("returns true for user_scoped scope", () => {
      expect(shouldTriggerFriendshipResyncForScopes(["user_scoped"])).toBe(true);
    });

    it("returns false for unrelated scopes", () => {
      expect(shouldTriggerFriendshipResyncForScopes(["rooms", "groups"])).toBe(false);
    });
  });

  describe("shouldSyncUserSettingsForScopes", () => {
    it("returns true when scopes is empty", () => {
      expect(shouldSyncUserSettingsForScopes([])).toBe(true);
    });

    it("returns true for user_settings scope", () => {
      expect(shouldSyncUserSettingsForScopes(["user_settings"])).toBe(true);
    });

    it("returns false for unrelated scopes", () => {
      expect(shouldSyncUserSettingsForScopes(["rooms", "friendships"])).toBe(false);
    });
  });
});

// ============================================
// Resync Coordinator State
// ============================================

describe("useWebSocket.sync-machine — resync coordinator state", () => {
  let state: ReturnType<typeof createWebSocketResyncCoordinatorState>;

  beforeEach(() => {
    state = createWebSocketResyncCoordinatorState();
  });

  it("starts with shouldResyncOnConnect as false", () => {
    expect(state.shouldResyncOnConnect).toBe(false);
  });

  it("initializes empty maps and null promises", () => {
    expect(state.resyncGapCooldownRef.size).toBe(0);
    expect(state.conversationResyncInFlight.size).toBe(0);
    expect(state.conversationRefreshInFlight.size).toBe(0);
    expect(state.conversationRefreshTimers.size).toBe(0);
    expect(state.conversationSyncFallbackTimers.size).toBe(0);
    expect(state.conversationListRefreshInFlight).toBeNull();
  });

  it("resyncGapCooldownRef can store conversation timestamps", () => {
    const now = Date.now();
    state.resyncGapCooldownRef.set("conv-1", now);
    expect(state.resyncGapCooldownRef.get("conv-1")).toBe(now);
  });

  it("conversationResyncInFlight can track in-flight promises", async () => {
    let resolveFn: (v: void) => void;
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    state.conversationResyncInFlight.set("conv-1", promise);
    expect(state.conversationResyncInFlight.has("conv-1")).toBe(true);

    resolveFn!();
    await promise;
    state.conversationResyncInFlight.delete("conv-1");
    expect(state.conversationResyncInFlight.has("conv-1")).toBe(false);
  });
});

// ============================================
// State machine transitions
// ============================================

describe("useWebSocket.sync-machine — state transitions", () => {
  let state: ReturnType<typeof createConversationSyncCoordinatorState>;

  beforeEach(() => {
    state = createConversationSyncCoordinatorState();
  });

  it("full join lifecycle: register → acknowledge → drain → remove", () => {
    // 1. User opens conversation — register join intent
    const strategy = registerConversationJoinIntent(state, "conv-1");
    expect(strategy).toBe("initial-sync");
    expect(state.joinedConversationIds.has("conv-1")).toBe(true);

    // 2. WebSocket sends CONVERSATION_JOINED ack
    const drained = drainPendingConversationSync(
      state.pendingConversationSync,
      state.joinedConversationIds,
      ["conv-1"],
    );
    expect(drained).toHaveLength(1);
    expect(drained[0].strategy).toBe("initial-sync");

    acknowledgeConversationJoined(state, "conv-1");
    expect(state.subscribedConversationIds.has("conv-1")).toBe(true);

    // 3. User closes conversation — acknowledge left
    acknowledgeConversationLeft(state, "conv-1");
    expect(state.subscribedConversationIds.has("conv-1")).toBe(false);

    // 4. Remove all tracking (e.g., on logout or hard navigation)
    removeConversationSyncTracking(state, "conv-1");
    expect(state.joinedConversationIds.has("conv-1")).toBe(false);
    expect(state.pendingConversationSync.has("conv-1")).toBe(false);
  });

  it("reconnect lifecycle: disconnect → reconnect → resync", () => {
    // Pre-join two conversations
    registerConversationJoinIntent(state, "conv-1");
    registerConversationJoinIntent(state, "conv-2");
    acknowledgeConversationJoined(state, "conv-1");
    acknowledgeConversationJoined(state, "conv-2");

    // Simulate disconnect
    state.subscribedConversationIds.clear();

    // Simulate reconnect
    const rejoined = registerReconnectConversationJoins(state, true);
    expect(rejoined).toContain("conv-1");
    expect(rejoined).toContain("conv-2");

    // Pending are now reconnect strategy
    expect(state.pendingConversationSync.get("conv-1")).toBe("reconnect");
    expect(state.pendingConversationSync.get("conv-2")).toBe("reconnect");

    // Drain for resync-required
    const drained = drainPendingConversationSyncForResyncRequired(
      state.pendingConversationSync,
      state.joinedConversationIds,
    );
    expect(drained).toHaveLength(2);
    drained.forEach(({ strategy }) => {
      expect(strategy).toBe("reconnect");
    });
  });

  it("resync-required scopes: friendship only does not trigger conversation resync", () => {
    expect(shouldResyncJoinedConversationsForScopes(["friendships"])).toBe(false);
    expect(shouldTriggerFriendshipResyncForScopes(["friendships"])).toBe(true);
    expect(shouldRefreshConversationSummariesForScopes(["friendships"])).toBe(false);
    expect(shouldSyncUserSettingsForScopes(["friendships"])).toBe(false);
  });

  it("user_settings scope only triggers settings sync", () => {
    expect(shouldResyncJoinedConversationsForScopes(["user_settings"])).toBe(false);
    expect(shouldTriggerFriendshipResyncForScopes(["user_settings"])).toBe(false);
    expect(shouldRefreshConversationSummariesForScopes(["user_settings"])).toBe(false);
    expect(shouldSyncUserSettingsForScopes(["user_settings"])).toBe(true);
  });
});
