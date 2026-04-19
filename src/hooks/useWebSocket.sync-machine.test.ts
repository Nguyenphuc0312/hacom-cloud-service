import { describe, expect, it } from "vitest";
import {
  drainPendingConversationSync,
  drainPendingConversationSyncForResyncRequired,
  shouldSkipGroupConversationRefreshForCurrentUser,
  shouldUseDeltaConversationRefresh,
  type PendingConversationSyncStrategy,
} from "./useWebSocket";

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
});
