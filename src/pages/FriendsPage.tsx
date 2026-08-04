import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import type {
  FriendSuggestionDto,
  FriendSuggestionMetadataDto,
  FriendshipCapabilitiesDto,
} from "@hacom/chat-shared-types/chat";
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../components/common/Avatar";
import { FriendQrWorkspace } from "../components/friends";
import { UserProfile } from "../components/info/UserProfile";
import {
  Button,
  DirectorySkeleton,
  Input,
  SegmentedControl,
  SkeletonCircle,
  StateBlock,
  toast,
} from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { useAuthStore, usePresenceStore, resolveLivePresenceStatus } from "../stores";
import { formatCalendarDate, formatCalendarDateTime } from "../utils/formatTime";
import { matchesContactQuery } from "../utils/contactSearchMatch";
import { useDebounce } from "../hooks/useDebounce";
import { useFriendship } from "../hooks/useFriendship";
import { usePresence } from "../hooks/usePresence";
import {
  USERS_SEARCH_PAGE_SIZE,
  conversationApi,
  userApi,
} from "../services/api";
import {
  extractApiError,
  unwrapApiSuccess,
} from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import { UserStatus } from "../types";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import {
  getFriendRequestDisplayLabel,
  getFriendRequestDisplayUser,
} from "../features/friends/requestDisplay";
import {
  filterFriendSuggestions,
  getFriendshipAction,
  isAcceptedFriendshipStatus,
} from "../features/friends/friendshipAction";
import { useFriendSuggestions } from "../features/friends/useFriendSuggestions";
import { loadUserProfiles } from "../services/userBatchLoader";

type TabKey = "friends" | "requests" | "discover" | "qr";
type RequestTabKey = "incoming" | "sent";

interface ContactUser {
  id: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  status?: UserStatus;
  bio?: string;
  phone?: string;
  employeeCode?: string;
  departmentName?: string;
  orgUnit?: string;
  unitCode?: string;
  title?: string;
  createdAt?: string;
  isFriend?: boolean;
  canAddFriend?: boolean;
  friendshipStatus?:
    | "none"
    | "pending"
    | "requested"
    | "accepted"
    | "friends"
    | "friend"
    | "declined"
    | "canceled"
    | "cancelled"
    | "blocked"
    | null;
  capabilities?: Partial<FriendshipCapabilitiesDto> | null;
}

interface SuggestionContact extends ContactUser {
  suggestion?: FriendSuggestionMetadataDto;
}

interface PreviewTarget {
  userId: string;
  initialUser: ContactUser;
}

const extractArray = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.requests)) return record.requests as T[];
    if (Array.isArray(record.users)) return record.users as T[];
    if (Array.isArray(record.friends)) return record.friends as T[];
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) return nested.data as T[];
      if (Array.isArray(nested.requests)) return nested.requests as T[];
      if (Array.isArray(nested.users)) return nested.users as T[];
      if (Array.isArray(nested.friends)) return nested.friends as T[];
    }
  }
  return [];
};

const toDisplayName = (user: ContactUser): string => {
  const resolved = resolveUserDisplayName(user, {
    allowLegacyFallback: false,
  }).trim();
  if (
    resolved &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      resolved,
    )
  ) {
    return resolved;
  }

  const username =
    typeof user.username === "string" ? user.username.trim() : "";
  if (
    username &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      username,
    )
  ) {
    return username;
  }

  return "Người dùng";
};

const normalizeStatus = (value: unknown): UserStatus | undefined => {
  const statuses = new Set<string>(Object.values(UserStatus));
  return typeof value === "string" && statuses.has(value)
    ? (value as UserStatus)
    : undefined;
};

const normalizeFriendshipStatus = (
  value: unknown,
): ContactUser["friendshipStatus"] | undefined =>
  typeof value === "string"
    ? (value as ContactUser["friendshipStatus"])
    : undefined;

const toContactUser = (value: {
  id: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  status?: unknown;
  bio?: string;
  phone?: string;
  employeeCode?: string;
  departmentName?: string;
  orgUnit?: string;
  unitCode?: string;
  title?: string;
  createdAt?: string;
  isFriend?: boolean;
  canAddFriend?: boolean;
  friendshipStatus?: ContactUser["friendshipStatus"];
  capabilities?: Partial<FriendshipCapabilitiesDto> | null;
}): ContactUser => ({
  id: value.id,
  username: value.username,
  displayName: value.displayName,
  firstName: value.firstName,
  lastName: value.lastName,
  avatar: value.avatar,
  status: normalizeStatus(value.status),
  bio: value.bio,
  phone: value.phone,
  employeeCode: value.employeeCode,
  departmentName: value.departmentName,
  orgUnit: value.orgUnit,
  unitCode: value.unitCode,
  title: value.title,
  createdAt: value.createdAt,
  isFriend: value.isFriend,
  canAddFriend: value.canAddFriend,
  friendshipStatus: value.friendshipStatus,
  capabilities: value.capabilities,
});


