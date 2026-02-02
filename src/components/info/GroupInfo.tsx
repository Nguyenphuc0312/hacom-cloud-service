import React, { useState } from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  PencilIcon,
  BellIcon,
  PhotoIcon,
  UserPlusIcon,
  ExclamationTriangleIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import type { Conversation } from "../../types";

interface GroupInfoProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
  className?: string;
}

export const GroupInfo: React.FC<GroupInfoProps> = ({
  conversation,
  currentUserId,
  onClose,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<"members" | "media" | "files">(
    "members",
  );

  const isAdmin = false; // In real app, check if current user is admin

  return (
    <div className={clsx("flex flex-col h-full bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Thông tin nhóm</h3>
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
        {/* Group profile */}
        <div className="flex flex-col items-center py-6 px-4">
          <Avatar src={conversation.avatar} alt={conversation.name} size="xl" />

          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2 justify-center">
              {conversation.name}
              {isAdmin && (
                <button className="p-1 hover:bg-gray-100 rounded-full">
                  <PencilIcon className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              {conversation.participants.length} thành viên
            </p>
          </div>

          {conversation.description && (
            <p className="mt-3 text-sm text-gray-600 text-center">
              {conversation.description}
            </p>
          )}
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Actions */}
        <div className="py-2">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <BellIcon className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-900">Thông báo</span>
            </div>
            <div
              className={clsx(
                "w-10 h-6 rounded-full relative",
                conversation.isMuted ? "bg-gray-300" : "bg-telegram-primary",
              )}
            >
              <div
                className={clsx(
                  "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all",
                  conversation.isMuted ? "left-1" : "right-1",
                )}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: "members", label: "Thành viên" },
            { id: "media", label: "Phương tiện" },
            { id: "files", label: "Tệp" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-telegram-primary border-b-2 border-telegram-primary"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="py-2">
          {activeTab === "members" && (
            <>
              {/* Add member button */}
              <button className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-telegram-primary">
                <UserPlusIcon className="w-5 h-5" />
                <span className="text-sm font-medium">Thêm thành viên</span>
              </button>

              {/* Members list */}
              {conversation.participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Avatar
                    src={participant.avatar}
                    alt={`${participant.firstName} ${participant.lastName || ""}`}
                    size="md"
                    status={participant.status}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {participant.firstName} {participant.lastName}
                      {participant.id === currentUserId && (
                        <span className="ml-2 text-xs text-gray-500">
                          (Bạn)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      @{participant.username}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}

          {activeTab === "media" && (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center"
                  >
                    <PhotoIcon className="w-8 h-8 text-gray-300" />
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-2 text-sm text-telegram-primary font-medium hover:bg-gray-50 rounded-lg">
                Xem tất cả phương tiện
              </button>
            </div>
          )}

          {activeTab === "files" && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Chưa có tệp được chia sẻ
            </div>
          )}
        </div>

        <div className="h-px bg-gray-200 mx-4" />

        {/* Danger zone */}
        <div className="py-2">
          <button className="w-full flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors text-red-500">
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="text-sm">Báo cáo nhóm</span>
          </button>

          <button className="w-full flex items-center gap-4 px-4 py-3 hover:bg-red-50 transition-colors text-red-500">
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            <span className="text-sm">Rời nhóm</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupInfo;
