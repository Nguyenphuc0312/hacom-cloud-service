/**
 * @fileoverview useFriendship hook
 * Friendship status, sent requests, pending count, block/unblock management.
 */

import { useState, useCallback, useEffect } from "react";
import { friendshipApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import type { User } from "../stores/authStore";

type FriendshipStatusType =
  | "none"
  | "pending"
  | "accepted"
  | "declined"
  | "blocked";

interface SentRequest {
  id: string;
  receiver: User;
  createdAt: string;
}

interface BlockedUser extends User {}

interface UseFriendshipReturn {
  // Sent requests
  sentRequests: SentRequest[];
  isSentLoading: boolean;
  fetchSentRequests: () => Promise<void>;
  cancelFriendRequest: (requestId: string) => Promise<boolean>;

  // Pending count
  pendingCount: number;
  fetchPendingCount: () => Promise<void>;

  // Block management
  blockedUsers: BlockedUser[];
  isBlockedLoading: boolean;
  fetchBlockedUsers: () => Promise<void>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;

  // Status check
  checkFriendshipStatus: (userId: string) => Promise<{
    status: FriendshipStatusType;
    friendshipId?: string;
  }>;
}

export const useFriendship = (): UseFriendshipReturn => {
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [isSentLoading, setIsSentLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isBlockedLoading, setIsBlockedLoading] = useState(false);

  const fetchSentRequests = useCallback(async () => {
    setIsSentLoading(true);
    try {
      const response = await friendshipApi.getSentRequests();
      const data = unwrapApiSuccess(response);
      setSentRequests(data.requests ?? []);
    } catch {
      // Silently fail - UI shows empty state
    } finally {
      setIsSentLoading(false);
    }
  }, []);

  const cancelFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      // Optimistic removal
      const prev = sentRequests;
      setSentRequests((curr) => curr.filter((r) => r.id !== requestId));
      try {
        await friendshipApi.cancelFriendRequest(requestId);
        return true;
      } catch {
        setSentRequests(prev);
        return false;
      }
    },
    [sentRequests],
  );

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await friendshipApi.getPendingCount();
      const data = unwrapApiSuccess(response);
      setPendingCount(data.count ?? 0);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    setIsBlockedLoading(true);
    try {
      const response = await friendshipApi.getBlockedUsers();
      const data = unwrapApiSuccess(response);
      setBlockedUsers((data.users ?? []) as BlockedUser[]);
    } catch {
      // Silently fail
    } finally {
      setIsBlockedLoading(false);
    }
  }, []);

  const blockUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      await friendshipApi.blockUser(userId);
      return true;
    } catch {
      return false;
    }
  }, []);

  const unblockUser = useCallback(
    async (userId: string): Promise<boolean> => {
      // Optimistic removal
      const prev = blockedUsers;
      setBlockedUsers((curr) => curr.filter((u) => u.id !== userId));
      try {
        await friendshipApi.unblockUser(userId);
        return true;
      } catch {
        setBlockedUsers(prev);
        return false;
      }
    },
    [blockedUsers],
  );

  const checkFriendshipStatus = useCallback(
    async (
      userId: string,
    ): Promise<{ status: FriendshipStatusType; friendshipId?: string }> => {
      try {
        const response = await friendshipApi.getFriendshipStatus(userId);
        const data = unwrapApiSuccess(response);
        return {
          status: data.status,
          friendshipId: data.friendship?.id,
        };
      } catch {
        return { status: "none" };
      }
    },
    [],
  );

  return {
    sentRequests,
    isSentLoading,
    fetchSentRequests,
    cancelFriendRequest,
    pendingCount,
    fetchPendingCount,
    blockedUsers,
    isBlockedLoading,
    fetchBlockedUsers,
    blockUser,
    unblockUser,
    checkFriendshipStatus,
  };
};

export default useFriendship;