const buildSuggestionSubtitle = (user: ContactUser): string | undefined => {
  const parts = [
    user.departmentName ?? null,
    user.orgUnit ?? user.unitCode ?? null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
};

const toSuggestionContact = (dto: FriendSuggestionDto): SuggestionContact => ({
  id: dto.id,
  username: dto.username ?? undefined,
  displayName: dto.displayName,
  avatar: dto.avatarUrl ?? undefined,
  status: normalizeStatus(dto.status),
  employeeCode: dto.employeeCode ?? undefined,
  departmentName: dto.departmentName ?? undefined,
  orgUnit: dto.unitName ?? undefined,
  unitCode: dto.unitCode ?? undefined,
  title: dto.title ?? undefined,
  isFriend: dto.isFriend,
  canAddFriend: dto.canAddFriend,
  friendshipStatus: dto.friendshipStatus,
  capabilities: dto.capabilities,
  suggestion: dto.suggestion,
});

const buildSuggestionReasonSubtitle = (
  user: SuggestionContact,
): string | undefined => {
  const labels = (user.suggestion?.reasons ?? [])
    .map((reason) => reason.label)
    .filter(Boolean);
  if (labels.length > 0) {
    return labels.slice(0, 2).join(" · ");
  }
  return buildSuggestionSubtitle(user);
};

const normalizeSearchResults = (payload: unknown): ContactUser[] => {
  const rows = extractArray<Record<string, unknown>>(payload);
  return rows
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return null;

      const firstName =
        typeof row.firstName === "string" ? row.firstName : undefined;
      const lastName =
        typeof row.lastName === "string" ? row.lastName : undefined;
      const displayName =
        (typeof row.displayName === "string" && row.displayName) ||
        `${firstName || ""} ${lastName || ""}`.trim() ||
        (typeof row.username === "string" ? row.username : id);

      return toContactUser({
        id,
        username: typeof row.username === "string" ? row.username : undefined,
        displayName,
        firstName,
        lastName,
        avatar:
          (typeof row.avatarUrl === "string" && row.avatarUrl) ||
          (typeof row.avatar === "string" ? row.avatar : undefined),
        status: normalizeStatus(row.status),
        employeeCode:
          typeof row.employeeCode === "string"
            ? row.employeeCode
            : typeof row.employee_code === "string"
              ? row.employee_code
              : typeof row.employeeId === "string"
                ? row.employeeId
                : undefined,
        departmentName:
          typeof row.departmentName === "string"
            ? row.departmentName
            : typeof row.department_name === "string"
              ? row.department_name
              : undefined,
        orgUnit:
          typeof row.orgUnit === "string"
            ? row.orgUnit
            : typeof row.org_unit === "string"
              ? row.org_unit
              : undefined,
        unitCode:
          typeof row.unitCode === "string"
            ? row.unitCode
            : typeof row.unit_code === "string"
              ? row.unit_code
              : undefined,
        title: typeof row.title === "string" ? row.title : undefined,
        isFriend: typeof row.isFriend === "boolean" ? row.isFriend : undefined,
        canAddFriend:
          typeof row.canAddFriend === "boolean" ? row.canAddFriend : undefined,
        friendshipStatus:
          normalizeFriendshipStatus(row.friendshipStatus) ??
          normalizeFriendshipStatus(row.relationshipStatus) ??
          normalizeFriendshipStatus(row.friendship_status) ??
          normalizeFriendshipStatus(row.relationship_status),
        capabilities:
          row.capabilities && typeof row.capabilities === "object"
            ? (row.capabilities as Partial<FriendshipCapabilitiesDto>)
            : null,
      });
    })
    .filter((item): item is ContactUser => Boolean(item));
};

const profileFromSummary = (user: ContactUser): PreviewTarget => ({
  userId: user.id,
  initialUser: user,
});

const proximityScore = (
  user: ContactUser,
  myOrg?: string,
  myDept?: string,
): number => {
  let score = 0;
  // Ưu tiên cùng văn phòng (department) trước, sau đó cùng công ty (orgUnit)
  if (myDept && user.departmentName?.trim().toLowerCase() === myDept) score += 3;
  if (myOrg && user.orgUnit?.trim().toLowerCase() === myOrg) score += 1;
  return score;
};

const sortByProximity = (
  users: ContactUser[],
  currentUser: { departmentName?: string; orgUnit?: string } | null | undefined,
): ContactUser[] => {
  const myOrg = currentUser?.orgUnit?.trim().toLowerCase();
  const myDept = currentUser?.departmentName?.trim().toLowerCase();
  return [...users].sort((a, b) => {
    const diff = proximityScore(b, myOrg, myDept) - proximityScore(a, myOrg, myDept);
    if (diff !== 0) return diff;
    return (a.displayName || "").localeCompare(b.displayName || "", "vi");
  });
};

