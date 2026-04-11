import { describe, expect, it } from "vitest";
import {
  drainPendingRoomSync,
  drainPendingRoomSyncForResyncRequired,
  type PendingRoomSyncStrategy,
} from "./useWebSocket";

describe("useWebSocket sync machine", () => {
  it("join room + conversation:resynced drains pending room sync deterministically", () => {
    const pending = new Map<string, PendingRoomSyncStrategy>([
      ["room-1", "initial-sync"],
    ]);
    const joined = new Set<string>(["room-1"]);

    const drained = drainPendingRoomSync(pending, joined, ["room-1"]);

    expect(drained).toEqual([{ roomId: "room-1", strategy: "initial-sync" }]);
    expect(pending.has("room-1")).toBe(false);
  });

  it("resync:required drains pending map and normalizes strategy to reconnect when needed", () => {
    const pending = new Map<string, PendingRoomSyncStrategy>([
      ["room-1", "skip"],
      ["room-2", "reconnect"],
    ]);
    const joined = new Set<string>(["room-1", "room-2"]);

    const drained = drainPendingRoomSyncForResyncRequired(pending, joined);

    expect(drained).toEqual([
      { roomId: "room-1", strategy: "reconnect" },
      { roomId: "room-2", strategy: "reconnect" },
    ]);
    expect(pending.size).toBe(0);
  });
});
