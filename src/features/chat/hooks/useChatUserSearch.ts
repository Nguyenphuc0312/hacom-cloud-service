import { useEffect, useMemo, useState } from "react";

import { useDebounce } from "../../../hooks";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";
import { UserStatus } from "../../../types";
import { searchUsersUseCase } from "../usecases/searchUsers";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export interface ChatSearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status?: UserStatus | null;
  employeeCode?: string | null;
  isFriend: boolean;
  canAddFriend: boolean;
  friendshipStatus:
    | "none"
    | "pending"
    | "accepted"
    | "declined"
    | "canceled"
    | "blocked";
}

const extractSearchRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (isRecord(payload.data) && Array.isArray(payload.data.data)) {
    return payload.data.data;
  }

  return [];
};

export const normalizeSearchUser = (value: unknown): ChatSearchUser | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const username = asString(value.username);
  const displayName =
    asString(value.displayName) ??
    asString(value.display_name) ??
    asString(value.fullNameFromHR) ??
    asString(value.full_name_from_hr) ??
    username ??
    asString(value.employeeCode) ??
    asString(value.employee_code) ??
    id;

  if (!id || !username || !displayName) {
    return null;
  }

  const friendshipStatus =
    asString(value.friendshipStatus) ??
    asString(value.friendship_status) ??
    (asBoolean(value.isFriend) ? "accepted" : "none");

  return {
    id,
    username,
    displayName,
    avatarUrl:
      asString(value.avatarUrl) ??
      asString(value.avatar_url) ??
      asString(value.avatar) ??
      null,
    status:
      (asString(value.status) as UserStatus | undefined) ?? UserStatus.OFFLINE,
    employeeCode:
      asString(value.employeeCode) ??
      asString(value.employee_code) ??
      asString(value.employeeId) ??
      null,
    isFriend:
      asBoolean(value.isFriend) ??
      asBoolean(value.is_friend) ??
      friendshipStatus === "accepted",
    canAddFriend:
      asBoolean(value.canAddFriend) ??
      asBoolean(value.can_add_friend) ??
      friendshipStatus === "none",
    friendshipStatus: (friendshipStatus as ChatSearchUser["friendshipStatus"]) ?? "none",
  };
};

export const buildUserSearchSecondaryText = (user: ChatSearchUser): string => {
  const parts = [`@${user.username}`];
  if (user.employeeCode) {
    parts.push(user.employeeCode);
  }
  return parts.join(" / ");
};

export const isDirectConversationEligible = (user: ChatSearchUser): boolean =>
  user.isFriend || user.friendshipStatus === "accepted";

export const isGroupMemberEligible = (user: ChatSearchUser): boolean =>
  user.isFriend || user.friendshipStatus === "accepted";

interface UseChatUserSearchOptions {
  limit?: number;
  minQueryLength?: number;
  excludeUserIds?: string[];
  enabled?: boolean;
}

const EMPTY_EXCLUDED_USER_IDS: string[] = [];

export const useChatUserSearch = (
  query: string,
  options?: UseChatUserSearchOptions,
) => {
  const minQueryLength = options?.minQueryLength ?? 2;
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled ?? true;
  const excludedUserIdsList = options?.excludeUserIds ?? EMPTY_EXCLUDED_USER_IDS;
  const excludedUserIdsKey = JSON.stringify(excludedUserIdsList);
  const excludedUserIds = useMemo(
    () => new Set<string>(JSON.parse(excludedUserIdsKey) as string[]),
    [excludedUserIdsKey],
  );
  const debouncedQuery = useDebounce(query, 400);
  const [results, setResults] = useState<ChatSearchUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    const runSearch = async () => {
      const trimmedQuery = debouncedQuery.trim();
      if (!enabled || trimmedQuery.length < minQueryLength) {
        setResults([]);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await searchUsersUseCase(trimmedQuery, 1, limit, {
          signal: abortController.signal,
        });
        const payload = unwrapApiSuccess(response);
        const nextResults = extractSearchRows(payload)
          .map((row) => normalizeSearchUser(row))
          .filter((user): user is ChatSearchUser => Boolean(user))
          .filter((user) => !excludedUserIds.has(user.id));

        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        if (!cancelled) {
          setResults([]);
          setErrorMessage(extractApiError(error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void runSearch();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [debouncedQuery, enabled, excludedUserIds, limit, minQueryLength]);

  return {
    results,
    isLoading,
    errorMessage,
    debouncedQuery,
    minQueryLength,
  };
};
