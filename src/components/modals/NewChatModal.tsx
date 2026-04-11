import React, { useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Modal, Input, Button, Spinner, EmptySearchResults } from "../ui";
import { Avatar } from "../common/Avatar";
import { useDebounce } from "../../hooks";
import { toast } from "../ui";
import type { User as UserType } from "../../types";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { searchUsersUseCase } from "../../features/chat/usecases/searchUsers";
import { sendFriendRequestUseCase } from "../../features/chat/usecases/sendFriendRequest";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";

interface User {
  id: string;
  username: string;
  displayName?: string;
  fullNameFromHR?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  status?: UserType["status"] | "online" | "offline" | "away" | "dnd";
  isFriend?: boolean;
  friendshipStatus?:
    | "none"
    | "pending"
    | "accepted"
    | "declined"
    | "canceled"
    | "blocked";
}

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
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingFriendRequestIds, setPendingFriendRequestIds] = useState<
    Set<string>
  >(new Set());
  const isBusy = isSubmitting || externalSubmitting;

  const debouncedQuery = useDebounce(searchQuery, 300);

  const canStartDirectChat = useCallback((user: User): boolean => {
    if (user.isFriend === true) return true;
    return user.friendshipStatus === "accepted";
  }, []);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim() || query.length < 2) {
        setUsers([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await searchUsersUseCase(query);
        const payload = unwrapApiSuccess(response) as
          | User[]
          | { data?: User[] };
        const userList = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
        const normalizedUsers = userList.map((user) => ({
          id: user.id,
          username: user.username,
          displayName: (user as { displayName?: string }).displayName,
          fullNameFromHR: (user as { fullNameFromHR?: string }).fullNameFromHR,
          full_name_from_hr: (user as { full_name_from_hr?: string })
            .full_name_from_hr,
          employeeCode: (user as { employeeCode?: string }).employeeCode,
          employee_code: (user as { employee_code?: string }).employee_code,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          status: user.status,
          isFriend: user.isFriend,
          friendshipStatus: user.friendshipStatus || "none",
        }));
        setUsers(normalizedUsers);
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || t("profile:toast.searchUsersFailed"));
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    searchUsers(debouncedQuery);
  }, [debouncedQuery, searchUsers]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setUsers([]);
      setSelectedUsers([]);
      setIsGroupMode(false);
      setGroupName("");
      setIsSubmitting(false);
      setPendingUserId(null);
      setPendingFriendRequestIds(new Set());
    }
  }, [isOpen]);

  const handleUserClick = async (user: User) => {
    if (isBusy) return;

    if (isGroupMode) {
      setSelectedUsers((prev) =>
        prev.some((u) => u.id === user.id)
          ? prev.filter((u) => u.id !== user.id)
          : [...prev, user],
      );
      return;
    }

    if (!canStartDirectChat(user)) {
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
  };

  const handleSendFriendRequest = useCallback(
    async (userId: string) => {
      if (isBusy) return;

      setPendingFriendRequestIds((prev) => new Set(prev).add(userId));
      try {
        await sendFriendRequestUseCase(userId);
        setUsers((prev) =>
          prev.map((user) =>
            user.id === userId
              ? { ...user, friendshipStatus: "pending" as const }
              : user,
          ),
        );
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
        setPendingFriendRequestIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [isBusy, t],
  );

  const handleCreateGroup = async () => {
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
  };

  const getDisplayName = (user: User) => {
    return (
      resolveUserDisplayName(user, {
        allowLegacyFallback: true,
      }) || user.username
    );
  };

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
      size="md"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsGroupMode(false)}
            disabled={isBusy}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              !isGroupMode
                ? "bg-primary text-text-inverse"
                : "bg-surface-overlay text-text-secondary hover:bg-surface-active",
            )}
          >
            <UserPlusIcon className="w-5 h-5" />
            {t("profile:newChatModal.directMessage")}
          </button>
          <button
            type="button"
            onClick={() => setIsGroupMode(true)}
            disabled={isBusy}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              isGroupMode
                ? "bg-primary text-text-inverse"
                : "bg-surface-overlay text-text-secondary hover:bg-surface-active",
            )}
          >
            <UserGroupIcon className="w-5 h-5" />
            {t("profile:newChatModal.createGroup")}
          </button>
        </div>

        <Input
          type="text"
          placeholder={t("profile:newChatModal.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<MagnifyingGlassIcon className="w-5 h-5" />}
          autoFocus
          disabled={isBusy}
        />

        {isGroupMode && (
          <Input
            type="text"
            placeholder={t("profile:newChatModal.groupNamePlaceholder")}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            disabled={isBusy}
          />
        )}

        {isGroupMode && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 px-3 py-2 bg-primary/15 text-primary rounded-full text-sm"
              >
                <span>{getDisplayName(user)}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedUsers((prev) =>
                      prev.filter((u) => u.id !== user.id),
                    )
                  }
                  className="hover:bg-primary/25 rounded-full p-1"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : searchQuery.length > 0 && searchQuery.length < 2 ? (
            <p className="text-center text-text-muted py-8 text-sm">
              {t("profile:newChatModal.searchMinChars", { count: 2 })}
            </p>
          ) : users.length === 0 && debouncedQuery.length >= 2 ? (
            <EmptySearchResults query={debouncedQuery} />
          ) : (
            <div className="space-y-1">
              {users.map((user) => {
                const isSelected = selectedUsers.some((u) => u.id === user.id);
                const isPending = pendingUserId === user.id;
                const isFriendRequestPending = pendingFriendRequestIds.has(
                  user.id,
                );
                return (
                  <button
                    type="button"
                    key={user.id}
                    onClick={() => void handleUserClick(user)}
                    disabled={isBusy}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left",
                      isSelected ? "bg-primary/15" : "hover:bg-surface-overlay",
                      isBusy && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    <Avatar
                      src={user.avatar}
                      alt={getDisplayName(user)}
                      size="md"
                      status={user.status as unknown as UserType["status"]}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">
                        {getDisplayName(user)}
                      </p>
                      <p className="text-sm text-text-muted truncate">
                        @{user.username}
                      </p>
                    </div>
                    {!isGroupMode && isPending && (
                      <Spinner
                        size="sm"
                        variant="primary"
                        className="shrink-0"
                      />
                    )}
                    {!isGroupMode &&
                      !canStartDirectChat(user) &&
                      !isPending &&
                      (user.friendshipStatus === "pending" ? (
                        <span className="rounded-lg bg-surface-overlay px-2 py-1 text-xs text-text-muted">
                          {t("profile:newChatModal.requestSent", {
                            defaultValue: "Requested",
                          })}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isFriendRequestPending || isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleSendFriendRequest(user.id);
                          }}
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
                      ))}
                    {isGroupMode && (
                      <div
                        className={clsx(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-border-strong",
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-text-inverse"
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
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isGroupMode && selectedUsers.length > 0 && (
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
        )}
      </div>
    </Modal>
  );
};

export default NewChatModal;
