import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";

const mocks = vi.hoisted(() => ({ getFriends: vi.fn() }));

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: { getFriends: mocks.getFriends },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useFriendshipStore } from "./friendshipStore";
import { useEnrichedProfileStore } from "./enrichedProfileStore";

const makeRelation = (
  friendId: string,
  alias: string | null,
): FriendshipRelationDto =>
  ({
    relationId: `me:${friendId}`,
    pairKey: `me:${friendId}`,
    status: "accepted",
    actorRole: "friend",
    alias,
    requester: { id: "me", username: "me", displayName: "Me", avatarUrl: null },
    addressee: {
      id: friendId,
      username: friendId,
      displayName: friendId,
      avatarUrl: null,
    },
    friend: {
      id: friendId,
      username: friendId,
      displayName: friendId,
      avatarUrl: null,
    },
    capabilities: {
      canSendRequest: false,
      canAccept: false,
      canDecline: false,
      canCancel: false,
      canUnfriend: true,
      canBlock: true,
      canUnblock: false,
      canMessage: true,
    },
    actionResult: "none",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
  }) as FriendshipRelationDto;

const page = (data: FriendshipRelationDto[]) => ({
  success: true as const,
  message: "ok",
  data: {
    data,
    pagination: {
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  },
});

describe("friendshipStore alias sync into enrichedProfileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friends: [], hasHydrated: false });
  });

  it("setLocalAlias sets then clears the enriched name", () => {
    const { setLocalAlias } = useFriendshipStore.getState();
    setLocalAlias("u1", "Sếp Nam");
    expect(useEnrichedProfileStore.getState().nameByUserId["u1"]).toBe("Sếp Nam");

    setLocalAlias("u1", null);
    expect(useEnrichedProfileStore.getState().nameByUserId["u1"]).toBeUndefined();
  });

  it("fetchFriends clears a stale alias removed server-side", async () => {
    // Alias present in a first fetch...
    mocks.getFriends.mockResolvedValueOnce(page([makeRelation("u1", "Sếp Nam")]));
    await useFriendshipStore.getState().fetchFriends();
    expect(useEnrichedProfileStore.getState().nameByUserId["u1"]).toBe("Sếp Nam");

    // ...then removed on the server; a refetch must drop the stale alias.
    mocks.getFriends.mockResolvedValueOnce(page([makeRelation("u1", null)]));
    await useFriendshipStore.getState().fetchFriends();
    expect(useEnrichedProfileStore.getState().nameByUserId["u1"]).toBeUndefined();
  });
});
