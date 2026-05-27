import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
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
import { useAuthStore, useChatStore, usePresenceStore } from "../stores";
import { useDebounce } from "../hooks/useDebounce";
import { useFriendship } from "../hooks/useFriendship";
import { usePresence } from "../hooks/usePresence";
import { conversationApi, userApi } from "../services/api";
import {
  extractApiError,
  unwrapApiSuccess,
} from "../lib/apiContract";
import type { ApiResponse } from "@hacom/chat-shared-types/core";
import { ROUTE_PATHS } from "../router/paths";
import { UserStatus } from "../types";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import {
  getFriendRequestDisplayLabel,
  getFriendRequestDisplayUser,
} from "../features/friends/requestDisplay";

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
});


const buildSuggestionSubtitle = (user: ContactUser): string | undefined => {
  const parts = [
    user.departmentName ?? null,
    user.orgUnit ?? user.unitCode ?? null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
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

  const status =
    livePresence?.state === "online"
      ? UserStatus.ONLINE
      : (user.status ?? UserStatus.OFFLINE);

  const defaultSubtitle =
    status === UserStatus.ONLINE
      ? t("common:status.online")
      : livePresence?.lastSeenAt
        ? t("common:status.lastSeen", {
            time: new Date(livePresence.lastSeenAt).toLocaleString(),
          })
        : user.username
          ? `@${user.username}`
          : t("common:status.offline");

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
  const conversationsFromStore = useChatStore((state) => state.conversations);

  const {
    friends,
    isFriendsLoading,
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
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialQrCode.trim().length > 0
      ? "qr"
      : initialQuery.trim().length >= 2
        ? "discover"
        : "friends",
  );
  const [requestTab, setRequestTab] = useState<RequestTabKey>("incoming");
  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<ContactUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<ContactUser[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null,
  );
  const debouncedQuery = useDebounce(query, 250);

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

    if (query !== nextQuery) {
      setQuery(nextQuery);
    }

    if (nextQrCode.trim().length > 0) {
      if (activeTab !== "qr") setActiveTab("qr");
    } else if (nextQuery.trim().length >= 2) {
      if (activeTab !== "discover") setActiveTab("discover");
    }
  }

  const searchUsers = useCallback(
    async (rawQuery: string) => {
      if (!rawQuery.trim() || rawQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await userApi.searchUsers(rawQuery.trim(), 1, 20);
        const payload = unwrapApiSuccess(response);
        setSearchResults(normalizeSearchResults(payload));
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.searchUsersFailed"));
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (activeTab !== "discover") return;
    void searchUsers(debouncedQuery);
  }, [activeTab, debouncedQuery, searchUsers]);

  const friendIdSet = useMemo(
    () => new Set(friends.map((f) => f.id)),
    [friends],
  );

  // Trích participants từ các conversation đã có làm fallback nguồn gợi ý
  // — bảo đảm có người hiện ra ngay cả khi API search/suggestions không trả gì.
  const participantsFromConversations = useMemo<ContactUser[]>(() => {
    const map = new Map<string, ContactUser>();
    for (const conv of conversationsFromStore) {
      const list = (conv as { participants?: Array<Record<string, unknown>> })
        .participants;
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        const id = typeof p.id === "string" ? p.id : "";
        if (!id || map.has(id)) continue;
        map.set(
          id,
          toContactUser({
            id,
            username: typeof p.username === "string" ? p.username : undefined,
            displayName:
              typeof p.displayName === "string" ? p.displayName : undefined,
            firstName:
              typeof p.firstName === "string" ? p.firstName : undefined,
            lastName: typeof p.lastName === "string" ? p.lastName : undefined,
            avatar:
              (typeof p.avatar === "string" && p.avatar) ||
              (typeof p.avatarUrl === "string" ? p.avatarUrl : undefined),
            status: normalizeStatus(p.status),
            departmentName:
              typeof p.departmentName === "string"
                ? p.departmentName
                : undefined,
            orgUnit: typeof p.orgUnit === "string" ? p.orgUnit : undefined,
            unitCode: typeof p.unitCode === "string" ? p.unitCode : undefined,
            title: typeof p.title === "string" ? p.title : undefined,
          }),
        );
      }
    }
    return Array.from(map.values());
  }, [conversationsFromStore]);

  useEffect(() => {
    if (activeTab !== "discover") return;
    const controller = new AbortController();
    setIsSuggestionsLoading(true);

    const tryFetch = async (
      fn: () => Promise<unknown>,
    ): Promise<ContactUser[]> => {
      try {
        const res = await fn();
        return normalizeSearchResults(unwrapApiSuccess(res as ApiResponse<unknown>));
      } catch {
        return [];
      }
    };

    const loadSuggestions = async () => {
      const collected = new Map<string, ContactUser>();
      const addAll = (items: ContactUser[]) => {
        for (const u of items) {
          if (!u.id) continue;
          if (u.id === currentUser?.id) continue;
          if (friendIdSet.has(u.id)) continue;
          if (!collected.has(u.id)) collected.set(u.id, u);
        }
      };

      // 0. Seed ngay từ participants của các conversation hiện có
      //    → list không trống trong lúc network đang chạy.
      addAll(participantsFromConversations);

      // 1. Endpoint suggestions chính thức (nếu có)
      addAll(
        await tryFetch(() =>
          userApi.getSuggestions(30, { signal: controller.signal }),
        ),
      );

      // 2. Quét toàn bộ tài khoản: gọi search theo từng chữ cái a-z + ký tự VN
      //    (backend chưa có endpoint list-all) → gom dedup → sort theo tên.
      const ALPHABET = "abcdefghijklmnopqrstuvwxyzăâđêôơư".split("");
      const results = await Promise.all(
        ALPHABET.map((ch) =>
          tryFetch(() =>
            userApi.searchUsers(ch, 1, 50, { signal: controller.signal }),
          ),
        ),
      );
      results.forEach(addAll);

      if (!controller.signal.aborted) {
        const sorted = Array.from(collected.values()).sort((a, b) =>
          toDisplayName(a).localeCompare(toDisplayName(b), "vi"),
        );
        setSuggestions(sorted);
      }
    };

    loadSuggestions().finally(() => {
      if (!controller.signal.aborted) setIsSuggestionsLoading(false);
    });
    return () => controller.abort();
    // participantsFromConversations dùng làm seed nhanh — không đưa vào deps
    // để tránh re-fetch alphabet mỗi khi conversations đổi (presence/typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser, friendIdSet]);

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
    [t],
  );

  const renderRelationshipAction = (user: ContactUser) => {
    const relationship = getRelationshipState(user.id, currentUserId);
    const capabilities = relationship.capabilities;
    const actionKeyPrefix = user.id;

    switch (relationship.kind) {
      case "self":
        return (
          <span className="rounded-full bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary">
            {t("friends:relationship.self")}
          </span>
        );
      case "friend":
        if (!capabilities.canMessage) {
          return null;
        }
        return (
          <Button
            type="button"
            size="sm"
            variant="brand-yellow"
            isLoading={actingKey === `message:${actionKeyPrefix}`}
            onClick={(event) => {
              stopPropagation(event);
              void handleMessage(user.id);
            }}
          >
            {t("friends:message")}
          </Button>
        );
      case "incoming_request":
        return (
          <div className="flex items-center gap-2">
            {capabilities.canAccept ? (
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
            {capabilities.canDecline ? (
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
      case "outgoing_request":
        if (!capabilities.canCancel) {
          return null;
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
      default:
        if (!capabilities.canSendRequest) {
          return null;
        }
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
    }
  };

  const tabs = [
    {
      id: "friends" as const,
      label: t("friends:tabs.friends"),
      count: friends.length,
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

  const friendItems = useMemo(
    () => friends.map((friend) => toContactUser(friend)),
    [friends],
  );


  const renderFriendsTab = () => {
    if (isFriendsLoading && friendItems.length === 0) {
      return (
        <DirectorySkeleton count={6} />
      );
    }

    if (friendItems.length === 0) {
      return (
        <StateBlock
          icon={<UserGroupIcon className="h-6 w-6" />}
          title={t("friends:empty.friendsTitle")}
          description={t("friends:empty.friendsBody")}
          className="border-dashed shadow-none"
        />
      );
    }

    return (
      <div className="space-y-1">
        {friendItems.map((friend) => (
          <ContactRow
            key={friend.id}
            user={friend}
            selected={previewTarget?.userId === friend.id}
            onClick={() => setPreviewTarget(profileFromSummary(friend))}
            action={renderRelationshipAction(friend)}
          />
        ))}
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
                    date: new Date(request.createdAt).toLocaleDateString(),
                  })
                : t("friends:requestSentAt", {
                    date: new Date(request.createdAt).toLocaleDateString(),
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

  const sortedSearchResults = useMemo(
    () => sortByProximity(searchResults, currentUser),
    [searchResults, currentUser],
  );

  const renderDiscoverTab = () => {
    const hasQuery = debouncedQuery.trim().length >= 2;

    return (
      <div className="space-y-4">
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
        ) : isSuggestionsLoading ? (
          <DirectorySkeleton count={4} />
        ) : (
          <div className="space-y-2">
            {suggestions.length > 0 && (
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t("friends:suggestions")}
              </p>
            )}
            <div className="space-y-1">
              {suggestions.map((user) => (
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
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(22rem,27rem),minmax(0,1fr)]">
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

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
