/**
 * @fileoverview useFriendship hook
 * Friendship directory driven by backend relation DTO contract.
 */

import { useCallback, useState } from "react";
import type {
  FriendshipActionResult,
  FriendshipActorRole,
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
} from "@hacom/chat-shared-types";
import { friendshipApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import type { User } from "../stores/authStore";

export type FriendshipStatusType = FriendshipRelationDto["status"];

export interface FriendRequest {
  relationId: string;
  createdAt: string;
  updatedAt: string;
  requester: User;
  addressee: User;
  friend: User | null;
  status: FriendshipStatusType;
  actorRole: FriendshipActorRole;
  capabilities: FriendshipCapabilitiesDto;
  actionResult: FriendshipActionResult;
}

export interface FriendRecord extends User {
  relationId: string;
  capabilities: FriendshipCapabilitiesDto;
  actorRole: FriendshipActorRole;
  relationStatus: FriendshipStatusType;
  actionResult: FriendshipActionResult;
}

export interface BlockedUser extends User {
  relationId: string;
  capabilities: FriendshipCapabilitiesDto;
  actorRole: FriendshipActorRole;
  relationStatus: FriendshipStatusType;
  actionResult: FriendshipActionResult;
}

const EMPTY_CAPABILITIES: FriendshipCapabilitiesDto = {
  canSendRequest: false,
  canAccept: false,
  canDecline: false,
  canCancel: false,
  canUnfriend: false,
  canBlock: false,
  canUnblock: false,
  canMessage: false,
};

const NONE_RELATION_CAPABILITIES: FriendshipCapabilitiesDto = {
  ...EMPTY_CAPABILITIES,
  canSendRequest: true,
  canBlock: true,
};

export type RelationshipState =
  | { kind: "self"; capabilities: FriendshipCapabilitiesDto }
  | { kind: "not_friend"; capabilities: FriendshipCapabilitiesDto }
  | {
      kind: "outgoing_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "incoming_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "friend";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "blocked";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
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

export const toFriendshipUser = (
  user:
    | FriendshipRelationDto["requester"]
    | FriendshipRelationDto["friend"]
    | null,
): User | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    firstName: user.displayName ?? undefined,
    lastName: undefined,
    avatar: user.avatarUrl ?? undefined,
    status: "offline",
  };
};

const isRelationArrayPayload = (
  payload: unknown,
): payload is FriendshipRelationDto[] => {
  return Array.isArray(payload);
};

const asRelations = (payload: unknown): FriendshipRelationDto[] => {
  if (isRelationArrayPayload(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data as FriendshipRelationDto[];
  }

  if (
    record.data &&
    typeof record.data === "object" &&
    Array.isArray((record.data as Record<string, unknown>).data)
  ) {
    return (record.data as Record<string, unknown>)
      .data as FriendshipRelationDto[];
  }

  return [];
};

const toFriendRecord = (
  relation: FriendshipRelationDto,
): FriendRecord | null => {
  const friend = toFriendshipUser(relation.friend);
  if (!friend) {
    return null;
  }

  return {
    ...friend,
    relationId: relation.relationId,
    capabilities: relation.capabilities,
    actorRole: relation.actorRole,
    relationStatus: relation.status,
    actionResult: relation.actionResult,
  };
};

const toRequestRecord = (
  relation: FriendshipRelationDto,
): FriendRequest | null => {
  const requester = toFriendshipUser(relation.requester);
  const addressee = toFriendshipUser(relation.addressee);

  if (!requester || !addressee) {
    return null;
  }

  return {
    relationId: relation.relationId,
    createdAt: relation.createdAt,
    updatedAt: relation.updatedAt,
    requester,
    addressee,
    friend: toFriendshipUser(relation.friend),
    status: relation.status,
    actorRole: relation.actorRole,
    capabilities: relation.capabilities,
    actionResult: relation.actionResult,
  };
};

const toBlockedRecord = (
  relation: FriendshipRelationDto,
): BlockedUser | null => {
  const friend = toFriendshipUser(relation.friend);
  if (!friend) {
    return null;
  }

  return {
    ...friend,
    relationId: relation.relationId,
    capabilities: relation.capabilities,
    actorRole: relation.actorRole,
    relationStatus: relation.status,
    actionResult: relation.actionResult,
  };
};

const emitFriendUpdated = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("friend:updated"));
};

interface DeriveRelationshipStateInput {
  userId: string;
  currentUserId?: string | null;
  blockedUsers: BlockedUser[];
  friends: FriendRecord[];
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
}

