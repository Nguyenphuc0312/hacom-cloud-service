import { describe, expect, it } from "vitest";
import { FriendshipStatus } from "@hacom/chat-shared-types/chat";
import type { FriendRequest } from "../../stores/friendshipStore";
import {
  getFriendRequestDisplayLabel,
  getFriendRequestDisplayUser,
  getFriendRequestUsernameLabel,
} from "./requestDisplay";

const makeRequest = (overrides?: Partial<FriendRequest>): FriendRequest => ({
  relationId: "fr-1",
  pairKey: "u1:u2",
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z",
  requester: {
    id: "u1",
    username: "requester",
    firstName: "Requester User",
    status: "offline",
  },
  addressee: {
    id: "u2",
    username: "addressee",
    firstName: "Addressee User",
    status: "offline",
  },
  friend: null,
  status: FriendshipStatus.PENDING,
  actorRole: "requester",
  capabilities: {
    canSendRequest: false,
    canAccept: false,
    canDecline: false,
    canCancel: true,
    canUnfriend: false,
    canBlock: true,
    canUnblock: false,
    canMessage: false,
  },
  actionResult: "created",
  ...overrides,
});

describe("friend request display helpers", () => {
  it("uses addressee for sent requests and requester for incoming requests", () => {
    const request = makeRequest();

    expect(getFriendRequestDisplayUser(request, "sent").id).toBe("u2");
    expect(getFriendRequestDisplayUser(request, "incoming").id).toBe("u1");
  });

  it("prefers friend projection when present", () => {
    const request = makeRequest({
      friend: {
        id: "u2",
        username: "friend-user",
        firstName: "Friend User",
        status: "offline",
      },
    });

    expect(getFriendRequestDisplayUser(request, "sent").username).toBe(
      "friend-user",
    );
  });

  it("never uses UUID-like username as primary label", () => {
    const label = getFriendRequestDisplayLabel({
      id: "u2",
      username: "5983da26-0000-4000-8000-000000000000",
      status: "offline",
    });

    expect(label).toBe("Người dùng");
    expect(
      getFriendRequestUsernameLabel({
        id: "u2",
        username: "5983da26-0000-4000-8000-000000000000",
        status: "offline",
      }),
    ).toBeNull();
  });
});
