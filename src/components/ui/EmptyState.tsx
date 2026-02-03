/**
 * @fileoverview Empty State components
 * Hiển thị khi không có dữ liệu
 */

import React from "react";
import clsx from "clsx";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  InboxIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "outline";
  };
  className?: string;
}

/**
 * Generic empty state component
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className,
      )}
    >
      {/* Icon */}
      {icon && <div className="w-20 h-20 mb-4 text-gray-300">{icon}</div>}

      {/* Title */}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>
      )}

      {/* Action button */}
      {action && (
        <Button variant={action.variant || "primary"} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

/**
 * Empty conversations state
 */
export const EmptyConversations: React.FC<{
  onNewChat?: () => void;
}> = ({ onNewChat }) => {
  return (
    <EmptyState
      icon={<ChatBubbleLeftRightIcon className="w-full h-full" />}
      title="Chưa có cuộc trò chuyện"
      description="Bắt đầu cuộc trò chuyện mới để kết nối với bạn bè và đồng nghiệp"
      action={
        onNewChat
          ? {
              label: "Bắt đầu trò chuyện",
              onClick: onNewChat,
            }
          : undefined
      }
    />
  );
};

/**
 * Empty messages state
 */
export const EmptyMessages: React.FC = () => {
  return (
    <EmptyState
      icon={<InboxIcon className="w-full h-full" />}
      title="Chưa có tin nhắn"
      description="Gửi tin nhắn đầu tiên để bắt đầu cuộc trò chuyện"
    />
  );
};

/**
 * Empty search results state
 */
export const EmptySearchResults: React.FC<{
  query?: string;
  onClear?: () => void;
}> = ({ query, onClear }) => {
  return (
    <EmptyState
      icon={<MagnifyingGlassIcon className="w-full h-full" />}
      title="Không tìm thấy kết quả"
      description={
        query
          ? `Không tìm thấy kết quả phù hợp với "${query}". Thử từ khóa khác.`
          : "Không tìm thấy kết quả. Thử từ khóa khác."
      }
      action={
        onClear
          ? {
              label: "Xóa tìm kiếm",
              onClick: onClear,
              variant: "outline",
            }
          : undefined
      }
    />
  );
};

/**
 * Empty members state
 */
export const EmptyMembers: React.FC = () => {
  return (
    <EmptyState
      icon={<UserGroupIcon className="w-full h-full" />}
      title="Chưa có thành viên"
      description="Thêm thành viên vào nhóm để bắt đầu"
    />
  );
};

/**
 * Error state
 */
export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({
  title = "Đã xảy ra lỗi",
  message = "Không thể tải dữ liệu. Vui lòng thử lại.",
  onRetry,
}) => {
  return (
    <EmptyState
      icon={<ExclamationTriangleIcon className="w-full h-full text-red-300" />}
      title={title}
      description={message}
      action={
        onRetry
          ? {
              label: "Thử lại",
              onClick: onRetry,
              variant: "primary",
            }
          : undefined
      }
    />
  );
};

/**
 * No chat selected state
 */
interface NoChatSelectedProps {
  onNewChat?: () => void;
}

export const NoChatSelected: React.FC<NoChatSelectedProps> = ({
  onNewChat,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-chat-background text-gray-500 p-6">
      <div className="w-32 h-32 mb-6 text-gray-300">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-medium text-gray-700 mb-2">
        Chọn một cuộc trò chuyện
      </h2>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-4">
        Chọn một cuộc hội thoại từ danh sách bên trái hoặc bắt đầu cuộc trò
        chuyện mới
      </p>
      {onNewChat && (
        <button
          onClick={onNewChat}
          className="px-4 py-2 bg-telegram-primary text-white rounded-lg hover:bg-telegram-primary/90 transition-colors"
        >
          Bắt đầu trò chuyện mới
        </button>
      )}
    </div>
  );
};

export default EmptyState;
