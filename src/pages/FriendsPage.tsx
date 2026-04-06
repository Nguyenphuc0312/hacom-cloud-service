import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../components/common/Avatar";
import { UserProfile } from "../components/info/UserProfile";
import { Button, Input, Spinner, toast } from "../components/ui";
import { useAuthStore, usePresenceStore } from "../stores";
import { useDebounce } from "../hooks/useDebounce";
import { useFriendship } from "../hooks/useFriendship";
import { usePresence } from "../hooks/usePresence";
import { conversationApi, userApi } from "../services/api";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import { UserStatus } from "../types";

type TabKey = "friends" | "requests" | "discover" | "blocked";
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
  createdAt: value.createdAt,
});

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
            defaultValue: `Last seen ${new Date(livePresence.lastSeenAt).toLocaleString()}`,
          })
        : user.username
          ? `@${user.username}`
          : t("common:status.offline");

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all",
        selected
          ? "bg-primary/10 ring-1 ring-primary/15"
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
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialQuery.trim().length >= 2 ? "discover" : "friends",
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
    setQuery((current) => (current === nextQuery ? current : nextQuery));
    if (nextQuery.trim().length >= 2) {
      setActiveTab("discover");
    }
  }, [searchParams]);

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
        toast.error(
          apiError.message ||
            t("profile:toast.searchUsersFailed", {
              defaultValue: "Unable to search users",
            }),
        );
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
        toast.error(
          apiError.message ||
            t("error:chat.startConversationFailed", {
              defaultValue: "Unable to start conversation",
            }),
        );
      } finally {
        setActingKey(null);
      }
    },
    [navigate, t],
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
          toast.error(
            t("friends:actionFailed", { defaultValue: "Action failed" }),
          );
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
            {t("friends:relationship.self", { defaultValue: "You" })}
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
            {t("friends:message", { defaultValue: "Message" })}
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
                    t("friends:requestAccepted", {
                      defaultValue: "Request accepted",
                    }),
                  );
                }}
              >
                {t("friends:accept", { defaultValue: "Accept" })}
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
                    t("friends:requestRejected", {
                      defaultValue: "Request declined",
                    }),
                  );
                }}
              >
                {t("friends:reject", { defaultValue: "Decline" })}
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
                t("friends:requestCancelled", {
                  defaultValue: "Request cancelled",
                }),
              );
            }}
          >
            {t("friends:sentRequests.cancel", { defaultValue: "Cancel" })}
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
                t("friends:unblockSuccess", { defaultValue: "User unblocked" }),
              );
            }}
          >
            {t("friends:unblock", { defaultValue: "Unblock" })}
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
                t("friends:requestSent", {
                  defaultValue: "Friend request sent",
                }),
              );
            }}
          >
            {t("friends:addFriend", { defaultValue: "Add friend" })}
          </Button>
        );
    }
  };

  const tabs = [
    {
      id: "friends" as const,
      label: t("friends:tabs.friends", { defaultValue: "Friends" }),
      count: friends.length,
    },
    {
      id: "requests" as const,
      label: t("friends:tabs.requests", { defaultValue: "Requests" }),
      count: pendingCount,
    },
    {
      id: "discover" as const,
      label: t("friends:tabs.discover", { defaultValue: "Discover" }),
    },
    {
      id: "blocked" as const,
      label: t("friends:tabs.blocked", { defaultValue: "Blocked" }),
      count: blockedUsers.length,
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
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <UserGroupIcon className="mx-auto h-10 w-10 text-text-muted/60" />
          <p className="mt-4 text-base font-medium text-text-primary">
            {t("friends:empty.friendsTitle", {
              defaultValue: "Your contacts will show up here",
            })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("friends:empty.friendsBody", {
              defaultValue:
                "Use Discover to find people and start building your network.",
            })}
          </p>
        </div>
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
      <div className="flex rounded-2xl bg-surface-overlay p-1">
        {(
          [
            {
              id: "incoming",
              label: t("friends:requests.incoming", {
                defaultValue: "Incoming",
              }),
              count: incomingRequests.length,
            },
            {
              id: "sent",
              label: t("friends:requests.sent", { defaultValue: "Sent" }),
              count: sentRequests.length,
            },
          ] as const
        ).map((tab) => {
          const active = tab.id === requestTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRequestTab(tab.id)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-2 rounded-[18px] px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-surface text-text-primary shadow-xs"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <span>{tab.label}</span>
              {tab.count > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {((requestTab === "incoming" && isIncomingLoading) ||
        (requestTab === "sent" && isSentLoading)) &&
      requestItems.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
      ) : requestItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-base font-medium text-text-primary">
            {requestTab === "incoming"
              ? t("friends:empty.requestsIncomingTitle", {
                  defaultValue: "No incoming requests",
                })
              : t("friends:empty.requestsSentTitle", {
                  defaultValue: "No sent requests",
                })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {requestTab === "incoming"
              ? t("friends:empty.requestsIncomingBody", {
                  defaultValue:
                    "When someone adds you, the request will appear here.",
                })
              : t("friends:empty.requestsSentBody", {
                  defaultValue:
                    "People you invite will appear here until they respond.",
                })}
          </p>
        </div>
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
                    defaultValue: "Received {{date}}",
                    date: new Date(request.createdAt).toLocaleDateString(),
                  })
                : t("friends:requestSentAt", {
                    defaultValue: "Sent {{date}}",
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
      <Input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("friends:searchPlaceholder", {
          defaultValue: "Search by username, name, email or phone",
        })}
        leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
      />

      {isSearching ? (
        <div className="flex justify-center py-10">
          <Spinner size="sm" />
        </div>
      ) : debouncedQuery.trim().length < 2 ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-base font-medium text-text-primary">
            {t("friends:discoverHintTitle", {
              defaultValue: "Find people without breaking your flow",
            })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("friends:searchHint", {
              defaultValue: "Enter at least 2 characters",
            })}
          </p>
        </div>
      ) : searchResults.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-base font-medium text-text-primary">
            {t("friends:noSearchResult", { defaultValue: "No users found" })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("friends:discoverHintBody", {
              defaultValue:
                "Try a different keyword or check the username spelling.",
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {searchResults.map((user) => (
            <ContactRow
              key={user.id}
              user={user}
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
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <NoSymbolIcon className="mx-auto h-10 w-10 text-text-muted/60" />
          <p className="mt-4 text-base font-medium text-text-primary">
            {t("friends:empty.blockedTitle", {
              defaultValue: "No blocked users",
            })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("friends:empty.blockedBody", {
              defaultValue:
                "Blocked contacts will appear here so you can review them later.",
            })}
          </p>
        </div>
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

  return (
    <div className="flex h-full min-h-0 bg-background">
      <section className="flex min-w-0 flex-1 flex-col border-r border-border/70 bg-background">
        <header className="sticky top-0 z-10 border-b border-border/70 bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(ROUTE_PATHS.CHAT)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label={t("common:actions.back", { defaultValue: "Back" })}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-text-primary">
                {t("friends:title", { defaultValue: "Friends" })}
              </h1>
              <p className="text-xs text-text-secondary">
                {t("friends:subtitle", {
                  defaultValue: "Contacts, requests and quick profile actions",
                })}
              </p>
            </div>

            {isDirectoryLoading ? (
              <div className="ml-auto">
                <Spinner size="xs" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex rounded-[20px] bg-surface-overlay p-1">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex flex-1 items-center justify-center gap-2 rounded-[16px] px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-surface text-text-primary shadow-xs"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && tab.count > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {activeTab === "friends" && renderFriendsTab()}
          {activeTab === "requests" && renderRequestsTab()}
          {activeTab === "discover" && renderDiscoverTab()}
          {activeTab === "blocked" && renderBlockedTab()}
        </main>
      </section>

      <aside className="hidden w-[clamp(22rem,34vw,26rem)] flex-col bg-surface lg:flex">
        {previewTarget ? (
          <UserProfile
            userId={previewTarget.userId}
            currentUserId={currentUserId ?? ""}
            initialUser={previewTarget.initialUser}
            onClose={() => setPreviewTarget(null)}
            onStartConversation={handleMessage}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <UserGroupIcon className="h-12 w-12 text-text-muted/50" />
            <p className="mt-4 text-base font-medium text-text-primary">
              {t("friends:previewTitle", {
                defaultValue: "Preview a contact",
              })}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {t("friends:previewBody", {
                defaultValue:
                  "Select any friend, request or search result to inspect the profile without leaving this screen.",
              })}
            </p>
          </div>
        )}
      </aside>

      {previewTarget ? (
        <>
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-full border-l border-border bg-surface sm:max-w-[min(26rem,94vw)] lg:hidden">
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
            aria-label={t("common:actions.close", { defaultValue: "Close" })}
          />
        </>
      ) : null}
    </div>
  );
};

export default FriendsPage;
