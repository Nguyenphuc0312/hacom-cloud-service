import React, { useCallback, useMemo, useRef, useState } from "react";
import type { FriendSuggestionDto } from "@hacom/chat-shared-types/chat";
import { useTranslation } from "react-i18next";
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";

import { UserSearchResultItem } from "../common/UserSearchResultItem";
import {
  Button,
  DirectorySkeleton,
  Input,
  Modal,
  StateBlock,
  toast,
} from "../ui";
import {
  buildUserSearchSecondaryText,
  type ChatSearchUser,
  useChatUserSearch,
} from "../../features/chat/hooks/useChatUserSearch";
import { useFriendSuggestions } from "../../features/friends/useFriendSuggestions";
import { useFriendship } from "../../hooks/useFriendship";
import { useAuthStore } from "../../stores";
import { UserStatus } from "../../types";

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const friendshipStatuses = new Set<ChatSearchUser["friendshipStatus"]>([
  "none",
  "pending",
  "accepted",
  "declined",
  "canceled",
  "blocked",
]);

const normalizeStatus = (value: unknown): UserStatus | null =>
  typeof value === "string" &&
  (Object.values(UserStatus) as string[]).includes(value)
    ? (value as UserStatus)
    : null;

const normalizeFriendshipStatus = (
  value: unknown,
): ChatSearchUser["friendshipStatus"] =>
  typeof value === "string" &&
  friendshipStatuses.has(value as ChatSearchUser["friendshipStatus"])
    ? (value as ChatSearchUser["friendshipStatus"])
    : "none";

