/**
 * @fileoverview useFriendship hook
 * Shared relationship directory for friends, requests, blocked users and
 * relationship-aware actions used by profile + contacts surfaces.
 */

import { useCallback, useState } from "react";
import { friendshipApi } from "../services/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import type { User } from "../stores/authStore";

export type FriendshipStatusType =
  | "none"
  | "pending"
  | "accepted"
  | "declined"
  | "canceled"
  | "blocked";

export type RelationshipState =
  | { kind: "self" }
  | { kind: "not_friend" }
  | { kind: "outgoing_request"; requestId: string }
  | { kind: "incoming_request"; requestId: string }
  | { kind: "friend"; friendshipId?: string }
  | { kind: "blocked" };

export interface FriendRequest {
  id: string;
  createdAt: string;
  sender?: User;
  receiver?: User;
}

interface FriendRecord extends User {
  friendshipId?: string;
}

interface BlockedUser extends User {}

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
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const extractList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.requests)) return payload.requests;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.friends)) return payload.friends;

  if (isRecord(payload.data)) {
    const nested = payload.data;
    if (Array.isArray(nested.data)) return nested.data;
    if (Array.isArray(nested.requests)) return nested.requests;
    if (Array.isArray(nested.users)) return nested.users;
    if (Array.isArray(nested.friends)) return nested.friends;
  }

  return [];
};

const normalizeUser = (value: unknown): User | undefined => {
  if (!isRecord(value)) return undefined;

  const id = asString(value.id);
  const username = asString(value.username);
  const email = asOptionalString(value.email) ?? "";
  const statusRaw = asString(value.status) ?? "offline";

  if (!id || !username) return undefined;

  const firstName = asOptionalString(value.firstName);
  const lastName = asOptionalString(value.lastName);

  return {
    id,
    username,
    email,
    firstName,
    lastName,
    avatar:
      asOptionalString(value.avatar) ??
      asOptionalString(value.avatarUrl) ??
      undefined,
    bio: asOptionalString(value.bio),
    phone: asOptionalString(value.phone),
    status:
      statusRaw === "online" ||
      statusRaw === "offline" ||
      statusRaw === "away" ||
      statusRaw === "dnd"
        ? statusRaw
        : "offline",
    role: asOptionalString(value.role),
    isVerified:
      typeof value.isVerified === "boolean" ? value.isVerified : undefined,
    createdAt: asOptionalString(value.createdAt),
  };
};

const normalizeRequest = (value: unknown): FriendRequest | null => {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  if (!id) return null;

  return {
    id,
    createdAt: asOptionalString(value.createdAt) ?? new Date().toISOString(),
    sender: normalizeUser(value.sender),
    receiver: normalizeUser(value.receiver),
  };
};

const normalizeFriend = (value: unknown): FriendRecord | null => {
  const user = normalizeUser(value);
  if (!user) return null;

  const record = isRecord(value) ? value : null;
  return {
    ...user,
    friendshipId: asOptionalString(record?.friendshipId),
  };
};

