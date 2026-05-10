import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FriendshipStatus,
  type FriendshipRelationDto,
} from "@hacom/chat-shared-types/chat";

vi.mock("../services/api", () => ({
  friendshipApi: {
    getFriends: vi.fn(),
    getPendingRequests: vi.fn(),
    getSentRequests: vi.fn(),
    getBlockedUsers: vi.fn(),
    getPendingCount: vi.fn(),
  },
}));

import { friendshipApi } from "../services/api";
import { useFriendshipStore, type FriendshipDirectorySnapshot } from "./friendshipStore";

const EMPTY_SNAPSHOT: FriendshipDirectorySnapshot = {
  friends: [],
  incomingRequests: [],
  sentRequests: [],
  blockedUsers: [],
  pendingCount: 0,
  sentCount: 0,
};

const makeSuccess = <T,>(data: T) => ({
  success: true as const,
  statusCode: 200,
  message: "OK",
  data,
});

const makeRelation = (
  relationId: string,
  overrides?: Partial<FriendshipRelationDto>,
): FriendshipRelationDto => ({
  relationId,
  pairKey: "u1:u2",
  status: FriendshipStatus.PENDING,
  actorRole: "requester",
  requester: {
    id: "u1",
    username: "requester",
    displayName: "Requester User",
    avatarUrl: null,
  },
  addressee: {
    id: "u2",
    username: "addressee",
    displayName: "Addressee User",
    avatarUrl: null,
  },
  friend: null,
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
  updatedAt: "2026-05-10T00:00:00.000Z",
  createdAt: "2026-05-10T00:00:00.000Z",
  ...overrides,
});

describe("friendshipStore request lists", () => {
  beforeEach(() => {
    useFriendshipStore.getState().applySnapshot(EMPTY_SNAPSHOT);
    useFriendshipStore.setState({
      isSentLoading: false,
      isIncomingLoading: false,
      hasHydrated: false,
      lastSyncedAt: null,
    });
    vi.clearAllMocks();
  });

  it("dedupes sent requests by pairKey and keeps API pagination total", async () => {
    vi.mocked(friendshipApi.getSentRequests).mockResolvedValue(
      makeSuccess({
        data: [
          makeRelation("optimistic:1", {
            updatedAt: "2026-05-10T00:00:00.000Z",
            addressee: {
              id: "u2",
              username: "5983da26-0000-4000-8000-000000000000",
              displayName: null,
              avatarUrl: null,
            },
          }),
          makeRelation("fr-real-1", {
            updatedAt: "2026-05-10T01:00:00.000Z",
          }),
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 3,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      }),
    );

    await useFriendshipStore.getState().fetchSentRequests();

    const state = useFriendshipStore.getState();
    expect(state.sentRequests).toHaveLength(1);
    expect(state.sentRequests[0]?.relationId).toBe("fr-real-1");
    expect(state.sentCount).toBe(3);
  });

  it("uses pending count from API even when incoming list is already loaded", async () => {
    useFriendshipStore.getState().applySnapshot({
      ...EMPTY_SNAPSHOT,
      incomingRequests: [
        {
          relationId: "fr-existing-1",
          pairKey: "u1:u3",
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          requester: {
            id: "u3",
            username: "receiver",
            firstName: "Receiver User",
            status: "offline",
          },
          addressee: {
            id: "u1",
            username: "requester",
            firstName: "Requester User",
            status: "offline",
          },
          friend: null,
          status: FriendshipStatus.PENDING,
          actorRole: "addressee",
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
        },
      ],
      pendingCount: 1,
    });

    vi.mocked(friendshipApi.getPendingCount).mockResolvedValue(
      makeSuccess({ count: 7 }),
    );

    await useFriendshipStore.getState().fetchPendingCount();

    expect(useFriendshipStore.getState().pendingCount).toBe(7);
  });
});