const stopPropagation = (
  event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
): void => {
  event.stopPropagation();
};

interface ContactRowProps {
  user: ContactUser;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}

const ContactRow: React.FC<ContactRowProps> = ({
  user,
  subtitle,
  selected = false,
  onClick,
  action,
  meta,
}) => {
  const { t } = useTranslation(["common"]);
  const livePresence = usePresenceStore((state) =>
    user.id ? state.presenceMap[user.id] : undefined,
  );

  // Live presence (WS) is the only source of truth — never the backend
  // `user.status` field. See resolveLivePresenceStatus for the rationale.
  const status = resolveLivePresenceStatus(livePresence);

  // Online → "Trực tuyến". Offline → phòng ban · công ty (KHÔNG hiện mã NV);
  // fallback last-seen rồi @username chỉ khi thiếu cả phòng ban lẫn công ty.
  const defaultSubtitle =
    status === UserStatus.ONLINE
      ? t("common:status.online")
      : buildSuggestionSubtitle(user) ??
        (livePresence?.lastSeenAt
          ? t("common:status.lastSeen", {
              time: formatCalendarDateTime(new Date(livePresence.lastSeenAt)),
            })
          : user.username
            ? `@${user.username}`
            : t("common:status.offline"));

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-micro",
        selected
          ? "bg-[hsl(var(--chat-active-surface)/0.14)] ring-1 ring-[hsl(var(--chat-active-surface)/0.2)]"
          : "hover:bg-surface-overlay/80",
      )}
    >
      <Avatar
        src={user.avatar}
        alt={toDisplayName(user)}
        size="md"
        status={status}
        showStatus
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">
            {toDisplayName(user)}
          </p>
          {meta}
        </div>
        <p className="truncate text-xs text-text-secondary">
          {subtitle || defaultSubtitle}
        </p>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </button>
  );
};