const emitFriendUpdated = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("friend:updated"));
};

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
      const nextFriends = extractList(payload)
        .map((item) => normalizeFriend(item))
        .filter((item): item is FriendRecord => item !== null);
      setFriends(nextFriends);
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
      const nextIncoming = extractList(payload)
        .map((item) => normalizeRequest(item))
        .filter((item): item is FriendRequest => item !== null);
      setIncomingRequests(nextIncoming);
      setPendingCount(nextIncoming.length);
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
      const nextSent = extractList(payload)
        .map((item) => normalizeRequest(item))
        .filter((item): item is FriendRequest => item !== null);
      setSentRequests(nextSent);
    } catch {
      setSentRequests([]);
    } finally {
      setIsSentLoading(false);
    }
  }, []);

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await friendshipApi.getPendingCount();
      const payload = unwrapApiSuccess(response) as
        | { count?: number; data?: { count?: number } }
        | undefined;
      const count = payload?.count ?? payload?.data?.count;
      setPendingCount(
        typeof count === "number" && Number.isFinite(count) ? count : 0,
      );
    } catch {
      setPendingCount((current) => current);
    }
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    setIsBlockedLoading(true);
    try {
      const response = await friendshipApi.getBlockedUsers();
      const payload = unwrapApiSuccess(response);
      const nextBlocked = extractList(payload)
        .map((item) => normalizeUser(item))
        .filter((item): item is BlockedUser => item !== undefined);
      setBlockedUsers(nextBlocked);
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
    ]);
  }, [
    fetchBlockedUsers,
    fetchFriends,
    fetchIncomingRequests,
    fetchSentRequests,
  ]);

  const sendFriendRequest = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await friendshipApi.sendFriendRequest(userId);
        await fetchSentRequests();
        emitFriendUpdated();
        return true;
      } catch {
        return false;
      }
    },
    [fetchSentRequests],
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const acceptedRequest =
        incomingRequests.find((request) => request.id === requestId) ?? null;

      setIncomingRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );
      setPendingCount((current) => Math.max(0, current - 1));

      if (acceptedRequest?.sender) {
        const nextFriend: FriendRecord = {
          ...acceptedRequest.sender,
          friendshipId: undefined,
        };
        setFriends((current) => {
          if (current.some((friend) => friend.id === acceptedRequest.sender?.id)) {
            return current;
          }
          return [...current, nextFriend];
        });
      }

      try {
        await friendshipApi.acceptFriendRequest(requestId);
        emitFriendUpdated();
        return true;
      } catch {
        if (acceptedRequest) {
          setIncomingRequests((current) => [acceptedRequest, ...current]);
          setPendingCount((current) => current + 1);
          if (acceptedRequest.sender) {
            setFriends((current) =>
              current.filter((friend) => friend.id !== acceptedRequest.sender?.id),
            );
          }
        }
        return false;
      }
    },
    [incomingRequests],
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const rejectedRequest =
        incomingRequests.find((request) => request.id === requestId) ?? null;

      setIncomingRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );
      setPendingCount((current) => Math.max(0, current - 1));

      try {
        await friendshipApi.rejectFriendRequest(requestId);
        emitFriendUpdated();
        return true;
      } catch {
        if (rejectedRequest) {
          setIncomingRequests((current) => [rejectedRequest, ...current]);
          setPendingCount((current) => current + 1);
        }
        return false;
      }
    },
    [incomingRequests],
  );

  const cancelFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const previous = sentRequests;
      setSentRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );

      try {
        await friendshipApi.cancelFriendRequest(requestId);
        emitFriendUpdated();
        return true;
      } catch {
        setSentRequests(previous);
        return false;
      }
    },
    [sentRequests],
  );

  const removeFriend = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      const previous = friends;
      setFriends((current) =>
        current.filter((friend) => friend.friendshipId !== friendshipId),
      );

      try {
        await friendshipApi.removeFriend(friendshipId);
        emitFriendUpdated();
        return true;
      } catch {
        setFriends(previous);
        return false;
      }
    },
    [friends],
  );

  const blockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      const blockedCandidate =
        friends.find((friend) => friend.id === userId) ??
        incomingRequests.find((request) => request.sender?.id === userId)?.sender ??
        sentRequests.find((request) => request.receiver?.id === userId)?.receiver ??
        null;

      const previousFriends = friends;
      const previousIncoming = incomingRequests;
      const previousSent = sentRequests;
      const previousBlocked = blockedUsers;

      setFriends((current) => current.filter((friend) => friend.id !== userId));
      setIncomingRequests((current) =>
        current.filter((request) => request.sender?.id !== userId),
      );
      setSentRequests((current) =>
        current.filter((request) => request.receiver?.id !== userId),
      );
      setPendingCount((current) =>
        Math.max(
          0,
          current -
            incomingRequests.filter((request) => request.sender?.id === userId)
              .length,
        ),
      );
      if (blockedCandidate) {
        setBlockedUsers((current) => {
          if (current.some((user) => user.id === blockedCandidate.id)) {
            return current;
          }
          return [...current, blockedCandidate];
        });
      }

      try {
        await friendshipApi.blockUser(userId);
        emitFriendUpdated();
        return true;
      } catch {
        setFriends(previousFriends);
        setIncomingRequests(previousIncoming);
        setSentRequests(previousSent);
        setBlockedUsers(previousBlocked);
        setPendingCount(previousIncoming.length);
        return false;
      }
    },
    [blockedUsers, friends, incomingRequests, sentRequests],
  );

  const unblockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      const previous = blockedUsers;
      setBlockedUsers((current) => current.filter((user) => user.id !== userId));

      try {
        await friendshipApi.unblockUser(userId);
        emitFriendUpdated();
        return true;
      } catch {
        setBlockedUsers(previous);
        return false;
      }
    },
    [blockedUsers],
  );

  const getRelationshipState = useCallback(
    (userId: string, currentUserId?: string | null): RelationshipState => {
      if (currentUserId && userId === currentUserId) {
        return { kind: "self" };
      }

      if (blockedUsers.some((user) => user.id === userId)) {
        return { kind: "blocked" };
      }

      const friend = friends.find((item) => item.id === userId);
      if (friend) {
        return { kind: "friend", friendshipId: friend.friendshipId };
      }

      const incoming = incomingRequests.find((item) => item.sender?.id === userId);
      if (incoming) {
        return { kind: "incoming_request", requestId: incoming.id };
      }

      const outgoing = sentRequests.find((item) => item.receiver?.id === userId);
      if (outgoing) {
        return { kind: "outgoing_request", requestId: outgoing.id };
      }

      return { kind: "not_friend" };
    },
    [blockedUsers, friends, incomingRequests, sentRequests],
  );

  const checkFriendshipStatus = useCallback(
    async (
      userId: string,
    ): Promise<{ status: FriendshipStatusType; friendshipId?: string }> => {
      try {
        const response = await friendshipApi.getFriendshipStatus(userId);
        const data = unwrapApiSuccess(response) as {
          status?: FriendshipStatusType;
          friendship?: { id?: string };
        };
        return {
          status: data.status || "none",
          friendshipId: data.friendship?.id,
        };
      } catch {
        return { status: "none" };
      }
    },
    [],
  );

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
