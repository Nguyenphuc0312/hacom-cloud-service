import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../components/common/Avatar";
import { FriendRequestsPanel } from "../components/friends";
import { Button, Input, Spinner, toast } from "../components/ui";
import { conversationApi, friendshipApi, userApi } from "../services/api";
import { useDebounce } from "../hooks/useDebounce";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { ROUTE_PATHS } from "../router/paths";
import type { PublicUserSummary } from "@hacom/chat-shared-types";

type TabKey = "search" | "requests";

interface IncomingRequestItem {
  id: string;
  sender?: { id?: string };
}

interface SentRequestItem {
  id: string;
  receiver?: { id?: string };
}

const extractArray = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.requests)) return record.requests as T[];
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) return nested.data as T[];
      if (Array.isArray(nested.requests)) return nested.requests as T[];
    }
  }
  return [];
};

const normalizeSearchResults = (payload: unknown): PublicUserSummary[] => {
  const rows = extractArray<Record<string, unknown>>(payload);
  return rows
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return null;

      const firstName = typeof row.firstName === "string" ? row.firstName : "";
      const lastName = typeof row.lastName === "string" ? row.lastName : "";
      const fallbackDisplay = `${firstName} ${lastName}`.trim();

      return {
        id,
        username:
          typeof row.username === "string" ? row.username : undefined,
        displayName:
          (typeof row.displayName === "string" && row.displayName) ||
          fallbackDisplay ||
          (typeof row.username === "string" ? row.username : id),
        avatarUrl:
          (typeof row.avatarUrl === "string" && row.avatarUrl) ||
          (typeof row.avatar === "string" ? row.avatar : undefined),
        isFriend: Boolean(row.isFriend),
        canAddFriend: Boolean(row.canAddFriend),
      } as PublicUserSummary;
    })
    .filter((item): item is PublicUserSummary => item !== null);
};

