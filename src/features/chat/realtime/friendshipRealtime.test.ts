import { describe, expect, it } from "vitest";
import {
  toFriendshipRealtimeDetail,
  type FriendshipRealtimeDetail,
} from "./friendshipRealtime";

describe("toFriendshipRealtimeDetail", () => {
  it("extracts canonical relation payload", () => {
    const detail: FriendshipRealtimeDetail = toFriendshipRealtimeDetail(
      "friendship:request:created",
      {
        eventId: "evt-123",
        targetUserId: "u2",
        actorUserId: "u1",
        occurredAt: "2026-04-07T00:00:00.000Z",
        relation: {
          relationId: "fr-1",
          pairKey: "u1:u2",
          status: "pending",
          actorRole: "addressee",
          requester: {
            id: "u1",
            username: "u1",
            displayName: "User One",
            avatarUrl: null,
          },
          addressee: {
            id: "u2",
            username: "u2",
            displayName: "User Two",
            avatarUrl: null,
          },
          friend: null,
          capabilities: {
            canSendRequest: false,
            canAccept: true,
            canDecline: true,
            canCancel: false,
            canUnfriend: false,
            canBlock: true,
            canUnblock: false,
            canMessage: false,
          },
          actionResult: "created",
          updatedAt: "2026-04-07T00:00:00.000Z",
          createdAt: "2026-04-07T00:00:00.000Z",
        },
      },
    );

    expect(detail.eventType).toBe("friendship:request:created");
    expect(detail.eventId).toBe("evt-123");
    expect(detail.targetUserId).toBe("u2");
    expect(detail.actorUserId).toBe("u1");
    expect(detail.relation?.relationId).toBe("fr-1");
    expect(detail.status).toBe("pending");
  });

  it("falls back to top-level status for legacy payloads", () => {
    const detail = toFriendshipRealtimeDetail("friend:status:changed", {
      status: "blocked",
      friendshipId: "fr-2",
    });

    expect(detail.relation).toBeNull();
    expect(detail.status).toBe("blocked");
  });
});
