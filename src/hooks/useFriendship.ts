/**
 * @fileoverview useFriendship hook
 * Friendship directory backed by a centralized zustand store.
 */

import { useCallback, useEffect } from "react";
import type {
  FriendshipActorRole,
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
} from "@hacom/chat-shared-types/chat";
import type { ApiResponse } from "@hacom/chat-shared-types/core";
import { friendshipApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { useAuthStore, type User } from "../stores";
import {
  EMPTY_CAPABILITIES,
  NONE_RELATION_CAPABILITIES,
  applyRelationToSnapshot,
  deriveRelationshipState,
  extractWriteRelation,
  mapRelationToBlockedRecord,
  mapRelationToFriendRecord,
  mapRelationToRequestRecord,
  computeFriendshipPairKey,
  removeByRelationId,
  toFriendshipUser,
  upsertFront,
  useFriendshipStore,
  type BlockedUser,
  type FriendRecord,
  type FriendRequest,
  type FriendshipDirectorySnapshot,
  type FriendshipStatusType,
  type RelationshipState,
} from "../stores/friendshipStore";

export type {
  BlockedUser,
  FriendRecord,
  FriendRequest,
  FriendshipStatusType,
  RelationshipState,
};

export {
  EMPTY_CAPABILITIES,
  NONE_RELATION_CAPABILITIES,
  toFriendshipUser,
  mapRelationToFriendRecord,
  mapRelationToRequestRecord,
  mapRelationToBlockedRecord,
  applyRelationToSnapshot,
  deriveRelationshipState,
};

interface UseFriendshipReturn {
  friends: FriendRecord[];
  isFriendsLoading: boolean;
  fetchFriends: () => Promise<void>;

  incomingRequests: FriendRequest[];
  isIncomingLoading: boolean;
  fetchIncomingRequests: () => Promise<void>;

  sentRequests: FriendRequest[];
  isSentLoading: boolean;
  fetchSentRequests: () => Promise<void>;
  sentCount: number;

  pendingCount: number;
  fetchPendingCount: () => Promise<void>;

  blockedUsers: BlockedUser[];
  isBlockedLoading: boolean;
  fetchBlockedUsers: () => Promise<void>;

  refreshDirectory: () => Promise<void>;

  sendFriendRequest: (userId: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  rejectFriendRequest: (requestId: string) => Promise<boolean>;
  cancelFriendRequest: (requestId: string) => Promise<boolean>;
  removeFriend: (friendshipId: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;

  getRelationshipState: (
    userId: string,
    currentUserId?: string | null,
  ) => RelationshipState;

  checkFriendshipStatus: (userId: string) => Promise<{
    status: FriendshipStatusType;
    friendshipId?: string;
    capabilities: FriendshipCapabilitiesDto;
    actorRole: FriendshipActorRole;
  }>;
}

type WriteResyncReason =
  | "socket_reconnect"
  | "missing_relation_payload"
  | "explicit_refresh";

const nowIso = (): string => new Date().toISOString();

const nowMs = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const buildActionKey = (action: string, targetId: string): string =>
  `${action}:${targetId}`;

const toAuthUser = (
  user: ReturnType<typeof useAuthStore.getState>["user"],
): User => {
  if (!user) {
    return {
      id: "me",
      username: "me",
      status: "offline",
    };
  }

  return {
    id: user.id,
    username: user.username ?? user.email ?? user.phone ?? user.id,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    avatar: user.avatar ?? undefined,
    status: user.status ?? "offline",
  };
};

const toUnknownUser = (userId: string): User => ({
  id: userId,
  username: "",
  status: "offline",
});

const optimisticSendRequestSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  userId: string,
  currentUser: User,
): FriendshipDirectorySnapshot => {
  const timestamp = nowIso();
  const relationId = `optimistic:request:${userId}:${Date.now()}`;
  const pairKey = computeFriendshipPairKey(currentUser.id, userId);

  const optimisticRequest: FriendRequest = {
    relationId,
    pairKey,
    createdAt: timestamp,
    updatedAt: timestamp,
    requester: currentUser,
    addressee: toUnknownUser(userId),
    friend: null,
    status: "pending" as FriendshipStatusType,
    actorRole: "requester",
    capabilities: {
      ...EMPTY_CAPABILITIES,
      canCancel: true,
      canBlock: true,
    },
    actionResult: "created",
  };

  return {
    ...snapshot,
    sentRequests: upsertFront(snapshot.sentRequests, optimisticRequest),
  };
};

const optimisticAcceptSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  requestId: string,
): FriendshipDirectorySnapshot => {
  const incoming = snapshot.incomingRequests.find(
    (item) => item.relationId === requestId,
  );
  const nextIncoming = removeByRelationId(snapshot.incomingRequests, requestId);

  let nextFriends = snapshot.friends;

  if (incoming) {
    const friendRecord: FriendRecord = {
      ...incoming.requester,
      relationId: incoming.relationId,
      capabilities: {
        ...EMPTY_CAPABILITIES,
        canUnfriend: true,
        canBlock: true,
      },
      actorRole: "friend",
      relationStatus: "accepted" as FriendshipStatusType,
      actionResult: "accepted",
      createdAt: incoming.createdAt,
      updatedAt: nowIso(),
    };

    nextFriends = upsertFront(snapshot.friends, friendRecord);
  }

  return {
    ...snapshot,
    incomingRequests: nextIncoming,
    friends: nextFriends,
    pendingCount: nextIncoming.length,
  };
};

const optimisticRejectSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  requestId: string,
): FriendshipDirectorySnapshot => {
  const nextIncoming = removeByRelationId(snapshot.incomingRequests, requestId);

  return {
    ...snapshot,
    incomingRequests: nextIncoming,
    pendingCount: nextIncoming.length,
  };
};

const optimisticCancelSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  requestId: string,
): FriendshipDirectorySnapshot => {
  return {
    ...snapshot,
    sentRequests: removeByRelationId(snapshot.sentRequests, requestId),
  };
};

const optimisticRemoveFriendSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  friendshipId: string,
): FriendshipDirectorySnapshot => ({
  ...snapshot,
  friends: removeByRelationId(snapshot.friends, friendshipId),
});

const optimisticBlockSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  userId: string,
): FriendshipDirectorySnapshot => {
  const timestamp = nowIso();
  const existingFriend = snapshot.friends.find((item) => item.id === userId);
  const incomingRequest = snapshot.incomingRequests.find(
    (item) => item.requester.id === userId,
  );
  const sentRequest = snapshot.sentRequests.find(
    (item) => item.addressee.id === userId,
  );

  const relationId =
    existingFriend?.relationId ??
    incomingRequest?.relationId ??
    sentRequest?.relationId ??
    `optimistic:block:${userId}:${Date.now()}`;

  const profile =
    existingFriend ??
    incomingRequest?.requester ??
    sentRequest?.addressee ??
    toUnknownUser(userId);

  const blocked: BlockedUser = {
    ...profile,
    relationId,
    capabilities: {
      ...EMPTY_CAPABILITIES,
      canUnblock: true,
    },
    actorRole: "requester",
    relationStatus: "blocked" as FriendshipStatusType,
    actionResult: "blocked",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const nextIncoming = snapshot.incomingRequests.filter(
    (item) => item.requester.id !== userId,
  );

  return {
    ...snapshot,
    friends: snapshot.friends.filter((item) => item.id !== userId),
    incomingRequests: nextIncoming,
    sentRequests: snapshot.sentRequests.filter(
      (item) => item.addressee.id !== userId,
    ),
    blockedUsers: upsertFront(snapshot.blockedUsers, blocked),
    pendingCount: nextIncoming.length,
  };
};

const optimisticUnblockSnapshot = (
  snapshot: FriendshipDirectorySnapshot,
  userId: string,
): FriendshipDirectorySnapshot => ({
  ...snapshot,
  blockedUsers: snapshot.blockedUsers.filter((item) => item.id !== userId),
});

export const useFriendship = (): UseFriendshipReturn => {
  const friends = useFriendshipStore((state) => state.friends);
  const isFriendsLoading = useFriendshipStore(
    (state) => state.isFriendsLoading,
  );
  const fetchFriends = useFriendshipStore((state) => state.fetchFriends);
  const incomingRequests = useFriendshipStore(
    (state) => state.incomingRequests,
  );
  const isIncomingLoading = useFriendshipStore(
    (state) => state.isIncomingLoading,
  );
  const fetchIncomingRequests = useFriendshipStore(
    (state) => state.fetchIncomingRequests,
  );
  const sentRequests = useFriendshipStore((state) => state.sentRequests);
  const isSentLoading = useFriendshipStore((state) => state.isSentLoading);
  const fetchSentRequests = useFriendshipStore(
    (state) => state.fetchSentRequests,
  );
  const sentCount = useFriendshipStore((state) => state.sentCount);
  const pendingCount = useFriendshipStore((state) => state.pendingCount);
  const fetchPendingCount = useFriendshipStore(
    (state) => state.fetchPendingCount,
  );
  const blockedUsers = useFriendshipStore((state) => state.blockedUsers);
  const isBlockedLoading = useFriendshipStore(
    (state) => state.isBlockedLoading,
  );
  const fetchBlockedUsers = useFriendshipStore(
    (state) => state.fetchBlockedUsers,
  );
  const hasHydrated = useFriendshipStore((state) => state.hasHydrated);
  const refreshDirectoryStore = useFriendshipStore(
    (state) => state.refreshDirectory,
  );

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const refreshDirectory = useCallback(async () => {
    await refreshDirectoryStore({
      reason: "explicit_refresh",
      includeFullSnapshot: true,
    });
  }, [refreshDirectoryStore]);

  useEffect(() => {
    if (!isAuthenticated || hasHydrated) {
      return;
    }

    void refreshDirectory();
  }, [hasHydrated, isAuthenticated, refreshDirectory]);

  const runOptimisticWrite = useCallback(
    async (
      actionKey: string,
      request: () => Promise<ApiResponse<unknown>>,
      optimisticUpdate?: (
        snapshot: FriendshipDirectorySnapshot,
      ) => FriendshipDirectorySnapshot,
      fallbackResyncReason: WriteResyncReason = "explicit_refresh",
    ): Promise<boolean> => {
      const state = useFriendshipStore.getState();
      if (state.isActionPending(actionKey)) {
        return false;
      }

      const startedAt = nowMs();
      const snapshot = state.createSnapshot();

      state.setActionPending(actionKey, true);
      if (optimisticUpdate) {
        state.applySnapshot(optimisticUpdate(snapshot));
      }

      try {
        const response = await request();
        const payload = unwrapApiSuccess(response);
        const relation = extractWriteRelation(payload);
        const store = useFriendshipStore.getState();

        if (relation) {
          store.applyRelation(relation);
        } else {
          store.markUiInconsistency(`write_missing_relation:${actionKey}`);
        }

        store.triggerResync(fallbackResyncReason);

        store.recordActionResult(actionKey, "success", nowMs() - startedAt);
        return true;
      } catch {
        const store = useFriendshipStore.getState();
        store.restoreSnapshot(snapshot);
        store.recordActionResult(actionKey, "rollback", nowMs() - startedAt);
        return false;
      } finally {
        useFriendshipStore.getState().setActionPending(actionKey, false);
      }
    },
    [],
  );

  const sendFriendRequest = useCallback(
    async (userId: string): Promise<boolean> => {
      const currentUser = toAuthUser(useAuthStore.getState().user);

      return runOptimisticWrite(
        buildActionKey("send", userId),
        () => friendshipApi.sendFriendRequest(userId),
        (snapshot) =>
          optimisticSendRequestSnapshot(snapshot, userId, currentUser),
      );
    },
    [runOptimisticWrite],
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("accept", requestId),
        () => friendshipApi.acceptFriendRequest(requestId),
        (snapshot) => optimisticAcceptSnapshot(snapshot, requestId),
      );
    },
    [runOptimisticWrite],
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("reject", requestId),
        () => friendshipApi.rejectFriendRequest(requestId),
        (snapshot) => optimisticRejectSnapshot(snapshot, requestId),
      );
    },
    [runOptimisticWrite],
  );

  const cancelFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("cancel", requestId),
        () => friendshipApi.cancelFriendRequest(requestId),
        (snapshot) => optimisticCancelSnapshot(snapshot, requestId),
      );
    },
    [runOptimisticWrite],
  );

  const removeFriend = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("unfriend", friendshipId),
        () => friendshipApi.removeFriend(friendshipId),
        (snapshot) => optimisticRemoveFriendSnapshot(snapshot, friendshipId),
      );
    },
    [runOptimisticWrite],
  );

  const blockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("block", userId),
        () => friendshipApi.blockUser(userId),
        (snapshot) => optimisticBlockSnapshot(snapshot, userId),
      );
    },
    [runOptimisticWrite],
  );

  const unblockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      return runOptimisticWrite(
        buildActionKey("unblock", userId),
        () => friendshipApi.unblockUser(userId),
        (snapshot) => optimisticUnblockSnapshot(snapshot, userId),
      );
    },
    [runOptimisticWrite],
  );

  const getRelationshipState = useCallback(
    (userId: string, currentUserId?: string | null): RelationshipState => {
      return deriveRelationshipState({
        userId,
        currentUserId,
        blockedUsers,
        friends,
        incomingRequests,
        sentRequests,
      });
    },
    [blockedUsers, friends, incomingRequests, sentRequests],
  );

  const checkFriendshipStatus = useCallback(async (userId: string) => {
    try {
      const response = await friendshipApi.getFriendshipStatus(userId);
      const data = unwrapApiSuccess(response);
      const relation =
        data &&
        typeof data === "object" &&
        (data as { friendship?: FriendshipRelationDto }).friendship
          ? (data as { friendship: FriendshipRelationDto }).friendship
          : null;

      if (!relation) {
        return {
          status: "none" as FriendshipStatusType,
          capabilities: NONE_RELATION_CAPABILITIES,
          actorRole: "none" as FriendshipActorRole,
        };
      }

      useFriendshipStore.getState().applyRelation(relation);

      return {
        status: relation.status,
        friendshipId: relation.relationId || undefined,
        capabilities: relation.capabilities,
        actorRole: relation.actorRole,
      };
    } catch {
      return {
        status: "none" as FriendshipStatusType,
        capabilities: NONE_RELATION_CAPABILITIES,
        actorRole: "none" as FriendshipActorRole,
      };
    }
  }, []);

  return {
    friends,
    isFriendsLoading,
    fetchFriends,
    incomingRequests,
    isIncomingLoading,
    fetchIncomingRequests,
    sentRequests,
    isSentLoading,
    fetchSentRequests,
    sentCount,
    pendingCount,
    fetchPendingCount,
    blockedUsers,
    isBlockedLoading,
    fetchBlockedUsers,
    refreshDirectory,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    getRelationshipState,
    checkFriendshipStatus,
  };
};

export default useFriendship;