export const FriendsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("search");
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState<PublicUserSummary[]>([]);
  const [incomingRequestsByUser, setIncomingRequestsByUser] = useState<
    Record<string, string>
  >({});
  const [sentRequestsByUser, setSentRequestsByUser] = useState<
    Record<string, string>
  >({});
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    const queryFromUrl = searchParams.get("q") || "";
    setQuery((current) => (current === queryFromUrl ? current : queryFromUrl));
  }, [searchParams]);

  const loadRequestMaps = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const [incomingResp, sentResp] = await Promise.all([
        friendshipApi.getPendingRequests(),
        friendshipApi.getSentRequests(),
      ]);

      const incoming = extractArray<IncomingRequestItem>(
        unwrapApiSuccess(incomingResp),
      );
      const sent = extractArray<SentRequestItem>(unwrapApiSuccess(sentResp));

      const incomingMap: Record<string, string> = {};
      incoming.forEach((item) => {
        const userId = item.sender?.id;
        if (typeof userId === "string" && userId) {
          incomingMap[userId] = item.id;
        }
      });

      const sentMap: Record<string, string> = {};
      sent.forEach((item) => {
        const userId = item.receiver?.id;
        if (typeof userId === "string" && userId) {
          sentMap[userId] = item.id;
        }
      });

      setIncomingRequestsByUser(incomingMap);
      setSentRequestsByUser(sentMap);
    } catch {
      setIncomingRequestsByUser({});
      setSentRequestsByUser({});
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    void loadRequestMaps();
  }, [loadRequestMaps]);

  const searchUsers = useCallback(async (rawQuery: string) => {
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
  }, [t]);

  useEffect(() => {
    if (activeTab !== "search") return;
    void searchUsers(debouncedQuery);
  }, [activeTab, debouncedQuery, searchUsers]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      void loadRequestMaps();
      if (activeTab === "search" && debouncedQuery.trim().length >= 2) {
        void searchUsers(debouncedQuery);
      }
    };

    window.addEventListener("friend:updated", handler);
    return () => {
      window.removeEventListener("friend:updated", handler);
    };
  }, [activeTab, debouncedQuery, loadRequestMaps, searchUsers]);

  const handleAddFriend = useCallback(
    async (userId: string) => {
      setActingUserId(userId);
      try {
        await friendshipApi.sendFriendRequest(userId);
        toast.success(
          t("friends:requestSent", { defaultValue: "Friend request sent" }),
        );
        await loadRequestMaps();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("friends:actionFailed", {
              defaultValue: "Action failed",
            }),
        );
      } finally {
        setActingUserId(null);
      }
    },
    [loadRequestMaps, t],
  );

  const handleCancelRequest = useCallback(
    async (requestId: string, userId: string) => {
      setActingUserId(userId);
      try {
        await friendshipApi.cancelFriendRequest(requestId);
        toast.success(
          t("friends:requestCancelled", {
            defaultValue: "Friend request canceled",
          }),
        );
        await loadRequestMaps();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("friends:actionFailed", {
              defaultValue: "Action failed",
            }),
        );
      } finally {
        setActingUserId(null);
      }
    },
    [loadRequestMaps, t],
  );

  const handleAccept = useCallback(
    async (requestId: string, userId: string) => {
      setActingUserId(userId);
      try {
        await friendshipApi.acceptFriendRequest(requestId);
        toast.success(
          t("friends:requestAccepted", { defaultValue: "Request accepted" }),
        );
        await loadRequestMaps();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("friends:actionFailed", {
              defaultValue: "Action failed",
            }),
        );
      } finally {
        setActingUserId(null);
      }
    },
    [loadRequestMaps, t],
  );

  const handleDecline = useCallback(
    async (requestId: string, userId: string) => {
      setActingUserId(userId);
      try {
        await friendshipApi.rejectFriendRequest(requestId);
        toast.success(
          t("friends:requestRejected", { defaultValue: "Request declined" }),
        );
        await loadRequestMaps();
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("friends:actionFailed", {
              defaultValue: "Action failed",
            }),
        );
      } finally {
        setActingUserId(null);
      }
    },
    [loadRequestMaps, t],
  );

  const handleMessage = useCallback(
    async (userId: string) => {
      setActingUserId(userId);
      try {
        const response = await conversationApi.createPrivateConversation(userId);
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
        setActingUserId(null);
      }
    },
    [navigate, t],
  );

  const resultRows = useMemo(
    () =>
      searchResults.map((item) => {
        const incomingRequestId = incomingRequestsByUser[item.id];
        const sentRequestId = sentRequestsByUser[item.id];

        return {
          ...item,
          incomingRequestId,
          sentRequestId,
        };
      }),
    [incomingRequestsByUser, searchResults, sentRequestsByUser],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(ROUTE_PATHS.CHAT)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("common:actions.back", { defaultValue: "Back" })}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">
          {t("friends:title", { defaultValue: "Friends" })}
        </h1>
      </header>

      <div className="border-b border-border px-4 py-3">
        <div className="flex rounded-xl bg-surface-overlay p-1">
          {[
            {
              id: "search" as const,
              label: t("friends:tabs.search", { defaultValue: "Search" }),
            },
            {
              id: "requests" as const,
              label: t("friends:tabs.requests", { defaultValue: "Requests" }),
            },
          ].map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface text-text-primary shadow-xs"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "search" && (
          <div className="space-y-4">
            <Input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("friends:searchPlaceholder", {
                defaultValue: "Search by username/email/phone",
              })}
              leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
            />

            {isSearching || isLoadingRequests ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : resultRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                {debouncedQuery.trim().length < 2
                  ? t("friends:searchHint", {
                      defaultValue: "Enter at least 2 characters",
                    })
                  : t("friends:noSearchResult", {
                      defaultValue: "No users found",
                    })}
              </p>
            ) : (
              <ul className="space-y-2">
                {resultRows.map((item) => {
                  const isActing = actingUserId === item.id;
                  const incomingRequestId = item.incomingRequestId;
                  const sentRequestId = item.sentRequestId;
                  const isFriend = Boolean(item.isFriend);

                  return (
                    <li
                      key={item.id}
                      className="rounded-xl border border-border bg-surface-raised px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={item.avatarUrl || undefined}
                          alt={item.displayName}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {item.displayName}
                          </p>
                          {item.username && (
                            <p className="truncate text-xs text-text-muted">
                              @{item.username}
                            </p>
                          )}
                        </div>

                        {isFriend ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            isLoading={isActing}
                            onClick={() => void handleMessage(item.id)}
                          >
                            {t("friends:message", { defaultValue: "Message" })}
                          </Button>
                        ) : incomingRequestId ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              isLoading={isActing}
                              onClick={() =>
                                void handleAccept(incomingRequestId, item.id)
                              }
                            >
                              {t("friends:accept", { defaultValue: "Accept" })}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={isActing}
                              onClick={() =>
                                void handleDecline(incomingRequestId, item.id)
                              }
                            >
                              {t("friends:reject", { defaultValue: "Decline" })}
                            </Button>
                          </div>
                        ) : sentRequestId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            isLoading={isActing}
                            onClick={() =>
                              void handleCancelRequest(sentRequestId, item.id)
                            }
                          >
                            {t("friends:sentRequests.cancel", {
                              defaultValue: "Cancel",
                            })}
                          </Button>
                        ) : item.canAddFriend ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            isLoading={isActing}
                            onClick={() => void handleAddFriend(item.id)}
                          >
                            {t("friends:addFriend", {
                              defaultValue: "Add friend",
                            })}
                          </Button>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t("friends:status.unavailable", {
                              defaultValue: "Unavailable",
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <FriendRequestsPanel className="rounded-xl border border-border bg-surface-raised" />
        )}
      </main>
    </div>
  );
};

export default FriendsPage;
