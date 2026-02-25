import React from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  UserIcon,
  BellIcon,
  PhotoIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import type { UserSummary } from "../../types";
import { UserStatus } from "../../types";

interface UserProfileProps {
  user: UserSummary;
  onClose: () => void;
  className?: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onClose,
  className,
}) => {
  const statusText =
    user.status === UserStatus.ONLINE ? "Đang hoạt động" : "Ngoại tuyến";

  return (
    <div className={clsx("flex flex-col h-full bg-surface", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-text-primary">Thông tin người dùng</h3>
        <button type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-surface-overlay transition-colors"
          aria-label="Đóng"
        >
          <XMarkIcon className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile section */}
        <div className="flex flex-col items-center py-6 px-4">
          <Avatar
            src={user.avatar}
            alt={user.displayName || user.username}
            size="xl"
            status={user.status}
            showStatus
          />

          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold text-text-primary">
                {user.displayName || user.username}
              </h2>
            </div>

            <p className="text-sm text-text-muted mt-1">@{user.username}</p>

            <p
              className={clsx(
                "text-sm mt-1",
                user.status === UserStatus.ONLINE
                  ? "text-chat-online"
                  : "text-text-muted",
              )}
            >
              {statusText}
            </p>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Info items */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <UserIcon className="w-5 h-5 text-text-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary">@{user.username}</p>
              <p className="text-xs text-text-muted">Tên người dùng</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Settings */}
        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-text-muted" />
              <span className="text-sm text-text-primary">Thông báo</span>
            </div>
            <div className="w-10 h-6 bg-primary rounded-full relative">
              <div className="absolute right-1 top-1 w-4 h-4 bg-surface rounded-full shadow" />
            </div>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Media section */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <PhotoIcon className="w-5 h-5 text-text-muted" />
            <span className="text-sm text-text-primary">
              Phương tiện, Tệp, Liên kết
            </span>
            <span className="ml-auto text-sm text-text-muted">24</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer">
            <MagnifyingGlassIcon className="w-5 h-5 text-text-muted" />
            <span className="text-sm text-text-primary">
              Tìm kiếm trong cuộc trò chuyện
            </span>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Danger zone */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <NoSymbolIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">Chặn người dùng</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <ExclamationTriangleIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">Báo cáo</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-danger/10 transition-colors cursor-pointer">
            <TrashIcon className="w-5 h-5 text-danger" />
            <span className="text-sm text-danger">Xóa cuộc trò chuyện</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;