export const FriendsPage: React.FC = () => {
  const { t } = useTranslation(["friends", "common", "profile", "error"]);
  const navigate = useNavigate();
  const { shareCode } = useParams<{ shareCode?: string }>();
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id ?? null;

  const {
    friends,
    friendsTotal,
    friendsHasNext,
    friendsError,
    friendsLoadMoreError,
    isFriendsLoading,
    isFriendsLoadingMore,
    loadMoreFriends,
    incomingRequests,
    isIncomingLoading,
    sentRequests,
    isSentLoading,
    sentCount,
    pendingCount,
    refreshDirectory,
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
  } = useFriendship();

  const initialQuery = searchParams.get("q") || "";
  const initialQrCode = shareCode || searchParams.get("code") || "";
  // `?tab=friends` means the caller already knows this person IS a friend (the
  // command palette), so `q` filters the Bạn bè list instead of searching Khám
  // phá — which hides existing friends and would show "không tìm thấy".
  const wantsFriendsTab = searchParams.get("tab") === "friends";
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialQrCode.trim().length > 0
      ? "qr"
      : wantsFriendsTab
        ? "friends"
        : initialQuery.trim().length >= 2
          ? "discover"
          : "friends",
  );
  const [requestTab, setRequestTab] = useState<RequestTabKey>("incoming");
  const [friendFilter, setFriendFilter] = useState(
    wantsFriendsTab ? initialQuery : "",
  );
  const [query, setQuery] = useState(wantsFriendsTab ? "" : initialQuery);
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );
  const debouncedQuery = useDebounce(query, 250);

  const {
    suggestions: suggestionDtos,
    hasLoaded: suggestionsHasLoaded,
    isLoading: isSuggestionsLoading,
    isLoadingMore: isSuggestionsLoadingMore,
    hasNext: suggestionsHasNext,
    error: suggestionsError,
    loadMoreError: suggestionsLoadMoreError,
    loadMore: loadMoreSuggestions,
    reload: reloadSuggestions,
  } = useFriendSuggestions({ enabled: activeTab === "discover" });

  const suggestions = useMemo(
    () => suggestionDtos.map(toSuggestionContact),
    [suggestionDtos],
  );

  const visiblePresenceIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach((user) => ids.add(user.id));
    incomingRequests.forEach(
      (request) => request.requester?.id && ids.add(request.requester.id),
    );
    sentRequests.forEach(
      (request) => request.addressee?.id && ids.add(request.addressee.id),
    );
    searchResults.forEach((user) => ids.add(user.id));
    suggestions.forEach((user) => ids.add(user.id));
    return Array.from(ids);
  }, [friends, incomingRequests, searchResults, sentRequests, suggestions]);

  usePresence({
    userIds: visiblePresenceIds,
    enabled: visiblePresenceIds.length > 0,
  });

  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const [prevSearchParamsStr, setPrevSearchParamsStr] = useState(() => searchParams.toString());
  const [prevShareCode, setPrevShareCode] = useState(shareCode);

  if (searchParams.toString() !== prevSearchParamsStr || shareCode !== prevShareCode) {
    setPrevSearchParamsStr(searchParams.toString());
    setPrevShareCode(shareCode);

    const nextQuery = searchParams.get("q") || "";
    const nextQrCode = shareCode || searchParams.get("code") || "";
    const nextWantsFriendsTab = searchParams.get("tab") === "friends";

    if (nextWantsFriendsTab) {
      if (friendFilter !== nextQuery) setFriendFilter(nextQuery);
      if (query !== "") setQuery("");
    } else if (query !== nextQuery) {
      setQuery(nextQuery);
    }

    if (nextQrCode.trim().length > 0) {
      if (activeTab !== "qr") setActiveTab("qr");
    } else if (nextWantsFriendsTab) {
      if (activeTab !== "friends") setActiveTab("friends");
    } else if (nextQuery.trim().length >= 2) {
      if (activeTab !== "discover") setActiveTab("discover");
    }
  }

  const searchUsers = useCallback(
    async (rawQuery: string) => {
      if (!rawQuery.trim() || rawQuery.trim().length < 2) {
        setSearchResults([]);
        setSearchError(null);
        return;
      }

      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await userApi.searchUsers(
          rawQuery.trim(),
          1,
          USERS_SEARCH_PAGE_SIZE,
        );
        const payload = unwrapApiSuccess(response);
        setSearchResults(normalizeSearchResults(payload));
      } catch (error) {
        const apiError = extractApiError(error);
        setSearchError(apiError.requestId ?? apiError.message);
        toast.error(t("profile:toast.searchUsersFailed"));
      } finally {
        setIsSearching(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (activeTab !== "discover") return;
    const timer = window.setTimeout(() => {
      void searchUsers(debouncedQuery);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, debouncedQuery, searchUsers]);

  const friendIdSet = useMemo(
    () => new Set(friends.map((f) => f.id)),
    [friends],
  );

  const handleMessage = useCallback(
    async (userId: string) => {
      setActingKey(`message:${userId}`);
      try {
        const response =
          await conversationApi.createPrivateConversation(userId);
        const room = unwrapApiSuccess(response) as { id?: string };
        if (room.id) {
          navigate(`${ROUTE_PATHS.CHAT}/${room.id}`);
        }
      } catch (error) {
        const apiError = extractApiError(error);
        if (apiError.code === ErrorCode.DIRECT_CHAT_TARGET_UNAVAILABLE) {
          void refreshDirectory();
        }
        toast.error(
          apiError.message || t("error:chat.startConversationFailed"),
        );
      } finally {
        setActingKey(null);
      }
    },
    [navigate, refreshDirectory, t],
  );

  const handleRelationshipAction = useCallback(
    async (
      key: string,
      action: () => Promise<boolean>,
      successMessage: string,
    ) => {
      if (actingKey) {
        return;
      }

      setActingKey(key);
      try {
        const success = await action();
        if (!success) {
          toast.error(t("friends:actionFailed"));
          return;
        }
        toast.success(successMessage);
      } finally {
        setActingKey(null);
      }
    },
    [actingKey, t],
  );

  const renderRelationshipAction = (user: ContactUser) => {
    const relationship = getRelationshipState(user.id, currentUserId);
    const actionKeyPrefix = user.id;
    const action = getFriendshipAction(user, relationship);

    switch (action.kind) {
      case "self":
        return (
          <span className="rounded-full bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary">
            {t("friends:relationship.self")}
          </span>
        );
      case "message":
        return (
          <Button
            type="button"
            size="sm"
            variant="brand"
            isLoading={actingKey === `message:${actionKeyPrefix}`}
            onClick={(event) => {
              stopPropagation(event);
              void handleMessage(user.id);
            }}
          >
            {t("friends:message")}
          </Button>
        );
      case "accept_decline":
        if (relationship.kind !== "incoming_request") {
          return null;
        }
        return (
          <div className="flex items-center gap-2">
            {relationship.capabilities.canAccept ? (
              <Button
                type="button"
                size="sm"
                variant="brand"
                isLoading={actingKey === `accept:${actionKeyPrefix}`}
                onClick={(event) => {
                  stopPropagation(event);
                  void handleRelationshipAction(
                    `accept:${actionKeyPrefix}`,
                    () => acceptFriendRequest(relationship.requestId),
                    t("friends:requestAccepted"),
                  );
                }}
              >
                {t("friends:accept")}
              </Button>
            ) : null}
            {relationship.capabilities.canDecline ? (
              <Button
                type="button"
                size="sm"
                variant="brand-outline"
                isLoading={actingKey === `decline:${actionKeyPrefix}`}
                onClick={(event) => {
                  stopPropagation(event);
                  void handleRelationshipAction(
                    `decline:${actionKeyPrefix}`,
                    () => rejectFriendRequest(relationship.requestId),
                    t("friends:requestRejected"),
                  );
                }}
              >
                {t("friends:reject")}
              </Button>
            ) : null}
          </div>
        );
      case "cancel":
        if (relationship.kind !== "outgoing_request") {
          return (
            <span className="rounded-full bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary">
              {t("friends:relationship.outgoing")}
            </span>
          );
        }
        return (
          <Button
            type="button"
            size="sm"
            variant="brand-outline"
            isLoading={actingKey === `cancel:${actionKeyPrefix}`}
            onClick={(event) => {
              stopPropagation(event);
              void handleRelationshipAction(
                `cancel:${actionKeyPrefix}`,
                () => cancelFriendRequest(relationship.requestId),
                t("friends:requestCancelled"),
              );
            }}
        >
          {t("friends:sentRequests.cancel")}
        </Button>
      );
      case "pending":
        return (
          <span className="rounded-full bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary">
            {t("friends:relationship.outgoing")}
          </span>
        );
      case "blocked":
        return (
          <span className="rounded-full bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary">
            {t("friends:relationship.notFriend")}
          </span>
        );
      case "add":
        return (
          <Button
            type="button"
            size="sm"
            variant="brand"
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            isLoading={actingKey === `add:${actionKeyPrefix}`}
            onClick={(event) => {
              stopPropagation(event);
              void handleRelationshipAction(
                `add:${actionKeyPrefix}`,
                () => sendFriendRequest(user.id),
                t("friends:requestSent"),
              );
            }}
        >
          {t("friends:addFriend")}
        </Button>
      );
      default:
        return null;
    }
  };

  const tabs = [
    {
      id: "friends" as const,
      label: t("friends:tabs.friends"),
      count: friendsTotal,
    },
    {
      id: "requests" as const,
      label: t("friends:tabs.requests"),
      count: pendingCount,
    },
    {
      id: "discover" as const,
      label: t("friends:tabs.discover"),
    },
    {
      id: "qr" as const,
      label: t("friends:tabs.qr"),
    },
  ];

  const isDirectoryLoading =
    isFriendsLoading || isIncomingLoading || isSentLoading;

  // Enrich display names for friends whose displayName is an email (FriendshipUserDto
  // doesn't carry firstName/lastName; fetch /users/{id} to get the actual name).
  const [enrichedNameMap, setEnrichedNameMap] = useState<Record<string, string>>({});
  // Phòng ban/công ty không nằm trong FriendshipUserDto → enrich từ /users/batch
  // (giống tên), để dòng phụ khi offline hiện "phòng ban · công ty".
  const [enrichedHrMap, setEnrichedHrMap] = useState<
    Record<string, { department?: string | null; company?: string | null }>
  >({});
  useEffect(() => {
    // Enrich MỌI bạn bè trong ONE batch request: tên (khi displayName là email)
    // + phòng ban/công ty (luôn cần cho dòng phụ).
    const idsToEnrich = friends.map((friend) => friend.id);
    if (idsToEnrich.length === 0) return;

    let cancelled = false;
    void loadUserProfiles(idsToEnrich)
      .then((profileMap) => {
        if (cancelled) return;

        const resolvedNames: Record<string, string> = {};
        const resolvedHr: Record<
          string,
          { department?: string | null; company?: string | null }
        > = {};
        for (const [id, profile] of Object.entries(profileMap)) {
          if (!profile) continue;
          const name = resolveUserDisplayName(profile, { allowLegacyFallback: false });
          if (name && name !== "Unknown user") {
            resolvedNames[id] = name;
          }
          if (profile.department || profile.company) {
            resolvedHr[id] = { department: profile.department, company: profile.company };
          }
        }

        if (Object.keys(resolvedNames).length > 0) {
          setEnrichedNameMap((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [id, name] of Object.entries(resolvedNames)) {
              if (next[id] !== name) {
                next[id] = name;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
        if (Object.keys(resolvedHr).length > 0) {
          setEnrichedHrMap((prev) => ({ ...prev, ...resolvedHr }));
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [friends]);

  const friendItems = useMemo(
    () =>
      friends.map((friend) => {
        const contact = toContactUser(friend);
        const enriched = enrichedNameMap[friend.id];
        const hr = enrichedHrMap[friend.id];
        // "Tên gợi nhớ" (alias) wins over enriched/real name — same rule as
        // ChatHeader/RoomItem/UserProfile so the list matches every other view.
        const preferredName = friend.alias || enriched;
        return {
          ...contact,
          ...(preferredName ? { displayName: preferredName } : {}),
          departmentName: contact.departmentName ?? hr?.department ?? undefined,
          orgUnit: contact.orgUnit ?? hr?.company ?? undefined,
        };
      }),
    [friends, enrichedNameMap, enrichedHrMap],
  );

  // ponytail: lọc client-side trong số bạn ĐÃ tải. Nếu cần tìm bạn ở trang chưa
  // tải (list rất dài), nâng lên gọi API /friends?q= khi backend hỗ trợ.
  // Khớp qua `matchesContactQuery` để CÙNG luật với tab Khám phá (bỏ dấu).
  const visibleFriendItems = useMemo(() => {
    if (!friendFilter.trim()) return friendItems;
    return friendItems.filter((friend) =>
      matchesContactQuery(friendFilter, [
        toDisplayName(friend),
        friend.username,
      ]),
    );
  }, [friendItems, friendFilter]);

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining > 96) {
        return;
      }

      // Bạn bè: KHÔNG auto-load — dùng nút "Xem thêm" thủ công (nhẹ tải hơn).
      if (activeTab === "discover" && debouncedQuery.trim().length < 2) {
        if (
          isSuggestionsLoading ||
          isSuggestionsLoadingMore ||
          !suggestionsHasNext
        ) {
          return;
        }
        void loadMoreSuggestions();
      }
    },
    [
      activeTab,
      debouncedQuery,
      isSuggestionsLoading,
      isSuggestionsLoadingMore,
      loadMoreSuggestions,
      suggestionsHasNext,
    ],
  );


  const renderFriendsTab = () => {
    if (isFriendsLoading && friendItems.length === 0) {
      return (
        <DirectorySkeleton count={6} />
      );
    }

    if (friendsError && friendItems.length === 0) {
      return (
        <StateBlock
          icon={<UserGroupIcon className="h-6 w-6" />}
          title={t("friends:actionFailed")}
          description={t("friends:empty.friendsBody")}
          className="border-dashed shadow-none"
        />
      );
    }

    if (!isFriendsLoading && friendsTotal === 0) {
      return (
        <StateBlock
          icon={<UserGroupIcon className="h-6 w-6" />}
          title={t("friends:empty.friendsTitle")}
          description={t("friends:empty.friendsBody")}
          className="border-dashed shadow-none"
        />
      );
    }

    const isFiltering = friendFilter.trim().length > 0;

    return (
      <div className="space-y-2">
        <Input
          type="text"
          value={friendFilter}
          onChange={(event) => setFriendFilter(event.target.value)}
          placeholder={t("friends:filterPlaceholder")}
          leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
        />

        {isFiltering && visibleFriendItems.length === 0 ? (
          <StateBlock
            variant="search-empty"
            icon={<MagnifyingGlassIcon className="h-6 w-6" />}
            title={t("friends:noSearchResult")}
            description={t("friends:filterHintBody")}
            className="border-dashed shadow-none"
          />
        ) : (
          <div className="space-y-1">
            {visibleFriendItems.map((friend) => (
              <ContactRow
                key={friend.id}
                user={friend}
                selected={previewTarget?.userId === friend.id}
                onClick={() => setPreviewTarget(profileFromSummary(friend))}
                action={renderRelationshipAction(friend)}
              />
            ))}
            {isFriendsLoadingMore ? <DirectorySkeleton count={2} /> : null}
            {/* Nút "Xem thêm" ẩn khi đang lọc — loadMore không giúp cho filter cục bộ. */}
            {!isFiltering && !isFriendsLoadingMore && friendsHasNext ? (
              <div className="px-2 py-2 text-center">
                <Button
                  type="button"
                  size="sm"
                  variant="brand-outline"
                  onClick={() => void loadMoreFriends()}
                >
                  {friendsLoadMoreError
                    ? t("common:actions.retry")
                    : `${t("common:actions.loadMore")} (${friendItems.length}/${friendsTotal})`}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const requestItems =
    requestTab === "incoming" ? incomingRequests : sentRequests;

  const renderRequestsTab = () => (
    <div className="space-y-4">
      <SegmentedControl
        value={requestTab}
        onChange={(next) => setRequestTab(next as RequestTabKey)}
        options={[
          {
            id: "incoming",
            label: t("friends:requests.incoming"),
            count: pendingCount,
          },
          {
            id: "sent",
            label: t("friends:requests.sent"),
            count: sentCount,
          },
        ]}
        ariaLabel={t("friends:tabs.requests")}
        size="sm"
      />

      {((requestTab === "incoming" && isIncomingLoading) ||
        (requestTab === "sent" && isSentLoading)) &&
      requestItems.length === 0 ? (
        <DirectorySkeleton count={4} />
      ) : requestItems.length === 0 ? (
        <StateBlock
          variant="empty"
          icon={<UserPlusIcon className="h-6 w-6" />}
          title={
            requestTab === "incoming"
              ? t("friends:empty.requestsIncomingTitle")
              : t("friends:empty.requestsSentTitle")
          }
          description={
            requestTab === "incoming"
              ? t("friends:empty.requestsIncomingBody")
              : t("friends:empty.requestsSentBody")
          }
          className="border-dashed shadow-none"
        />
      ) : (
        <div className="space-y-1">
          {requestItems.map((request) => {
            const user = getFriendRequestDisplayUser(request, requestTab);
            const contactUser = toContactUser(user);
            const displayName = getFriendRequestDisplayLabel(user);

            const subtitle =
              requestTab === "incoming"
                ? t("friends:requestReceivedAt", {
                    date: formatCalendarDate(new Date(request.createdAt)),
                  })
                : t("friends:requestSentAt", {
                    date: formatCalendarDate(new Date(request.createdAt)),
                  });

            return (
              <ContactRow
                key={request.relationId}
                user={{
                  ...contactUser,
                  displayName,
                }}
                subtitle={subtitle}
                selected={previewTarget?.userId === contactUser.id}
                onClick={() =>
                  setPreviewTarget(
                    profileFromSummary({
                      ...contactUser,
                      displayName,
                    }),
                  )
                }
                action={renderRelationshipAction(contactUser)}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  const sortedSearchResults = useMemo(() => {
    // Khám phá = tìm người LẠ để kết bạn. Ẩn bạn cũ + chính mình (tìm bạn cũ
    // đã có ô lọc riêng ở tab Bạn bè). Vẫn giữ pending/incoming để user thao tác.
    const strangers = searchResults.filter((user) => {
      if (currentUserId && user.id === currentUserId) return false;
      if (friendIdSet.has(user.id)) return false;
      if (user.isFriend === true) return false;
      if (isAcceptedFriendshipStatus(user.friendshipStatus)) return false;
      // `/users/search` khớp gần đúng (trigram) nên vẫn lẫn người không liên quan.
      // Lọc lại theo cùng luật với tab Bạn bè.
      return matchesContactQuery(debouncedQuery, [
        toDisplayName(user),
        user.username,
        user.employeeCode,
      ]);
    });
    return sortByProximity(strangers, currentUser);
  }, [searchResults, currentUser, currentUserId, friendIdSet, debouncedQuery]);

  const filteredSuggestions = useMemo(
    () =>
      filterFriendSuggestions(suggestions, {
        currentUserId: currentUserId,
        friendIds: friendIdSet,
        getRelationshipState: (userId) =>
          getRelationshipState(userId, currentUserId),
      }),
    [currentUserId, friendIdSet, getRelationshipState, suggestions],
  );

  const renderDiscoverTab = () => {
    const hasQuery = debouncedQuery.trim().length >= 2;

    return (
      <div className="space-y-4">
        {searchError && sortedSearchResults.length > 0 ? (
          <p className="px-1 text-xs text-danger">
            {t("profile:toast.searchUsersFailed")}
          </p>
        ) : null}
        {isSearching ? (
          <DirectorySkeleton count={4} />
        ) : hasQuery ? (
          sortedSearchResults.length === 0 ? (
            <StateBlock
              variant="search-empty"
              icon={<MagnifyingGlassIcon className="h-6 w-6" />}
              title={t("friends:noSearchResult")}
              description={t("friends:discoverHintBody")}
              className="border-dashed shadow-none"
            />
          ) : (
            <div className="space-y-1">
              {sortedSearchResults.map((user) => (
                <ContactRow
                  key={user.id}
                  user={user}
                  subtitle={buildSuggestionSubtitle(user)}
                  selected={previewTarget?.userId === user.id}
                  onClick={() => setPreviewTarget(profileFromSummary(user))}
                  action={renderRelationshipAction(user)}
                />
              ))}
            </div>
          )
        ) : isSuggestionsLoading || !suggestionsHasLoaded ? (
          <DirectorySkeleton count={4} />
        ) : suggestionsError && filteredSuggestions.length === 0 ? (
          <StateBlock
            variant="error"
            icon={<UserPlusIcon className="h-6 w-6" />}
            title={t("friends:suggestionsError")}
            description={t("friends:discoverHintBody")}
            primaryAction={{
              label: t("common:actions.retry"),
              onClick: () => void reloadSuggestions(),
            }}
            className="border-dashed shadow-none"
          />
        ) : (
          <div className="space-y-2">
            {filteredSuggestions.length === 0 ? (
              <StateBlock
                variant="empty"
                icon={<UserPlusIcon className="h-6 w-6" />}
                title={t("friends:suggestionsEmpty")}
                description={t("friends:discoverHintBody")}
                className="border-dashed shadow-none"
              />
            ) : (
              <>
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("friends:suggestions")}
                </p>
                <div className="space-y-1">
                  {filteredSuggestions.map((user) => (
                    <ContactRow
                      key={user.id}
                      user={user}
                      subtitle={buildSuggestionReasonSubtitle(user)}
                      selected={previewTarget?.userId === user.id}
                      onClick={() => setPreviewTarget(profileFromSummary(user))}
                      action={renderRelationshipAction(user)}
                    />
                  ))}
                </div>
                {isSuggestionsLoadingMore ? (
                  <DirectorySkeleton count={2} />
                ) : null}
                {suggestionsLoadMoreError ? (
                  <div className="px-2 py-2 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="brand-outline"
                      onClick={() => void loadMoreSuggestions()}
                    >
                      {t("common:actions.retry")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    );
  };



  const renderQrTab = () => (
    <FriendQrWorkspace initialShareCode={shareCode ?? null} />
  );

  return (
    <AppPage layout="workspace">
      <AppPageHeader
        title={t("friends:title")}
        subtitle={t("friends:subtitle")}
        badge={
          pendingCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-[#1976D2]/10 px-2 py-1 text-[11px] font-semibold text-[#1565C0]">
              {t("friends:requests.incoming")} {pendingCount}
            </span>
          ) : null
        }
        actions={
          isDirectoryLoading ? (
            <div className="inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md border border-border/60 bg-surface">
              <SkeletonCircle size={16} />
            </div>
          ) : null
        }
      />

      <AppPageBody>
        {/* grid-rows-[minmax(0,1fr)]: without an explicit 0-min row the grid
            items size to their CONTENT, so a long friend list grows past
            .app-page-body (flex:1; overflow:hidden) and is clipped mid-row with
            no scrollbar — friends below the cut become unreachable. Worst at OS
            scaling 125/150%, where the viewport is short. */}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(22rem,27rem),minmax(0,1fr)]">
          <section className="app-page-panel flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border/60 p-4">
              <SegmentedControl
                value={activeTab}
                onChange={(next) => setActiveTab(next as TabKey)}
                options={tabs.map((tab) => ({
                  id: tab.id,
                  label: tab.label,
                  count: tab.count,
                }))}
                ariaLabel={t("friends:title")}
                size="sm"
              />

              {activeTab === "discover" ? (
                <div className="mt-3">
                  <Input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("friends:searchPlaceholder")}
                    leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
                  />
                </div>
              ) : null}
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto p-3"
              onScroll={handleListScroll}
            >
              {activeTab === "friends" && renderFriendsTab()}
              {activeTab === "requests" && renderRequestsTab()}
              {activeTab === "discover" && renderDiscoverTab()}

              {activeTab === "qr" && (
                <>
                  <div className="hidden lg:block">
                    <StateBlock
                      icon={<UserGroupIcon className="h-6 w-6" />}
                      title={t("friends:tabs.qr")}
                      description={t("friends:previewBody")}
                      className="min-h-[12rem] border-dashed shadow-none"
                    />
                  </div>
                  <div className="lg:hidden">{renderQrTab()}</div>
                </>
              )}
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col overflow-hidden lg:flex">
            <div className="app-page-panel flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="border-b border-border/60 px-5 py-4">
                <h2 className="text-base font-semibold text-text-primary">
                  {activeTab === "qr"
                    ? t("friends:tabs.qr")
                    : previewTarget
                      ? toDisplayName(previewTarget.initialUser)
                      : t("friends:previewTitle")}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {activeTab === "qr"
                    ? t("friends:subtitle")
                    : t("friends:previewBody")}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {activeTab === "qr" ? (
                  <div className="h-full overflow-y-auto p-4">
                    {renderQrTab()}
                  </div>
                ) : previewTarget ? (
                  <UserProfile
                    userId={previewTarget.userId}
                    currentUserId={currentUserId ?? ""}
                    initialUser={previewTarget.initialUser}
                    onClose={() => setPreviewTarget(null)}
                    onStartConversation={handleMessage}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-6">
                    <StateBlock
                      icon={<UserGroupIcon className="h-6 w-6" />}
                      title={t("friends:previewTitle")}
                      description={t("friends:previewBody")}
                      className="w-full border-dashed shadow-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </AppPageBody>

      {previewTarget ? (
        <>
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-full bg-[hsl(var(--chat-panel-bg))] sm:max-w-[min(26rem,94vw)] lg:hidden">
            <UserProfile
              userId={previewTarget.userId}
              currentUserId={currentUserId ?? ""}
              initialUser={previewTarget.initialUser}
              onClose={() => setPreviewTarget(null)}
              onStartConversation={handleMessage}
            />
          </div>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-text-primary/45 lg:hidden"
            onClick={() => setPreviewTarget(null)}
            aria-label={t("common:actions.close")}
          />
        </>
      ) : null}
    </AppPage>
  );
};

export default FriendsPage;
