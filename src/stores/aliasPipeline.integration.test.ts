import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";

const mocks = vi.hoisted(() => ({ getFriends: vi.fn() }));

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: { getFriends: mocks.getFriends },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useResolvedDisplayName } from "./useResolvedDisplayName";
import { useEnrichedProfileStore } from "./enrichedProfileStore";
import { useFriendshipStore } from "./friendshipStore";

/**
 * Dựng payload GIỐNG BE sau khi sửa: `friend.displayName` là TÊN THẬT,
 * alias đi riêng. Trước khi sửa, BE trả displayName === alias và tên thật
 * biến mất hoàn toàn — test này khoá lại hành vi đúng ở phía FE.
 */
const relation = (
  friendId: string,
  realName: string,
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
      displayName: realName,
      avatarUrl: null,
    },
    friend: {
      id: friendId,
      username: friendId,
      displayName: realName,
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
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  }) as FriendshipRelationDto;

const pageOf = (data: FriendshipRelationDto[]) => ({
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

describe("alias pipeline: fetchFriends → display name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friends: [], friendByUserId: {}, hasHydrated: false });
  });

  it("shows the alias for an aliased friend and the real name for the rest", async () => {
    mocks.getFriends.mockResolvedValueOnce(
      pageOf([
        relation("u1", "Nguyễn Thế Huy Hoàng", "Sếp Hoàng"),
        relation("u2", "Trần Vũ Đại", null),
      ]),
    );
    await useFriendshipStore.getState().fetchFriends();

    const aliased = renderHook(() => useResolvedDisplayName("u1", "raw-1"));
    expect(aliased.result.current).toBe("Sếp Hoàng");

    const plain = renderHook(() => useResolvedDisplayName("u2", "Trần Vũ Đại"));
    expect(plain.result.current).toBe("Trần Vũ Đại");
  });

  it("keeps showing the alias after the real name is enriched later", async () => {
    mocks.getFriends.mockResolvedValueOnce(
      pageOf([relation("u1", "Nguyễn Thế Huy Hoàng", "Sếp Hoàng")]),
    );
    await useFriendshipStore.getState().fetchFriends();

    // enrichUserProfile về SAU và ghi tên thật vào nameByUserId — alias vẫn phải thắng.
    useEnrichedProfileStore.getState().setEnrichedName("u1", "Nguyễn Thế Huy Hoàng");

    const { result } = renderHook(() => useResolvedDisplayName("u1", "raw"));
    expect(result.current).toBe("Sếp Hoàng");
  });

  it("drops back to the real name when the alias is removed server-side", async () => {
    mocks.getFriends.mockResolvedValueOnce(
      pageOf([relation("u1", "Nguyễn Thế Huy Hoàng", "Sếp Hoàng")]),
    );
    await useFriendshipStore.getState().fetchFriends();

    mocks.getFriends.mockResolvedValueOnce(
      pageOf([relation("u1", "Nguyễn Thế Huy Hoàng", null)]),
    );
    await useFriendshipStore.getState().fetchFriends();

    const { result } = renderHook(() =>
      useResolvedDisplayName("u1", "Nguyễn Thế Huy Hoàng"),
    );
    expect(result.current).toBe("Nguyễn Thế Huy Hoàng");
  });
});
