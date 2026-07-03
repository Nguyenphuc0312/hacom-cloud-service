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
import {
  Modal,
  Input,
  Button,
  DirectorySkeleton,
  SkeletonCircle,
  toast,
} from "../ui";
import { EmptySearchResults } from "../ui/EmptyState";
import { extractApiError } from "../../lib/apiContract";
import {
  buildUserSearchSecondaryText,
  isDirectConversationEligible,
  isGroupMemberEligible,
  type ChatSearchUser,
  useChatUserSearch,
  useFriendSuggestions,
} from "../../features/chat/hooks/useChatUserSearch";
import { sendFriendRequestUseCase } from "../../features/chat/usecases/sendFriendRequest";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";

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
  const [groupNameTouched, setGroupNameTouched] = useState(false);
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

  const hasHydrated = useFriendshipStore((state) => state.hasHydrated);
  const refreshDirectory = useFriendshipStore((state) => state.refreshDirectory);
  const nameByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  useEffect(() => {
    if (isOpen && !hasHydrated) {
      void refreshDirectory();
    }
  }, [isOpen, hasHydrated, refreshDirectory]);

  const { results, isLoading: isSearchLoading, errorMessage, debouncedQuery } = useChatUserSearch(
    searchQuery,
    { enabled: isOpen, limit: isGroupMode ? 20 : 10 },
  );
  const { suggestions, isLoading: isSuggestionsLoading } = useFriendSuggestions({
    query: searchQuery,
    enabled: isOpen,
    limit: isGroupMode ? 50 : 20,
  });

  const isSearchActive = debouncedQuery.trim().length >= 2;
  const isLoading = isSearchActive ? isSearchLoading : isSuggestionsLoading;

  const users = useMemo(
    () =>
      isSearchActive
        ? results.map((user) => ({
            ...user,
            ...(searchUserOverridesById[user.id] ?? {}),
          }))
        : suggestions,
    [isSearchActive, results, suggestions, searchUserOverridesById],
  );

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setSearchQuery("");
      setSelectedUsersById({});
      setIsGroupMode(false);
      setGroupName("");
      setGroupNameTouched(false);
      setIsSubmitting(false);
      setPendingUserId(null);
      setPendingFriendRequestIds(new Set());
      setSearchUserOverridesById({});
    }
  }

  const getDisplayName = useCallback(
    (user: ChatSearchUser) =>
      nameByUserId[user.id] ||
      resolveUserDisplayName(user, { allowLegacyFallback: true }) ||
      user.username,
    [nameByUserId],
  );

  const toggleSelectedUser = useCallback((user: ChatSearchUser) => {
    setSelectedUsersById((prev) => {
      if (prev[user.id]) {
        const next = { ...prev };
        delete next[user.id];
        return next;
      }
      return { ...prev, [user.id]: user };
    });
  }, []);

  const handleUserClick = useCallback(
    async (user: ChatSearchUser) => {
      if (isBusy) return;
      if (isGroupMode) {
        if (!isGroupMemberEligible(user)) return;
        toggleSelectedUser(user);
        return;
      }
      if (!isDirectConversationEligible(user)) {
        toast.error(
          t("profile:newChatModal.friendRequired", {
            defaultValue: "You can only start direct chat with friends. Send a friend request first.",
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
      setPendingFriendRequestIds((prev) => new Set(prev).add(userId));
      try {
        await sendFriendRequestUseCase(userId);
        setSearchUserOverridesById((prev) => ({
          ...prev,
          [userId]: { friendshipStatus: "pending", canAddFriend: false },
        }));
        toast.success(t("profile:newChatModal.friendRequestSent", { defaultValue: "Friend request sent" }));
      } catch (error) {
        const apiError = extractApiError(error);
        const details = apiError.details;
        const businessCode =
          details && typeof details === "object" && "code" in details
            ? (details as { code?: unknown }).code
            : undefined;
        if (
          businessCode === "ALREADY_FRIENDS" ||
          businessCode === "FRIEND_REQUEST_ALREADY_ACCEPTED" ||
          apiError.message.toLowerCase().includes("already friends") ||
          apiError.message.includes("đã là bạn")
        ) {
          setSearchUserOverridesById((prev) => ({
            ...prev,
            [userId]: {
              friendshipStatus: "accepted",
              canAddFriend: false,
              isFriend: true,
            },
          }));
          toast.success(t("friends:relationship.friend", { defaultValue: "Hai người đã là bạn bè" }));
          return;
        }
        toast.error(apiError.message || t("profile:newChatModal.friendRequestFailed", { defaultValue: "Cannot send friend request" }));
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

  const handleCreateGroup = useCallback(async () => {
    if (selectedUsers.length < 1) {
      toast.error(t("profile:toast.selectAtLeastOneMember"));
      return;
    }
    const name = groupName.trim();
    if (!name) {
      setGroupNameTouched(true);
      toast.error(t("profile:toast.groupNameRequired"));
      return;
    }
    if (!onCreateGroup) return;
    setIsSubmitting(true);
    try {
      await onCreateGroup({ name, memberIds: selectedUsers.map((u) => u.id) });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [groupName, onClose, onCreateGroup, selectedUsers, t]);

  /* ── Footer: nút tạo nhóm luôn nằm ngoài vùng scroll ── */
  const canCreate = selectedUsers.length > 0 && groupName.trim().length > 0;
  const modalFooter = isGroupMode ? (
    <div className="flex flex-col gap-2">
      {selectedUsers.length === 0 && (
        <p className="text-center text-xs text-text-secondary">
          {t("profile:newChatModal.selectMembersHint", { defaultValue: "Chọn ít nhất 1 thành viên để tạo nhóm" })}
        </p>
      )}
      <Button
        fullWidth
        size="md"
        variant={canCreate ? "brand" : "secondary"}
        onClick={() => void handleCreateGroup()}
        isLoading={isBusy}
        disabled={isBusy || !canCreate}
      >
        {selectedUsers.length > 0
          ? t("profile:newChatModal.createGroupButton", { count: selectedUsers.length })
          : t("profile:newChatModal.createGroupButtonEmpty", { defaultValue: "Tạo nhóm" })}
      </Button>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("profile:newChatModal.title")}
      size="lg"
      contentClassName="sm:w-[36rem]"
      bodyClassName="p-0 flex flex-col"
      footer={modalFooter}
    >
      {/* ── Controls cố định phía trên ── */}
      <div className="flex-shrink-0 space-y-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        {/* Mode toggle */}
        <div className="flex rounded-[var(--chat-control-radius)] border border-border p-1 gap-1">
          <button
            type="button"
            onClick={() => setIsGroupMode(false)}
            disabled={isBusy}
            className={clsx(
              "flex flex-1 items-center justify-center gap-2 rounded-[calc(var(--chat-control-radius)-2px)] px-3 py-2 text-sm font-medium transition-colors",
              !isGroupMode
                ? "bg-[#1565C0] text-white shadow-sm"
                : "text-text-secondary hover:bg-[#1976D2]/8",
            )}
          >
            <UserPlusIcon className="h-4 w-4" />
            {t("profile:newChatModal.directMessage")}
          </button>
          <button
            type="button"
            onClick={() => setIsGroupMode(true)}
            disabled={isBusy}
            className={clsx(
              "flex flex-1 items-center justify-center gap-2 rounded-[calc(var(--chat-control-radius)-2px)] px-3 py-2 text-sm font-medium transition-colors",
              isGroupMode
                ? "bg-[#1565C0] text-white shadow-sm"
                : "text-text-secondary hover:bg-[#1976D2]/8",
            )}
          >
            <UserGroupIcon className="h-4 w-4" />
            {t("profile:newChatModal.createGroup")}
          </button>
        </div>

        {/* Group name input */}
        {isGroupMode && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">
              {t("profile:newChatModal.groupNameLabel", { defaultValue: "Tên nhóm" })}
            </span>
            <Input
              type="text"
              placeholder={t("profile:newChatModal.groupNamePlaceholder")}
              value={groupName}
              onChange={(e) => { setGroupName(e.target.value); }}
              onBlur={() => setGroupNameTouched(true)}
              disabled={isBusy}
              error={
                groupNameTouched && !groupName.trim()
                  ? t("profile:toast.groupNameRequired", { defaultValue: "Vui lòng nhập tên nhóm" })
                  : undefined
              }
            />
          </div>
        )}

        {/* Search */}
        <Input
          type="text"
          placeholder={t("profile:newChatModal.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
          autoFocus={!isGroupMode}
          disabled={isBusy}
        />

        {/* Selected member chips */}
        {isGroupMode && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="flex items-center gap-1.5 rounded-full bg-[#1976D2]/10 py-1 pl-3 pr-1.5 text-sm text-[#1565C0]"
              >
                {getDisplayName(user)}
                <button
                  type="button"
                  onClick={() => toggleSelectedUser(user)}
                  className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#1976D2]/15"
                  aria-label={`Bỏ ${getDisplayName(user)}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Section label */}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {isSearchActive
            ? t("profile:newChatModal.searchResults", { defaultValue: "Kết quả tìm kiếm" })
            : t("profile:newChatModal.friendsSectionLabel", { defaultValue: "Bạn bè" })}
        </p>
      </div>

      {/* ── Danh sách scrollable ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
        {isLoading ? (
          <DirectorySkeleton count={5} />
        ) : errorMessage && isSearchActive ? (
          <p className="py-8 text-center text-sm text-danger">{errorMessage}</p>
        ) : users.length === 0 && isSearchActive ? (
          <EmptySearchResults query={debouncedQuery} />
        ) : users.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {t("profile:newChatModal.noFriendsYet", { defaultValue: "Bạn chưa có bạn bè nào." })}
          </p>
        ) : (
          <div className="space-y-0.5">
            {users.map((user) => {
              const isSelected = Boolean(selectedUsersById[user.id]);
              const isPending = pendingUserId === user.id;
              const isFriendRequestPending = pendingFriendRequestIds.has(user.id);
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
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelectedUser(user); }}
                          disabled={isBusy}
                          aria-label={isSelected ? "Bỏ chọn" : "Chọn thành viên"}
                          aria-pressed={isSelected}
                          className={clsx(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30",
                            isSelected
                              ? "border-[#1976D2] bg-[#1565C0] text-white"
                              : "border-border-strong text-transparent hover:border-[#1976D2]/50",
                            isBusy && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      ) : (
                        <span className="rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-text-muted">
                          {t("profile:newChatModal.friendsOnly", { defaultValue: "Chỉ bạn bè" })}
                        </span>
                      )
                    ) : isPending ? (
                      <SkeletonCircle size={18} />
                    ) : !canStartDirect ? (
                      user.friendshipStatus === "pending" ? (
                        <span className="rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-text-muted">
                          {t("profile:newChatModal.requestSent", { defaultValue: "Đã gửi" })}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isFriendRequestPending || isBusy}
                          onClick={() => void handleSendFriendRequest(user.id)}
                          className="rounded-md bg-[#1976D2]/10 px-2 py-0.5 text-xs font-medium text-[#1565C0] disabled:opacity-60"
                        >
                          {isFriendRequestPending
                            ? t("profile:newChatModal.sending", { defaultValue: "Đang gửi..." })
                            : t("profile:newChatModal.addFriend", { defaultValue: "Kết bạn" })}
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
    </Modal>
  );
};

export default NewChatModal;
