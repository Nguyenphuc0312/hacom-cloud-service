import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";

const mocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
  getPendingRequests: vi.fn(),
  getSentRequests: vi.fn(),
  getPendingCount: vi.fn(),
}));

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: {
    getFriends: mocks.getFriends,
    getPendingRequests: mocks.getPendingRequests,
    getSentRequests: mocks.getSentRequests,
    getPendingCount: mocks.getPendingCount,
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

  it("refreshDirectory keeps all loaded pages (does not shrink to page 1)", async () => {
    const emptyPage = pageResponse([], {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
    mocks.getPendingRequests.mockResolvedValue(emptyPage);
    mocks.getSentRequests.mockResolvedValue(emptyPage);
    mocks.getPendingCount.mockResolvedValue({
      success: true as const,
      message: "ok",
      data: { count: 0 },
    });

    // User đã cuộn tới trang 2 → 27 bạn đang hiển thị.
    mocks.getFriends
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 20 }, (_, i) => makeRelation(`u${i + 1}`)),
          { page: 1, limit: 20, total: 27, totalPages: 2, hasNext: true, hasPrev: false },
        ),
      )
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 7 }, (_, i) => makeRelation(`u${i + 21}`)),
          { page: 2, limit: 20, total: 27, totalPages: 2, hasNext: false, hasPrev: true },
        ),
      );
    await useFriendshipStore.getState().fetchFriends();
    await useFriendshipStore.getState().loadMoreFriends();
    expect(useFriendshipStore.getState().friends).toHaveLength(27);

    // Một resync/refresh xảy ra (WS reconnect, friend request…). Phải tải gộp 2 trang,
    // KHÔNG cắt về 20. Server trả full 27 trong 1 response (page=1, limit=40).
    mocks.getFriends.mockResolvedValueOnce(
      pageResponse(
        Array.from({ length: 27 }, (_, i) => makeRelation(`u${i + 1}`)),
        { page: 1, limit: 40, total: 27, totalPages: 1, hasNext: false, hasPrev: false },
      ),
    );
    await useFriendshipStore.getState().refreshDirectory();

    const state = useFriendshipStore.getState();
    // Request gộp: page 1, limit = 2 trang × 20 = 40.
    expect(mocks.getFriends).toHaveBeenLastCalledWith(1, 40);
    expect(state.friends).toHaveLength(27); // KHÔNG bị đá về 20
    expect(state.friendsLimit).toBe(20); // page size gốc giữ nguyên cho loadMore
    expect(state.friendsPage).toBe(2); // trang cuối đã tải, không phải 1
  });

  it("load more works across multiple pages (not just once)", async () => {
    // 3 trang: 20 + 20 + 5 = 45 bạn. Bấm "Xem thêm" 2 lần phải ra đủ 45.
    mocks.getFriends
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 20 }, (_, i) => makeRelation(`u${i + 1}`)),
          { page: 1, limit: 20, total: 45, totalPages: 3, hasNext: true, hasPrev: false },
        ),
      )
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 20 }, (_, i) => makeRelation(`u${i + 21}`)),
          { page: 2, limit: 20, total: 45, totalPages: 3, hasNext: true, hasPrev: true },
        ),
      )
      .mockResolvedValueOnce(
        pageResponse(
          Array.from({ length: 5 }, (_, i) => makeRelation(`u${i + 41}`)),
          { page: 3, limit: 20, total: 45, totalPages: 3, hasNext: false, hasPrev: true },
        ),
      );

    await useFriendshipStore.getState().fetchFriends();
    expect(useFriendshipStore.getState().friendsHasNext).toBe(true);

    await useFriendshipStore.getState().loadMoreFriends(); // lần 1 → page 2
    let state = useFriendshipStore.getState();
    expect(state.friends).toHaveLength(40);
    expect(state.friendsPage).toBe(2);
    expect(state.friendsHasNext).toBe(true); // nút VẪN còn

    await useFriendshipStore.getState().loadMoreFriends(); // lần 2 → page 3
    state = useFriendshipStore.getState();
    expect(mocks.getFriends).toHaveBeenLastCalledWith(3, 20);
    expect(state.friends).toHaveLength(45);
    expect(state.friendsHasNext).toBe(false); // hết, nút ẩn
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
