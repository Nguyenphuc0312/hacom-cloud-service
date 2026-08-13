import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Modal, Input, Button, DirectorySkeleton } from "../ui";
import { Avatar } from "../common/Avatar";
import { useDebounce } from "../../hooks/useDebounce";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import type { PublicUserSummary } from "@hacom/chat-shared-types/auth";
import { searchUsersUseCase } from "../../features/chat/usecases/searchUsers";
import { useAuthStore } from "../../stores";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useFriendshipStore } from "../../stores/friendshipStore";

type TabKey = "my" | "choose";

/** One row in the "choose" list — same shape whether it comes from search or the friends list. */
interface ContactListItem {
  id: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
}

interface ShareContactModalProps {
  isOpen: boolean;
  currentUserId: string;
  onClose: () => void;
  onShare: (contactUserId: string) => Promise<boolean>;
  className?: string;
}

const extractSearchUsers = (payload: unknown): PublicUserSummary[] => {
  if (Array.isArray(payload)) return payload as PublicUserSummary[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as PublicUserSummary[];
    }
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) {
        return nested.data as PublicUserSummary[];
      }
    }
  }

  return [];
};

export const ShareContactModal: React.FC<ShareContactModalProps> = ({
  isOpen,
  currentUserId,
  onClose,
  onShare,
  className,
}) => {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  const friends = useFriendshipStore((s) => s.friends);
  const isFriendsLoading = useFriendshipStore((s) => s.isFriendsLoading);
  const fetchFriends = useFriendshipStore((s) => s.fetchFriends);
  // Same rule as the "choose" tab and the rest of the app: enriched alias/name
  // wins, else the canonical resolver (displayName → HR full name → full name →
  // username), never the raw employee code alone.
  const displayName =
    (currentUser && nameByUserId[currentUser.id]) ||
    // Own profile: trust the self-authored name (see useMyProfile).
    (currentUser
      ? resolveUserDisplayName(currentUser, { trustDisplayName: true })
      : "");

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchGenerationRef = useRef(0);

  const debouncedQuery = useDebounce(query, 300);

  const tabs: Array<{ id: TabKey; label: string }> = useMemo(
    () => [
      {
        id: "my",
        label: t("chat:contactShare.myContact", { defaultValue: "My contact" }),
      },
      {
        id: "choose",
        label: t("chat:contactShare.chooseContact", {
          defaultValue: "Choose contact",
        }),
      },
    ],
    [t],
  );

  const abortSearch = useCallback(() => {
    searchGenerationRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, []);

  const runSearch = useCallback(async (rawQuery: string) => {
    if (!rawQuery.trim() || rawQuery.trim().length < 2) {
      abortSearch();
      setResults([]);
      setErrorText(null);
      setIsLoading(false);
      return;
    }

    searchAbortRef.current?.abort();
    const abortController = new AbortController();
    searchAbortRef.current = abortController;
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;

    setIsLoading(true);
    setErrorText(null);
    try {
      const response = await searchUsersUseCase(rawQuery.trim(), 1, 20, {
        signal: abortController.signal,
      });
      const payload = unwrapApiSuccess(response);
      if (
        abortController.signal.aborted ||
        generation !== searchGenerationRef.current
      ) {
        return;
      }
      setResults(extractSearchUsers(payload));
    } catch (error) {
      if (
        abortController.signal.aborted ||
        generation !== searchGenerationRef.current
      ) {
        return;
      }
      const apiError = extractApiError(error);
      setResults([]);
      setErrorText(apiError.message);
    } finally {
      if (
        !abortController.signal.aborted &&
        generation === searchGenerationRef.current
      ) {
        setIsLoading(false);
        if (searchAbortRef.current === abortController) {
          searchAbortRef.current = null;
        }
      }
    }
  }, [abortSearch]);

  useEffect(() => {
    if (!isOpen || activeTab !== "choose") {
      abortSearch();
      return;
    }
    void runSearch(debouncedQuery);
  }, [abortSearch, activeTab, debouncedQuery, isOpen, runSearch]);

  // Default (empty search) shows the user's friends. Load once when the tab opens.
  useEffect(() => {
    if (isOpen && activeTab === "choose" && friends.length === 0) {
      void fetchFriends();
    }
  }, [activeTab, fetchFriends, friends.length, isOpen]);

  const isSearching = debouncedQuery.trim().length >= 2;

  // When searching, show search results; otherwise fall back to the friends list.
  const listItems: ContactListItem[] = isSearching
    ? results
    : friends
        .filter((friend) => friend.id !== currentUserId)
        .map((friend) => ({
          id: friend.id,
          displayName: resolveUserDisplayName(friend),
          username: friend.username,
          avatarUrl: friend.avatar ?? null,
        }));

  const listLoading = isSearching ? isLoading : isFriendsLoading;

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setActiveTab("my");
      setQuery("");
      setResults([]);
      setIsLoading(false);
      setSendingUserId(null);
      setErrorText(null);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      abortSearch();
    }
  }, [abortSearch, isOpen]);

  useEffect(() => {
    return () => {
      abortSearch();
    };
  }, [abortSearch]);

  const handleShare = useCallback(
    async (contactUserId: string) => {
      if (!contactUserId) return;
      setSendingUserId(contactUserId);
      try {
        // Only close when the share actually succeeded; on failure the error
        // toast shows and the modal stays open so the user can retry.
        if (await onShare(contactUserId)) {
          onClose();
        }
      } finally {
        setSendingUserId(null);
      }
    },
    [onClose, onShare],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t("chat:contactShare.title", { defaultValue: "Share contact" })}
      description={t("chat:contactShare.description", {
        defaultValue: "Choose a contact card to share",
      })}
      contentClassName={className}
    >
      <div className="space-y-4">
        <div className="flex items-center rounded-xl bg-surface-overlay p-1">
          {tabs.map((tab) => {
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

        {activeTab === "my" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  src={currentUser?.avatar || undefined}
                  alt={displayName || currentUserId}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {displayName}
                  </p>
                  {currentUser?.username ? (
                    <p className="truncate text-xs text-text-muted">
                      @{currentUser.username}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-xs text-text-muted">
                {t("chat:contactShare.privacyNote", {
                  defaultValue:
                    "Visible fields are controlled by your privacy settings.",
                })}
              </p>
            </div>
            <Button
              type="button"
              className="w-full"
              isLoading={sendingUserId === currentUserId}
              onClick={() => void handleShare(currentUserId)}
            >
              {t("chat:contactShare.shareNow", { defaultValue: "Share now" })}
            </Button>
          </div>
        )}

        {activeTab === "choose" && (
          <div className="space-y-3">
            <Input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("chat:contactShare.searchPlaceholder", {
                defaultValue: "Search by username/email/phone",
              })}
              leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
            />

            {listLoading ? (
              <DirectorySkeleton count={4} />
            ) : errorText && isSearching ? (
              <p className="text-sm text-danger">{errorText}</p>
            ) : listItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                {isSearching
                  ? t("chat:contactShare.noResults", {
                      defaultValue: "No matching users",
                    })
                  : t("chat:contactShare.noFriends", {
                      defaultValue: "You have no friends to share yet",
                    })}
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {listItems.map((item) => {
                  const label =
                    nameByUserId[item.id] || item.displayName;
                  return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleShare(item.id)}
                      disabled={Boolean(sendingUserId)}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        "hover:bg-surface-overlay",
                        sendingUserId && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <Avatar
                        src={item.avatarUrl || undefined}
                        alt={label || item.username || item.id}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {label}
                        </p>
                        {item.username && (
                          <p className="truncate text-xs text-text-muted">
                            @{item.username}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-medium text-primary">
                        {sendingUserId === item.id
                          ? t("common:loading.processing", {
                              defaultValue: "Processing...",
                            })
                          : t("chat:contactShare.shareAction", {
                              defaultValue: "Share",
                            })}
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShareContactModal;
