import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import {
  MagnifyingGlassIcon,
  NoSymbolIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../components/common/Avatar";
import { FriendQrWorkspace } from "../components/friends";
import { UserProfile } from "../components/info/UserProfile";
import {
  Button,
  Input,
  SegmentedControl,
  Spinner,
  StateBlock,
  toast,
} from "../components/ui";
import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { useAuthStore, usePresenceStore } from "../stores";
import { useDebounce } from "../hooks/useDebounce";
import { useFriendship } from "../hooks/useFriendship";
import { usePresence } from "../hooks/usePresence";
import { conversationApi, userApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import { UserStatus } from "../types";

type TabKey = "friends" | "requests" | "discover" | "blocked" | "qr";
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
  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (displayName) return displayName;

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (fullName) return fullName;

  return user.username || user.id;
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
  unitCode: value.unitCode,
  title: value.title,
  createdAt: value.createdAt,
});

const buildSearchContextSubtitle = (user: ContactUser): string | undefined => {
  const parts = [
    user.username ? `@${user.username}` : null,
    user.employeeCode ?? null,
    user.departmentName ?? null,
    user.unitCode ?? user.title ?? null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : undefined;
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

  const {
    friends,
    isFriendsLoading,
    incomingRequests,
    isIncomingLoading,
    sentRequests,
    isSentLoading,
    blockedUsers,
    isBlockedLoading,
    pendingCount,
    refreshDirectory,
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    unblockUser,
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
    return Array.from(ids);
  }, [friends, incomingRequests, searchResults, sentRequests]);

  usePresence({
    userIds: visiblePresenceIds,
    enabled: visiblePresenceIds.length > 0,
  });

  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  useEffect(() => {
    const nextQuery = searchParams.get("q") || "";
    const nextQrCode = shareCode || searchParams.get("code") || "";
    setQuery((current) => (current === nextQuery ? current : nextQuery));
    if (nextQrCode.trim().length > 0) {
      setActiveTab("qr");
      return;
    }

    if (nextQuery.trim().length >= 2) {
      setActiveTab("discover");
    }
  }, [searchParams, shareCode]);

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
            variant="secondary"
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
                variant="ghost"
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
            variant="secondary"
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
      case "blocked":
        if (!capabilities.canUnblock) {
          return null;
        }
        return (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={actingKey === `unblock:${actionKeyPrefix}`}
            onClick={(event) => {
              stopPropagation(event);
              void handleRelationshipAction(
                `unblock:${actionKeyPrefix}`,
                () => unblockUser(user.id),
                t("friends:unblockSuccess"),
              );
            }}
          >
            {t("friends:unblock")}
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
      id: "blocked" as const,
      label: t("friends:tabs.blocked"),
      count: blockedUsers.length,
    },
    {
      id: "qr" as const,
      label: t("friends:tabs.qr"),
    },
  ];

  const isDirectoryLoading =
    isFriendsLoading || isIncomingLoading || isSentLoading || isBlockedLoading;

  const friendItems = useMemo(
    () => friends.map((friend) => toContactUser(friend)),
    [friends],
  );
  const blockedItems = useMemo(
    () => blockedUsers.map((user) => toContactUser(user)),
    [blockedUsers],
  );

  const renderFriendsTab = () => {
    if (isFriendsLoading && friendItems.length === 0) {
      return (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
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
            count: incomingRequests.length,
          },
          {
            id: "sent",
            label: t("friends:requests.sent"),
            count: sentRequests.length,
          },
        ]}
        ariaLabel={t("friends:tabs.requests")}
        size="sm"
      />

      {((requestTab === "incoming" && isIncomingLoading) ||
        (requestTab === "sent" && isSentLoading)) &&
      requestItems.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
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
            const user =
              requestTab === "incoming" ? request.requester : request.addressee;
            if (!user) return null;
            const contactUser = toContactUser(user);

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
                user={contactUser}
                subtitle={subtitle}
                selected={previewTarget?.userId === contactUser.id}
                onClick={() =>
                  setPreviewTarget(profileFromSummary(contactUser))
                }
                action={renderRelationshipAction(contactUser)}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  const renderDiscoverTab = () => (
    <div className="space-y-4">
      {isSearching ? (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
      ) : debouncedQuery.trim().length < 2 ? (
        <StateBlock
          variant="search-empty"
          icon={<MagnifyingGlassIcon className="h-6 w-6" />}
          title={t("friends:discoverHintTitle")}
          description={t("friends:searchHint")}
          className="border-dashed shadow-none"
        />
      ) : searchResults.length === 0 ? (
        <StateBlock
          variant="search-empty"
          icon={<MagnifyingGlassIcon className="h-6 w-6" />}
          title={t("friends:noSearchResult")}
          description={t("friends:discoverHintBody")}
          className="border-dashed shadow-none"
        />
      ) : (
        <div className="space-y-1">
          {searchResults.map((user) => (
            <ContactRow
              key={user.id}
              user={user}
              subtitle={buildSearchContextSubtitle(user)}
              selected={previewTarget?.userId === user.id}
              onClick={() => setPreviewTarget(profileFromSummary(user))}
              action={renderRelationshipAction(user)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderBlockedTab = () => {
    if (isBlockedLoading && blockedUsers.length === 0) {
      return (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
      );
    }

    if (blockedItems.length === 0) {
      return (
        <StateBlock
          icon={<NoSymbolIcon className="h-6 w-6" />}
          title={t("friends:empty.blockedTitle")}
          description={t("friends:empty.blockedBody")}
          className="border-dashed shadow-none"
        />
      );
    }

    return (
      <div className="space-y-1">
        {blockedItems.map((user) => (
          <ContactRow
            key={user.id}
            user={user}
            selected={previewTarget?.userId === user.id}
            onClick={() => setPreviewTarget(profileFromSummary(user))}
            action={renderRelationshipAction(user)}
          />
        ))}
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
        onBack={() => navigate(ROUTE_PATHS.CHAT)}
        backLabel={t("common:actions.back")}
        badge={
          pendingCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              {t("friends:requests.incoming")} {pendingCount}
            </span>
          ) : null
        }
        actions={
          isDirectoryLoading ? (
            <div className="inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md border border-border/60 bg-surface">
              <Spinner size="xs" />
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
              {activeTab === "blocked" && renderBlockedTab()}
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