const toSearchUser = (suggestion: FriendSuggestionDto): ChatSearchUser => ({
  id: suggestion.id,
  username:
    suggestion.username ?? suggestion.employeeCode ?? suggestion.id,
  displayName: suggestion.displayName,
  avatarUrl: suggestion.avatarUrl,
  status: normalizeStatus(suggestion.status),
  employeeCode: suggestion.employeeCode,
  departmentName: suggestion.departmentName,
  unitCode: suggestion.unitCode,
  title: suggestion.title,
  isFriend: suggestion.isFriend,
  canAddFriend: suggestion.canAddFriend,
  friendshipStatus: normalizeFriendshipStatus(suggestion.friendshipStatus),
});

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation(["sidebar", "friends", "profile", "common"]);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { sendFriendRequest } = useFriendship();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sendingUserIds, setSendingUserIds] = useState<Set<string>>(new Set());
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());

  const {
    results,
    isLoading: isSearchLoading,
    errorMessage: searchError,
    debouncedQuery,
  } = useChatUserSearch(query, {
    enabled: isOpen,
    limit: 20,
  });

  const {
    suggestions,
    hasLoaded: suggestionsHaveLoaded,
    isLoading: areSuggestionsLoading,
    isLoadingMore,
    hasNext,
    error: suggestionsError,
    loadMoreError,
    loadMore,
    reload,
  } = useFriendSuggestions({ enabled: isOpen });

  const isSearchActive = debouncedQuery.trim().length >= 2;
  const suggestionUsers = useMemo(
    () => suggestions.map(toSearchUser),
    [suggestions],
  );
  const sourceUsers = isSearchActive ? results : suggestionUsers;

  const visibleUsers = useMemo(
    () =>
      sourceUsers.filter((user) => {
        if (user.id === currentUserId || user.isFriend) return false;
        if (
          user.friendshipStatus === "accepted" ||
          user.friendshipStatus === "blocked"
        ) {
          return false;
        }

        return (
          sentUserIds.has(user.id) ||
          user.friendshipStatus === "pending" ||
          user.canAddFriend
        );
      }),
    [currentUserId, sentUserIds, sourceUsers],
  );

  const handleSendFriendRequest = useCallback(
    async (userId: string) => {
      if (sendingUserIds.has(userId) || sentUserIds.has(userId)) return;

      setSendingUserIds((previous) => new Set(previous).add(userId));
      const succeeded = await sendFriendRequest(userId);

      if (succeeded) {
        setSentUserIds((previous) => new Set(previous).add(userId));
        toast.success(t("friends:requestSent"));
      } else {
        toast.error(t("friends:actionFailed"));
      }

      setSendingUserIds((previous) => {
        const next = new Set(previous);
        next.delete(userId);
        return next;
      });
    },
    [sendFriendRequest, sendingUserIds, sentUserIds, t],
  );

  const isLoading = isSearchActive
    ? isSearchLoading
    : areSuggestionsLoading || !suggestionsHaveLoaded;
  const activeError = isSearchActive ? searchError : suggestionsError;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("sidebar:header.addFriendLabel")}
      description={t("friends:discoverHintTitle")}
      size="lg"
      contentClassName="sm:w-[30rem]"
      bodyClassName="flex flex-col p-0"
      initialFocusRef={inputRef}
    >
      <div className="flex-shrink-0 space-y-3 border-b border-border/70 px-4 py-4 sm:px-5">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("friends:searchPlaceholder")}
          leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
          autoComplete="off"
        />
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {isSearchActive
            ? t("profile:newChatModal.searchResults")
            : t("friends:suggestions")}
        </p>
      </div>

      <div className="min-h-0 max-h-[min(28rem,55vh)] overflow-y-auto px-3 py-3 sm:px-4">
        {isLoading ? (
          <DirectorySkeleton count={6} />
        ) : activeError && visibleUsers.length === 0 ? (
          <StateBlock
            variant="error"
            icon={<UserPlusIcon className="h-6 w-6" />}
            title={
              isSearchActive
                ? activeError
                : t("friends:suggestionsError")
            }
            description={t("friends:discoverHintBody")}
            primaryAction={
              isSearchActive
                ? undefined
                : {
                    label: t("common:actions.retry"),
                    onClick: () => void reload(),
                  }
            }
            className="min-h-[16rem] border-dashed shadow-none"
          />
        ) : visibleUsers.length === 0 ? (
          <StateBlock
            variant={isSearchActive ? "search-empty" : "empty"}
            icon={<UserPlusIcon className="h-6 w-6" />}
            title={
              isSearchActive
                ? t("friends:noSearchResult")
                : t("friends:suggestionsEmpty")
            }
            description={t("friends:discoverHintBody")}
            className="min-h-[16rem] border-dashed shadow-none"
          />
        ) : (
          <div className="space-y-1">
            {visibleUsers.map((user) => {
              const isSending = sendingUserIds.has(user.id);
              const requestWasSent =
                sentUserIds.has(user.id) ||
                user.friendshipStatus === "pending";

              return (
                <UserSearchResultItem
                  key={user.id}
                  avatarUrl={user.avatarUrl}
                  avatarAlt={user.displayName}
                  status={user.status}
                  primaryText={user.displayName}
                  secondaryText={buildUserSearchSecondaryText(user)}
                  trailing={
                    requestWasSent ? (
                      <span className="rounded-md bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-muted">
                        {t("friends:relationship.outgoing")}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="brand"
                        isLoading={isSending}
                        disabled={isSending}
                        leftIcon={<UserPlusIcon />}
                        onClick={() => void handleSendFriendRequest(user.id)}
                      >
                        {t("friends:addFriend")}
                      </Button>
                    )
                  }
                />
              );
            })}

            {!isSearchActive && hasNext ? (
              <div className="flex justify-center pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="brand-outline"
                  isLoading={isLoadingMore}
                  disabled={isLoadingMore}
                  onClick={() => void loadMore()}
                >
                  {t("common:actions.loadMore")}
                </Button>
              </div>
            ) : null}

            {!isSearchActive && loadMoreError ? (
              <p className="px-2 pt-2 text-center text-xs text-danger">
                {loadMoreError}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AddFriendModal;
