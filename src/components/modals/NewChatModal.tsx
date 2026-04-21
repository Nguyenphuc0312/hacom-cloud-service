import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { UserSearchResultItem } from "../common/UserSearchResultItem";
import { Modal, Input, Button, Spinner, EmptySearchResults, toast } from "../ui";
import { extractApiError } from "../../lib/apiContract";
import {
  buildUserSearchSecondaryText,
  isDirectConversationEligible,
  isGroupMemberEligible,
  type ChatSearchUser,
  useChatUserSearch,
} from "../../features/chat/hooks/useChatUserSearch";
import { sendFriendRequestUseCase } from "../../features/chat/usecases/sendFriendRequest";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (userId: string) => Promise<void>;
  onCreateGroup?: (payload: {
    name: string;
    memberIds: string[];
  }) => Promise<void>;
  isSubmitting?: boolean;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  onStartChat,
  onCreateGroup,
  isSubmitting: externalSubmitting = false,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUsersById, setSelectedUsersById] = useState<
    Record<string, ChatSearchUser>
  >({});
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingFriendRequestIds, setPendingFriendRequestIds] = useState<
    Set<string>
  >(new Set());
  const [searchUserOverridesById, setSearchUserOverridesById] = useState<
    Record<string, Partial<ChatSearchUser>>
  >({});
  const isBusy = isSubmitting || externalSubmitting;

  const selectedUsers = useMemo(
    () => Object.values(selectedUsersById),
    [selectedUsersById],
  );
  const { results, isLoading, errorMessage, debouncedQuery } = useChatUserSearch(
    searchQuery,
    {
      enabled: isOpen,
      limit: isGroupMode ? 20 : 10,
    },
  );
  const users = useMemo(
    () =>
      results.map((user) => ({
        ...user,
        ...(searchUserOverridesById[user.id] ?? {}),
      })),
    [results, searchUserOverridesById],
  );

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedUsersById({});
      setIsGroupMode(false);
      setGroupName("");
      setIsSubmitting(false);
      setPendingUserId(null);
      setPendingFriendRequestIds(new Set());
      setSearchUserOverridesById({});
    }
  }, [isOpen]);

  const getDisplayName = useCallback((user: ChatSearchUser) => {
    return (
      resolveUserDisplayName(user, {
        allowLegacyFallback: true,
      }) || user.username
    );
  }, []);

  const toggleSelectedUser = useCallback((user: ChatSearchUser) => {
    setSelectedUsersById((previous) => {
      if (previous[user.id]) {
        const next = { ...previous };
        delete next[user.id];
        return next;
      }

      return {
        ...previous,
        [user.id]: user,
      };
    });
  }, []);

  const handleUserClick = useCallback(
    async (user: ChatSearchUser) => {
      if (isBusy) return;

      if (isGroupMode) {
        if (!isGroupMemberEligible(user)) {
          return;
        }

        toggleSelectedUser(user);
        return;
      }

      if (!isDirectConversationEligible(user)) {
        toast.error(
          t("profile:newChatModal.friendRequired", {
            defaultValue:
              "You can only start direct chat with friends. Send a friend request first.",
          }),
        );
        return;
      }

      setPendingUserId(user.id);
      setIsSubmitting(true);
      try {
        await onStartChat(user.id);
        onClose();
      } finally {
        setPendingUserId(null);
        setIsSubmitting(false);
      }
    },
    [isBusy, isGroupMode, onClose, onStartChat, t, toggleSelectedUser],
  );

  const handleSendFriendRequest = useCallback(
    async (userId: string) => {
      if (isBusy) return;

      setPendingFriendRequestIds((previous) => new Set(previous).add(userId));
      try {
        await sendFriendRequestUseCase(userId);
        setSearchUserOverridesById((previous) => ({
          ...previous,
          [userId]: {
            friendshipStatus: "pending",
            canAddFriend: false,
          },
        }));
        toast.success(
          t("profile:newChatModal.friendRequestSent", {
            defaultValue: "Friend request sent",
          }),
        );
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(
          apiError.message ||
            t("profile:newChatModal.friendRequestFailed", {
              defaultValue: "Cannot send friend request",
            }),
        );
      } finally {
        setPendingFriendRequestIds((previous) => {
          const next = new Set(previous);
          next.delete(userId);
          return next;
        });
      }
    },
    [isBusy, t],
  );

  const handleCreateGroup = useCallback(async () => {
    if (selectedUsers.length < 1) {
      toast.error(t("profile:toast.selectAtLeastOneMember"));
      return;
    }

    const name = groupName.trim();
    if (!name) {
      toast.error(t("profile:toast.groupNameRequired"));
      return;
    }

    if (!onCreateGroup) return;

    setIsSubmitting(true);
    try {
      await onCreateGroup({
        name,
        memberIds: selectedUsers.map((user) => user.id),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [groupName, onClose, onCreateGroup, selectedUsers, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("profile:newChatModal.title")}
      description={
        isGroupMode
          ? t("profile:newChatModal.descriptionGroup")
          : t("profile:newChatModal.descriptionDirect")
      }
      size="full"
      contentClassName="max-w-[42rem] sm:w-[42rem]"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsGroupMode(false)}
            disabled={isBusy}
            className={clsx(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              !isGroupMode
                ? "bg-primary text-text-inverse"
                : "bg-surface-overlay text-text-secondary hover:bg-surface-active",
            )}
          >
            <UserPlusIcon className="h-5 w-5" />
            {t("profile:newChatModal.directMessage")}
          </button>
          <button
            type="button"
            onClick={() => setIsGroupMode(true)}
            disabled={isBusy}
            className={clsx(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              isGroupMode
                ? "bg-primary text-text-inverse"
                : "bg-surface-overlay text-text-secondary hover:bg-surface-active",
            )}
          >
            <UserGroupIcon className="h-5 w-5" />
            {t("profile:newChatModal.createGroup")}
          </button>
        </div>

        <Input
          type="text"
          placeholder={t("profile:newChatModal.searchPlaceholder")}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
          autoFocus
          disabled={isBusy}
        />

        {isGroupMode ? (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder={t("profile:newChatModal.groupNamePlaceholder")}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              disabled={isBusy}
            />
            <p className="text-xs leading-5 text-text-muted">
              {t("profile:newChatModal.groupEligibilityHint", {
                defaultValue:
                  "Directly adding members requires accepted friendship. Use invite links for broader access when group settings allow.",
              })}
            </p>
          </div>
        ) : null}

        {isGroupMode && selectedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 rounded-full bg-primary/15 px-3 py-2 text-sm text-primary"
              >
                <span>{getDisplayName(user)}</span>
                <button
                  type="button"
                  onClick={() => toggleSelectedUser(user)}
                  className="rounded-full p-1 hover:bg-primary/25"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="-mx-6 min-h-[18rem] max-h-80 overflow-y-auto px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : searchQuery.length > 0 && searchQuery.trim().length < 2 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              {t("profile:newChatModal.searchMinChars", { count: 2 })}
            </p>
          ) : errorMessage ? (
            <p className="py-8 text-center text-sm text-danger">{errorMessage}</p>
          ) : results.length === 0 && debouncedQuery.trim().length >= 2 ? (
            <EmptySearchResults query={debouncedQuery} />
          ) : (
            <div className="space-y-1">
              {users.map((user) => {
                const isSelected = Boolean(selectedUsersById[user.id]);
                const isPending = pendingUserId === user.id;
                const isFriendRequestPending = pendingFriendRequestIds.has(
                  user.id,
                );
                const canStartDirect = isDirectConversationEligible(user);
                const canSelectForGroup = isGroupMemberEligible(user);

                return (
                  <UserSearchResultItem
                    key={user.id}
                    avatarUrl={user.avatarUrl}
                    avatarAlt={getDisplayName(user)}
                    status={user.status ?? null}
                    primaryText={getDisplayName(user)}
                    secondaryText={buildUserSearchSecondaryText(user)}
                    selected={isSelected}
                    disabled={
                      isBusy ||
                      (!isGroupMode && !canStartDirect) ||
                      (isGroupMode && !canSelectForGroup)
                    }
                    onSelect={() => void handleUserClick(user)}
                    trailing={
                      isGroupMode ? (
                        canSelectForGroup ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleSelectedUser(user);
                            }}
                            disabled={isBusy}
                            aria-label={
                              isSelected
                                ? t("profile:newChatModal.unselectMember", {
                                    defaultValue: "Remove member",
                                  })
                                : t("profile:newChatModal.selectMember", {
                                    defaultValue: "Select member",
                                  })
                            }
                            aria-pressed={isSelected}
                            className={clsx(
                              "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                              isSelected
                                ? "border-primary bg-primary text-text-inverse"
                                : "border-border-strong text-transparent hover:border-primary/40",
                              isBusy && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </button>
                        ) : (
                          <span className="rounded-lg bg-surface-overlay px-2 py-1 text-xs text-text-muted">
                            {t("profile:newChatModal.friendsOnly", {
                              defaultValue: "Friends only",
                            })}
                          </span>
                        )
                      ) : isPending ? (
                        <Spinner
                          size="sm"
                          variant="primary"
                          className="shrink-0"
                        />
                      ) : !canStartDirect ? (
                        user.friendshipStatus === "pending" ? (
                          <span className="rounded-lg bg-surface-overlay px-2 py-1 text-xs text-text-muted">
                            {t("profile:newChatModal.requestSent", {
                              defaultValue: "Requested",
                            })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isFriendRequestPending || isBusy}
                            onClick={() => void handleSendFriendRequest(user.id)}
                            className="rounded-lg bg-primary/15 px-2 py-1 text-xs font-medium text-primary disabled:opacity-60"
                          >
                            {isFriendRequestPending
                              ? t("profile:newChatModal.sending", {
                                  defaultValue: "Sending...",
                                })
                              : t("profile:newChatModal.addFriend", {
                                  defaultValue: "Add friend",
                                })}
                          </button>
                        )
                      ) : null
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {isGroupMode && selectedUsers.length > 0 ? (
          <Button
            fullWidth
            size="lg"
            onClick={() => void handleCreateGroup()}
            isLoading={isBusy}
            disabled={isBusy}
          >
            {t("profile:newChatModal.createGroupButton", {
              count: selectedUsers.length,
            })}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
};

export default NewChatModal;
