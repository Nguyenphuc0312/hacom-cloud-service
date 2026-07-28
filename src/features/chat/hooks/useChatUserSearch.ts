import { useEffect, useMemo, useRef, useState } from "react";

import { useDebounce } from "../../../hooks";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";
import { UserStatus } from "../../../types";
import { searchUsersUseCase } from "../usecases/searchUsers";
import { ExpiringLruCache } from "../../../utils/expiringLruCache";
import { useFriendshipStore, type FriendRecord } from "../../../stores/friendshipStore";
import { resolveUserDisplayName } from "../identity/resolveUserDisplayName";
import { USERS_SEARCH_PAGE_SIZE } from "../../../services/api";
import { asStringValue as asString } from "../../../utils/payloadGuards";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object";


const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export interface ChatSearchUser {
  id: string;
  username: string;
  displayName: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  status?: UserStatus | null;
  employeeCode?: string | null;
  departmentName?: string | null;
  unitCode?: string | null;
  title?: string | null;
  /** Friend alias (only set when entry comes from friendship list) */
  alias?: string | null;
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

/** Bóc mảng user khỏi response tìm kiếm (nhiều tầng envelope tuỳ endpoint).
 *  Export để nơi khác dùng lại parser này thay vì tự đoán shape. */
export const extractSearchRows = (payload: unknown): unknown[] => {
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

  const rawFriendshipStatus =
    asString(value.friendshipStatus) ??
    asString(value.friendship_status) ??
    (asBoolean(value.isFriend) ? "accepted" : "none");
  const friendshipStatus =
    asBoolean(value.isFriend) === true ? "accepted" : rawFriendshipStatus;
  const acceptedOrPending =
    friendshipStatus === "accepted" || friendshipStatus === "pending";
  const rawCanAddFriend =
    asBoolean(value.canAddFriend) ??
    asBoolean(value.can_add_friend) ??
    friendshipStatus === "none";

  return {
    id,
    username,
    displayName,
    fullName:
      asString(value.fullName) ??
      asString(value.full_name) ??
      asString(value.fullNameFromHR) ??
      asString(value.full_name_from_hr) ??
      null,
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
    departmentName:
      asString(value.departmentName) ??
      asString(value.department_name) ??
      null,
    unitCode:
      asString(value.unitCode) ??
      asString(value.unit_code) ??
      null,
    title:
      asString(value.title) ??
      null,
    isFriend:
      asBoolean(value.isFriend) ??
      asBoolean(value.is_friend) ??
      friendshipStatus === "accepted",
    canAddFriend: acceptedOrPending ? false : rawCanAddFriend,
    friendshipStatus: (friendshipStatus as ChatSearchUser["friendshipStatus"]) ?? "none",
  };
};

export const buildUserSearchSecondaryText = (user: ChatSearchUser): string => {
  const parts = [`@${user.username}`];
  if (user.employeeCode) {
    parts.push(user.employeeCode);
  }
  if (user.departmentName) {
    parts.push(user.departmentName);
  }
  if (user.unitCode) {
    parts.push(user.unitCode);
  } else if (user.title) {
    parts.push(user.title);
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
  includeSelf?: boolean;
}

const EMPTY_EXCLUDED_USER_IDS: string[] = [];

// Phase 1: User search LRU cache to reduce duplicate API calls
const USER_SEARCH_CACHE_MAX = 100;
const USER_SEARCH_CACHE_TTL_MS = 60_000; // 60 seconds

interface UserSearchCacheEntry {
  data: ChatSearchUser[];
  excludes: string; // JSON string of excluded user IDs
}

const userSearchCache = new ExpiringLruCache<UserSearchCacheEntry>({
  maxEntries: USER_SEARCH_CACHE_MAX,
});

const buildUserSearchCacheKey = (
  query: string,
  limit: number,
  excludeUserIds: Set<string>,
): string => {
  const normalizedQuery = query.trim().toLowerCase();
  const excludes = Array.from(excludeUserIds).sort().join(",");
  return `${normalizedQuery}:${limit}:${excludes}`;
};

const getCachedResults = (
  query: string,
  limit: number,
  excludeUserIds: Set<string>,
): ChatSearchUser[] | null => {
  const cacheKey = buildUserSearchCacheKey(query, limit, excludeUserIds);
  const entry = userSearchCache.get(cacheKey, 0);
  if (!entry) return null;

  // Verify excluded users match
  const cachedExcludes = entry.excludes;
  const currentExcludes = Array.from(excludeUserIds).sort().join(",");
  if (cachedExcludes !== currentExcludes) return null;

  return entry.data;
};

const setCachedResults = (
  query: string,
  limit: number,
  excludeUserIds: Set<string>,
  data: ChatSearchUser[],
): void => {
  const cacheKey = buildUserSearchCacheKey(query, limit, excludeUserIds);
  const excludes = Array.from(excludeUserIds).sort().join(",");
  userSearchCache.set(
    cacheKey,
    { data, excludes },
    Date.now() + USER_SEARCH_CACHE_TTL_MS,
  );
};

export const useChatUserSearch = (
  query: string,
  options?: UseChatUserSearchOptions,
) => {
  const minQueryLength = options?.minQueryLength ?? 2;
  const limit = Math.min(options?.limit ?? USERS_SEARCH_PAGE_SIZE, USERS_SEARCH_PAGE_SIZE);
  const enabled = options?.enabled ?? true;
  const includeSelf = options?.includeSelf ?? false;
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

      // Phase 1: Check cache first before making API call
      const cachedData = getCachedResults(trimmedQuery, limit, excludedUserIds);
      if (cachedData) {
        if (!cancelled) {
          setResults(cachedData);
          setIsLoading(false);
          setErrorMessage(null);
          if (import.meta.env.DEV) {
            console.debug("[api-perf] USER_SEARCH cache hit", {
              query: trimmedQuery,
              limit,
              resultCount: cachedData.length,
            });
          }
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await searchUsersUseCase(trimmedQuery, 1, limit, {
          includeSelf,
          signal: abortController.signal,
        });
        const payload = unwrapApiSuccess(response);
        const nextResults = extractSearchRows(payload)
          .map((row) => normalizeSearchUser(row))
          .filter((user): user is ChatSearchUser => Boolean(user))
          .filter((user) => !excludedUserIds.has(user.id));

        if (!cancelled) {
          // Phase 1: Cache successful results
          setCachedResults(trimmedQuery, limit, excludedUserIds, nextResults);
          setResults(nextResults);
          if (import.meta.env.DEV) {
            console.debug("[api-perf] USER_SEARCH cache miss", {
              query: trimmedQuery,
              limit,
              resultCount: nextResults.length,
            });
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        if (!cancelled) {
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
  }, [debouncedQuery, enabled, excludedUserIds, includeSelf, limit, minQueryLength]);

  return {
    results,
    isLoading,
    errorMessage,
    debouncedQuery,
    minQueryLength,
  };
};

// --- Friend suggestions (reads directly from store, no API call needed) ---

const removeDiacritics = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const friendRecordToSearchUser = (friend: FriendRecord): ChatSearchUser => ({
  id: friend.id,
  username: friend.username,
  displayName: resolveUserDisplayName(friend, { allowLegacyFallback: true }),
  fullName: friend.fullName ?? null,
  avatarUrl: friend.avatar ?? null,
  status: (friend.status as UserStatus | undefined) ?? UserStatus.OFFLINE,
  employeeCode: friend.employeeCode ?? friend.employee_code ?? null,
  departmentName: friend.departmentName ?? null,
  unitCode: friend.unitCode ?? null,
  title: friend.title ?? null,
  alias: friend.alias ?? null,
  isFriend: true,
  canAddFriend: false,
  friendshipStatus: "accepted",
});

const matchesFriendQuery = (user: ChatSearchUser, query: string): boolean => {
  const q = removeDiacritics(query.toLowerCase().trim());
  if (!q) return true;
  const check = (s: string | null | undefined) =>
    Boolean(s && removeDiacritics(s.toLowerCase()).includes(q));
  return (
    check(user.displayName) ||
    check(user.username) ||
    check(user.employeeCode) ||
    check(user.departmentName)
  );
};

interface UseFriendSuggestionsOptions {
  query?: string;
  enabled?: boolean;
  limit?: number;
}

export const useFriendSuggestions = (options?: UseFriendSuggestionsOptions) => {
  const query = options?.query ?? "";
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? 50;

  const rawFriends = useFriendshipStore((state) => state.friends);
  const isLoading = useFriendshipStore((state) => state.isFriendsLoading);
  const hasHydrated = useFriendshipStore((state) => state.hasHydrated);
  const fetchFriends = useFriendshipStore((state) => state.fetchFriends);

  // Trigger fetch một lần khi store chưa hydrate (chưa vào trang Danh bạ)
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (enabled && !hasHydrated && !isLoading && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetchFriends();
    }
  }, [enabled, hasHydrated, isLoading, fetchFriends]);

  const suggestions = useMemo(() => {
    if (!enabled) return [];
    const mapped = rawFriends.map(friendRecordToSearchUser);
    const filtered = query.trim()
      ? mapped.filter((f) => matchesFriendQuery(f, query))
      : mapped;
    return filtered.slice(0, limit);
  }, [enabled, rawFriends, query, limit]);

  return {
    suggestions,
    isLoading: isLoading && !hasHydrated,
  };
};
