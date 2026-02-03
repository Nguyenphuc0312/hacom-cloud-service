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
    <div className={clsx("flex flex-col h-full bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Thông tin người dùng</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Đóng"
        >
          <XMarkIcon className="w-5 h-5 text-gray-500" />
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
              <h2 className="text-xl font-semibold text-gray-900">
                {user.displayName || user.username}
              </h2>
            </div>

            <p className="text-sm text-gray-500 mt-0.5">@{user.username}</p>

            <p
              className={clsx(
                "text-sm mt-1",
                user.status === UserStatus.ONLINE
                  ? "text-chat-online"
                  : "text-gray-500",
              )}
            >
              {statusText}
            </p>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Info items */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <UserIcon className="w-5 h-5 text-gray-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">@{user.username}</p>
              <p className="text-xs text-gray-500">Tên người dùng</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Settings */}
        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-900">Thông báo</span>
            </div>
            <div className="w-10 h-6 bg-telegram-primary rounded-full relative">
              <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Media section */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <PhotoIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-900">
              Phương tiện, Tệp, Liên kết
            </span>
            <span className="ml-auto text-sm text-gray-500">24</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-900">
              Tìm kiếm trong cuộc trò chuyện
            </span>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Danger zone */}
        <div className="py-2">
          <div className="flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors cursor-pointer">
            <NoSymbolIcon className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-500">Chặn người dùng</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors cursor-pointer">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-500">Báo cáo</span>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors cursor-pointer">
            <TrashIcon className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-500">Xóa cuộc trò chuyện</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
