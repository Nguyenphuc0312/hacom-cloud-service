import React from "react";
import clsx from "clsx";
import { SpeakerXMarkIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import type { Conversation } from "../../types";
import { RoomType } from "../../types";
import { formatRelativeTime } from "../../utils/formatTime";
import { getMessagePreview } from "../../utils/messageHelpers";

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  currentUserId,
  isActive,
  onClick,
  className,
}) => {
  const otherParticipant =
    conversation.type === RoomType.PRIVATE ||
    conversation.type === RoomType.DIRECT
      ? (conversation.participants || []).find((p) => p.id !== currentUserId)
      : null;

  const status = otherParticipant?.status;
  const lastMessage = conversation.lastMessage;
  const preview = getMessagePreview(lastMessage, currentUserId);
  const timeStr = lastMessage
    ? formatRelativeTime(new Date(lastMessage.createdAt))
    : "";
  const isOwnLastMessage = lastMessage?.senderId === currentUserId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150",
        "min-h-16",
        "hover:bg-gray-100",
        isActive && "bg-telegram-primary/10 hover:bg-telegram-primary/15",
        conversation.isPinned && !isActive && "bg-gray-50",
        className,
      )}
      role="option"
      aria-selected={isActive}
    >
      {/* Avatar */}
      <Avatar
        src={conversation.avatar}
        alt={conversation.name || otherParticipant?.displayName || "Conversation"}
        size="lg"
        status={status}
        showStatus={
          conversation.type === RoomType.PRIVATE ||
          conversation.type === RoomType.DIRECT
        }
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: Name and time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={clsx(
                "font-semibold text-gray-900 truncate",
                conversation.unreadCount > 0 && "text-black",
              )}
            >
              {conversation.name || otherParticipant?.displayName || "Cuoc tro chuyen"}
            </span>

            {/* Icons */}
            {conversation.isMuted && (
              <SpeakerXMarkIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
            {conversation.isPinned && (
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16 4a1 1 0 00-1.5-.87l-4 2.25A1 1 0 0010 5.5v6.19l-4.15 2.4A1 1 0 006 16v1a1 1 0 001 1h4v4a1 1 0 102 0v-4h4a1 1 0 001-1v-1a1 1 0 00-.15-.52L14 13.08V5.5a1 1 0 00-.5-.13l4-2.25A1 1 0 0016 4z" />
              </svg>
            )}
            {otherParticipant?.isBot === false && (
              <CheckCircleIcon className="w-4 h-4 text-telegram-primary flex-shrink-0" />
            )}
          </div>

          <span
            className={clsx(
              "text-xs flex-shrink-0",
              conversation.unreadCount > 0
                ? "text-telegram-primary font-medium"
                : "text-gray-500",
            )}
          >
            {timeStr}
          </span>
        </div>

        {/* Bottom row: Preview and badge */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {/* Sender indicator for own messages */}
            {isOwnLastMessage && lastMessage && (
              <span className="text-sm text-gray-400">Bạn:</span>
            )}

            {/* Message preview */}
            <span
              className={clsx(
                "text-sm truncate",
                conversation.unreadCount > 0
                  ? "text-gray-700 font-medium"
                  : "text-gray-500",
              )}
            >
              {preview}
            </span>
          </div>

          {/* Unread badge */}
          {conversation.unreadCount > 0 && (
            <Badge
              count={conversation.unreadCount}
              variant={conversation.isMuted ? "muted" : "primary"}
              size="sm"
            />
          )}
        </div>
      </div>
    </button>
  );
};

export default ConversationItem;
