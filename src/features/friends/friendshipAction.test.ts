import { describe, expect, it } from "vitest";
import type { FriendshipCapabilitiesDto } from "@hacom/chat-shared-types/chat";

import type { RelationshipState } from "../../stores/friendshipStore";
import {
  filterFriendSuggestions,
  getFriendshipAction,
} from "./friendshipAction";

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

  it("does not render add friend when canAddFriend is false without send capability", () => {
    expect(
      getFriendshipAction(
        {
          id: "u2",
          canAddFriend: false,
          friendshipStatus: "none",
        },
        notFriend,
      ),
    ).not.toEqual({ kind: "add" });
  });
});

describe("filterFriendSuggestions", () => {
  const getRelationshipState = (userId: string): RelationshipState =>
    userId === "loaded-friend"
      ? {
          kind: "friend",
          friendshipId: "friendship-1",
          capabilities: {
            ...emptyCapabilities,
            canMessage: true,
          },
        }
      : notFriend;

  it("keeps only addable suggestions and deduplicates by id", () => {
    const users = [
      {
        id: "self",
        canAddFriend: true,
        friendshipStatus: "none" as const,
      },
      {
        id: "friend-by-flag",
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted" as const,
      },
      {
        id: "friend-by-status",
        canAddFriend: false,
        friendshipStatus: "accepted" as const,
      },
      {
        id: "loaded-friend",
        canAddFriend: true,
        friendshipStatus: "none" as const,
      },
      {
        id: "pending",
        canAddFriend: false,
        friendshipStatus: "pending" as const,
      },
      {
        id: "not-addable",
        canAddFriend: false,
        friendshipStatus: "none" as const,
      },
      {
        id: "missing-contract",
      },
      {
        id: "addable",
        canAddFriend: true,
        friendshipStatus: "none" as const,
      },
      {
        id: "addable",
        canAddFriend: true,
        friendshipStatus: "none" as const,
      },
    ];

    expect(
      filterFriendSuggestions(users, {
        currentUserId: "self",
        friendIds: new Set(["friend-by-loaded-page"]),
        getRelationshipState,
      }).map((user) => user.id),
    ).toEqual(["addable"]);
  });

  it("uses the same action resolver as search results before keeping a suggestion", () => {
    const suggestion = {
      id: "candidate",
      canAddFriend: true,
      friendshipStatus: "none" as const,
    };

    expect(getFriendshipAction(suggestion, notFriend)).toEqual({ kind: "add" });
    expect(
      filterFriendSuggestions([suggestion], {
        currentUserId: "self",
        getRelationshipState: () => notFriend,
      }),
    ).toEqual([suggestion]);
  });
});
