import { describe, expect, it } from "vitest";
import type { FriendshipCapabilitiesDto } from "@hacom/chat-shared-types/chat";

import type { RelationshipState } from "../../stores/friendshipStore";
import { getFriendshipAction } from "./friendshipAction";

const emptyCapabilities: FriendshipCapabilitiesDto = {
  canSendRequest: false,
  canAccept: false,
  canDecline: false,
  canCancel: false,
  canUnfriend: false,
  canBlock: false,
  canUnblock: false,
  canMessage: false,
};

const notFriend: RelationshipState = {
  kind: "not_friend",
  capabilities: {
    ...emptyCapabilities,
    canSendRequest: true,
  },
};

describe("getFriendshipAction", () => {
  it("renders message for accepted search users even when local store has no relation", () => {
    expect(
      getFriendshipAction(
        {
          id: "u2",
          isFriend: true,
          canAddFriend: false,
          friendshipStatus: "accepted",
        },
        notFriend,
      ),
    ).toEqual({ kind: "message" });
  });

  it("does not render add friend for pending relationships", () => {
    expect(
      getFriendshipAction(
        {
          id: "u2",
          canAddFriend: false,
          friendshipStatus: "pending",
        },
        notFriend,
      ),
    ).toEqual({ kind: "pending" });
  });

  it("renders add friend only for none status with send capability", () => {
    expect(
      getFriendshipAction(
        {
          id: "u2",
          canAddFriend: true,
          friendshipStatus: "none",
        },
        notFriend,
      ),
    ).toEqual({ kind: "add" });
  });

  it("prioritizes backend capabilities over inferred canAddFriend", () => {
    expect(
      getFriendshipAction(
        {
          id: "u2",
          canAddFriend: true,
          friendshipStatus: "none",
          capabilities: {
            canSendRequest: false,
            canMessage: true,
          },
        },
        notFriend,
      ),
    ).toEqual({ kind: "message" });
  });
});
