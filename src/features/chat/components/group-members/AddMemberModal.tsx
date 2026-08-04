import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Modal } from "../../../../components/ui/Modal";
import { Input, DirectorySkeleton } from "../../../../components/ui";
import { UserSearchResultItem } from "../../../../components/common/UserSearchResultItem";
import {
  buildUserSearchSecondaryText,
  isGroupMemberEligible,
  useChatUserSearch,
  useFriendSuggestions,
} from "../../hooks/useChatUserSearch";

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMember: (userId: string) => Promise<void>;
  excludeUserIds: string[];
  isSubmitting?: boolean;
}

const AddButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({
  label,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    disabled={disabled}
    className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
  >
    {label}
  </button>
);

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onAddMember,
  excludeUserIds,
  isSubmitting = false,
}) => {
  const { t } = useTranslation(["profile", "common"]);
  const [searchQuery, setSearchQuery] = useState("");

  const isSearchActive = searchQuery.trim().length >= 2;

  // Search results khi có query
  const { results, isLoading: isSearching, errorMessage, debouncedQuery } = useChatUserSearch(
    searchQuery,
    { enabled: isOpen && isSearchActive, limit: 10, excludeUserIds },
  );

  // Gợi ý bạn bè khi chưa gõ query
  const { suggestions: friendSuggestions, isLoading: isFriendsLoading } = useFriendSuggestions({
    enabled: isOpen && !isSearchActive,
    limit: 50,
  });

  const eligibleFriends = React.useMemo(
    () => {
      const excludeSet = new Set(excludeUserIds);
      return friendSuggestions.filter((f) => !excludeSet.has(f.id));
    },
    [friendSuggestions, excludeUserIds],
  );

  const handleClose = useCallback(() => {
    setSearchQuery("");
    onClose();
  }, [onClose]);

  const handleAdd = useCallback(
    async (userId: string) => {
      await onAddMember(userId);
    },
    [onAddMember],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("profile:groupInfo.addMember")}
      size="sm"
    >
      <div className="space-y-3 px-1 pb-2">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("profile:groupInfo.searchMemberPlaceholder")}
          leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
          disabled={isSubmitting}
          autoFocus
        />

        {/* Kết quả tìm kiếm */}
        {isSearchActive && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
            {isSearching ? (
              <DirectorySkeleton count={3} />
            ) : errorMessage ? (
              <p className="px-3 py-3 text-sm text-danger">{errorMessage}</p>
            ) : debouncedQuery.trim().length >= 2 && results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-text-muted">
                {t("profile:groupInfo.noSearchResult")}
              </p>
            ) : (
              results.map((user) => (
                <UserSearchResultItem
                  key={user.id}
                  avatarUrl={user.avatarUrl}
                  avatarAlt={user.displayName || user.id}
                  status={user.status ?? null}
                  primaryText={user.displayName || user.id}
                  secondaryText={buildUserSearchSecondaryText(user)}
                  disabled={isSubmitting || !isGroupMemberEligible(user)}
                  onSelect={() => void handleAdd(user.id)}
                  trailing={
                    isGroupMemberEligible(user) ? (
                      <AddButton
                        label={t("common:actions.add")}
                        onClick={() => void handleAdd(user.id)}
                        disabled={isSubmitting}
                      />
                    ) : (
                      <span className="rounded-md bg-surface-overlay px-2 py-1 text-xs text-text-muted">
                        {t("profile:newChatModal.friendsOnly", { defaultValue: "Chỉ bạn bè" })}
                      </span>
                    )
                  }
                />
              ))
            )}
          </div>
        )}

        {/* Gợi ý bạn bè khi chưa tìm kiếm */}
        {!isSearchActive && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-text-muted">
              Bạn bè chưa trong nhóm
            </p>

            {isFriendsLoading ? (
              <div className="rounded-xl border border-border">
                <DirectorySkeleton count={4} />
              </div>
            ) : eligibleFriends.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-8 text-center">
                <UserGroupIcon className="h-8 w-8 text-text-muted/40" />
                <p className="text-sm text-text-muted">
                  {friendSuggestions.length === 0
                    ? "Bạn chưa có bạn bè nào"
                    : "Tất cả bạn bè đã trong nhóm"}
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
                {eligibleFriends.map((friend) => (
                  <UserSearchResultItem
                    key={friend.id}
                    avatarUrl={friend.avatarUrl}
                    avatarAlt={friend.alias || friend.displayName || friend.id}
                    status={friend.status ?? null}
                    primaryText={friend.alias || friend.displayName || friend.id}
                    secondaryText={buildUserSearchSecondaryText(friend)}
                    disabled={isSubmitting}
                    onSelect={() => void handleAdd(friend.id)}
                    trailing={
                      <AddButton
                        label={t("common:actions.add")}
                        onClick={() => void handleAdd(friend.id)}
                        disabled={isSubmitting}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
