import React, { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import {
  CheckIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "../../../../components/ui/Modal";
import { DirectorySkeleton } from "../../../../components/ui";
import { Avatar } from "../../../../components/common/Avatar";
import {
  type ChatSearchUser,
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

const FILTERS = ["Tất cả", "Khách hàng", "Gia đình", "Công việc", "Bạn bè", "Trả lời sau"];

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onAddMember,
  excludeUserIds,
  isSubmitting = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tất cả");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const isSearchActive = searchQuery.trim().length >= 2;

  const {
    results,
    isLoading: isSearching,
    errorMessage,
    debouncedQuery,
  } = useChatUserSearch(searchQuery, {
    enabled: isOpen && isSearchActive,
    limit: 40,
    excludeUserIds,
  });

  const { suggestions: friendSuggestions, isLoading: isFriendsLoading } =
    useFriendSuggestions({
      enabled: isOpen && !isSearchActive,
      limit: 80,
    });

  const users = useMemo(() => {
    const excludeSet = new Set(excludeUserIds);
    const source = isSearchActive ? results : friendSuggestions;
    return source.filter((user) => !excludeSet.has(user.id));
  }, [excludeUserIds, friendSuggestions, isSearchActive, results]);

  const groupedUsers = useMemo(() => groupUsers(users), [users]);

  const handleClose = useCallback(() => {
    setSearchQuery("");
    setActiveFilter("Tất cả");
    setSelectedIds([]);
    setIsConfirming(false);
    onClose();
  }, [onClose]);

  const toggleUser = useCallback((user: ChatSearchUser) => {
    if (!isGroupMemberEligible(user)) return;
    setSelectedIds((current) =>
      current.includes(user.id)
        ? current.filter((id) => id !== user.id)
        : [...current, user.id],
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selectedIds.length === 0 || isSubmitting || isConfirming) return;
    setIsConfirming(true);
    try {
      for (const userId of selectedIds) {
        await onAddMember(userId);
      }
      handleClose();
    } finally {
      setIsConfirming(false);
    }
  }, [handleClose, isConfirming, isSubmitting, onAddMember, selectedIds]);

  const loading = isSearchActive ? isSearching : isFriendsLoading;
  const emptyText = isSearchActive
    ? debouncedQuery.trim().length >= 2
      ? "Không tìm thấy người phù hợp"
      : ""
    : "Không có bạn bè phù hợp để thêm";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      showCloseButton={false}
      contentClassName="max-w-[652px] rounded"
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-end gap-4 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isConfirming}
            className="h-12 rounded bg-[#e5e7eb] px-7 text-[17px] font-semibold text-text-primary hover:bg-[#dfe2e7] disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={selectedIds.length === 0 || isSubmitting || isConfirming}
            className={clsx(
              "h-12 rounded px-7 text-[17px] font-semibold transition-colors",
              selectedIds.length > 0 && !isSubmitting && !isConfirming
                ? "bg-[#0068ff] text-white hover:bg-[#005ae0]"
                : "cursor-not-allowed bg-[#9dc7ff] text-white/85",
            )}
          >
            Xác nhận
          </button>
        </div>
      }
    >
      <div className="flex h-[74px] items-center justify-between border-b border-border px-5">
        <h2 className="text-[20px] font-semibold text-text-primary">
          Thêm thành viên
        </h2>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded text-text-primary hover:bg-surface-hover"
          aria-label="Đóng"
        >
          <XMarkIcon className="h-7 w-7" />
        </button>
      </div>

      <div className="px-5 pt-5">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nhập tên, số điện thoại, hoặc danh sách số điện thoại"
            disabled={isSubmitting || isConfirming}
            autoFocus
            className="h-12 w-full rounded-full border border-[#0068ff] bg-surface pl-12 pr-4 text-[17px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#0068ff]/15 disabled:opacity-60"
          />
        </div>

        <div className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                "h-8 shrink-0 rounded-full px-4 text-[15px] font-medium transition-colors",
                activeFilter === filter
                  ? "bg-[#0068ff] text-white"
                  : "bg-[#e4e7ec] text-text-secondary hover:bg-[#dce1e8]",
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-5 border-t border-border" />

      <div className="h-[685px] overflow-y-auto px-5 py-3">
        {loading ? (
          <DirectorySkeleton count={7} />
        ) : errorMessage ? (
          <p className="px-1 py-3 text-sm text-danger">{errorMessage}</p>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <UserGroupIcon className="h-10 w-10 text-text-muted/40" />
            <p className="text-sm text-text-muted">{emptyText}</p>
          </div>
        ) : (
          groupedUsers.map((group) => (
            <div key={group.label}>
              {group.label && (
                <div className="px-1 py-3 text-[17px] font-semibold text-text-primary">
                  {group.label}
                </div>
              )}
              {group.items.map((user) => (
                <SelectableUserRow
                  key={user.id}
                  user={user}
                  selected={selectedIds.includes(user.id)}
                  disabled={
                    isSubmitting ||
                    isConfirming ||
                    !isGroupMemberEligible(user)
                  }
                  onToggle={() => toggleUser(user)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

const SelectableUserRow: React.FC<{
  user: ChatSearchUser;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}> = ({ user, selected, disabled, onToggle }) => {
  const name = user.alias || user.displayName || user.username || user.id;
  const secondary =
    disabled && !isGroupMemberEligible(user)
      ? "Chỉ bạn bè mới có thể thêm"
      : user.departmentName || user.employeeCode || "";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span
        className={clsx(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-[#9dc7ff] bg-[#9dc7ff] text-white"
            : "border-[#b8bec8] bg-surface text-transparent",
        )}
      >
        <CheckIcon className="h-4 w-4 stroke-[3]" />
      </span>
      <Avatar src={user.avatarUrl} alt={name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-medium text-text-primary">
          {name}
        </p>
        {secondary && (
          <p className="mt-0.5 truncate text-[14px] text-text-muted">
            {secondary}
          </p>
        )}
      </div>
    </button>
  );
};

const groupUsers = (users: ChatSearchUser[]) => {
  const recent = users.slice(0, 5);
  const rest = users.slice(5);
  const groups: Array<{ label: string; items: ChatSearchUser[] }> = [];
  if (recent.length > 0) {
    groups.push({ label: "Trò chuyện gần đây", items: recent });
  }
  const byInitial = new Map<string, ChatSearchUser[]>();
  for (const user of rest) {
    const name = user.alias || user.displayName || user.username || "";
    const initial = removeDiacritics(name.trim().charAt(0).toUpperCase()) || "#";
    const label = /^[A-Z]$/.test(initial) ? initial : "#";
    byInitial.set(label, [...(byInitial.get(label) ?? []), user]);
  }
  for (const label of Array.from(byInitial.keys()).sort()) {
    groups.push({ label, items: byInitial.get(label) ?? [] });
  }
  return groups;
};

const removeDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