export const deriveRelationshipState = (
  input: DeriveRelationshipStateInput,
): RelationshipState => {
  const {
    userId,
    currentUserId,
    blockedUsers,
    friends,
    incomingRequests,
    sentRequests,
  } = input;

  if (currentUserId && userId === currentUserId) {
    return { kind: "self", capabilities: EMPTY_CAPABILITIES };
  }

  const blocked = blockedUsers.find((item) => item.id === userId);
  if (blocked) {
    return {
      kind: "blocked",
      friendshipId: blocked.relationId,
      capabilities: blocked.capabilities,
    };
  }

  const friend = friends.find((item) => item.id === userId);
  if (friend) {
    return {
      kind: "friend",
      friendshipId: friend.relationId,
      capabilities: friend.capabilities,
    };
  }

  const incoming = incomingRequests.find(
    (item) => item.requester.id === userId,
  );
  if (incoming) {
    return {
      kind: "incoming_request",
      requestId: incoming.relationId,
      capabilities: incoming.capabilities,
    };
  }

  const outgoing = sentRequests.find((item) => item.addressee.id === userId);
  if (outgoing) {
    return {
      kind: "outgoing_request",
      requestId: outgoing.relationId,
      capabilities: outgoing.capabilities,
    };
  }

  return { kind: "not_friend", capabilities: NONE_RELATION_CAPABILITIES };
};

export const mapRelationToFriendRecord = toFriendRecord;
export const mapRelationToRequestRecord = toRequestRecord;
export const mapRelationToBlockedRecord = toBlockedRecord;

export const useFriendship = (): UseFriendshipReturn => {
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [isIncomingLoading, setIsIncomingLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [isSentLoading, setIsSentLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isBlockedLoading, setIsBlockedLoading] = useState(false);

  const fetchFriends = useCallback(async () => {
    setIsFriendsLoading(true);
    try {
      const response = await friendshipApi.getFriends();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toFriendRecord(relation))
        .filter((item): item is FriendRecord => item !== null);
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      setIsFriendsLoading(false);
    }
  }, []);

  const fetchIncomingRequests = useCallback(async () => {
    setIsIncomingLoading(true);
    try {
      const response = await friendshipApi.getPendingRequests();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);
      setIncomingRequests(list);
      setPendingCount(list.length);
    } catch {
      setIncomingRequests([]);
      setPendingCount(0);
    } finally {
      setIsIncomingLoading(false);
    }
  }, []);

  const fetchSentRequests = useCallback(async () => {
    setIsSentLoading(true);
    try {
      const response = await friendshipApi.getSentRequests();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toRequestRecord(relation))
        .filter((item): item is FriendRequest => item !== null);
      setSentRequests(list);
    } catch {
      setSentRequests([]);
    } finally {
      setIsSentLoading(false);
    }
  }, []);

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await friendshipApi.getPendingCount();
      const payload = unwrapApiSuccess(response);
      const count =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { count?: unknown }).count === "number"
          ? (payload as { count: number }).count
          : 0;
      setPendingCount(count);
    } catch {
      setPendingCount((current) => current);
    }
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    setIsBlockedLoading(true);
    try {
      const response = await friendshipApi.getBlockedUsers();
      const payload = unwrapApiSuccess(response);
      const list = asRelations(payload)
        .map((relation) => toBlockedRecord(relation))
        .filter((item): item is BlockedUser => item !== null);
      setBlockedUsers(list);
    } catch {
      setBlockedUsers([]);
    } finally {
      setIsBlockedLoading(false);
    }
  }, []);

  const refreshDirectory = useCallback(async () => {
    await Promise.all([
      fetchFriends(),
      fetchIncomingRequests(),
      fetchSentRequests(),
      fetchBlockedUsers(),
      fetchPendingCount(),
    ]);
  }, [
    fetchBlockedUsers,
    fetchFriends,
    fetchIncomingRequests,
    fetchPendingCount,
    fetchSentRequests,
  ]);

  const sendFriendRequest = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await friendshipApi.sendFriendRequest(userId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      try {
        await friendshipApi.acceptFriendRequest(requestId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      try {
        await friendshipApi.rejectFriendRequest(requestId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const cancelFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      try {
        await friendshipApi.cancelFriendRequest(requestId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const removeFriend = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      try {
        await friendshipApi.removeFriend(friendshipId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const blockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await friendshipApi.blockUser(userId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
  );

  const unblockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await friendshipApi.unblockUser(userId);
        await refreshDirectory();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [refreshDirectory],
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
