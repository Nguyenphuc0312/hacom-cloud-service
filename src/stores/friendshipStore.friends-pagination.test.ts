import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";

const mocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
}));

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: {
    getFriends: mocks.getFriends,
    getPendingRequests: vi.fn(),
    getSentRequests: vi.fn(),
    getPendingCount: vi.fn(),
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { useFriendshipStore } from "./friendshipStore";

const makeRelation = (friendId: string): FriendshipRelationDto => ({
  relationId: `me:${friendId}`,
  pairKey: `me:${friendId}`,
  status: "accepted",
  actorRole: "friend",
  requester: {
    id: "me",
    username: "me",
    displayName: "Me",
    avatarUrl: null,
  },
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
});

const pageResponse = (
  data: FriendshipRelationDto[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  },
) => ({
  success: true as const,
  message: "ok",
  data: {
    data,
    pagination,
  },
});

describe("friendshipStore friends pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFriendshipStore.setState({
      friends: [],
      friendsTotal: 0,
      friendsPage: 0,
      friendsLimit: 20,
      friendsHasNext: false,
      friendsError: null,
      friendsLoadMoreError: null,
      isFriendsLoading: false,
      isFriendsLoadingMore: false,
    });
  });

  it("uses pagination.total for the friends tab count", async () => {
    mocks.getFriends.mockResolvedValueOnce(
      pageResponse(
        Array.from({ length: 20 }, (_, index) => makeRelation(`u${index + 1}`)),
        {
          page: 1,
          limit: 20,
          total: 27,
          totalPages: 2,
          hasNext: true,
          hasPrev: false,
        },
      ),
    );

    await useFriendshipStore.getState().fetchFriends();

    expect(mocks.getFriends).toHaveBeenCalledWith(1, 20);
    expect(useFriendshipStore.getState().friends).toHaveLength(20);
    expect(useFriendshipStore.getState().friendsTotal).toBe(27);
    expect(useFriendshipStore.getState().friendsHasNext).toBe(true);
  });

  it("loads page 2, appends, and deduplicates by user id", async () => {
    mocks.getFriends
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 20 }, (_, index) => makeRelation(`u${index + 1}`)),
          {
            page: 1,
            limit: 20,
            total: 27,
            totalPages: 2,
            hasNext: true,
            hasPrev: false,
          },
        ),
      )
      .mockResolvedValueOnce(
        pageResponse(
          [
            makeRelation("u20"),
            ...Array.from({ length: 7 }, (_, index) =>
              makeRelation(`u${index + 21}`),
            ),
          ],
          {
            page: 2,
            limit: 20,
            total: 27,
            totalPages: 2,
            hasNext: false,
            hasPrev: true,
          },
        ),
      );

    await useFriendshipStore.getState().fetchFriends();
    await useFriendshipStore.getState().loadMoreFriends();

    const state = useFriendshipStore.getState();
    expect(mocks.getFriends).toHaveBeenLastCalledWith(2, 20);
    expect(state.friends.map((friend) => friend.id)).toHaveLength(27);
    expect(new Set(state.friends.map((friend) => friend.id))).toHaveProperty(
      "size",
      27,
    );
    expect(state.friendsHasNext).toBe(false);
  });

  it("does not load more while a load-more request is active", async () => {
    useFriendshipStore.setState({
      friendsHasNext: true,
      friendsPage: 1,
      friendsLimit: 20,
      isFriendsLoadingMore: true,
    });

    await useFriendshipStore.getState().loadMoreFriends();

    expect(mocks.getFriends).not.toHaveBeenCalled();
  });
});
